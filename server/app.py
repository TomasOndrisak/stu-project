import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import paho.mqtt.client as mqtt
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
from database import get_history_by_range 


import database

# Load .env
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# Config
MQTT_HOST       = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT       = int(os.getenv("MQTT_PORT", 1883))
TOPIC_TELEMETRY = os.getenv("TOPIC_TELEMETRY", "arduino/telemetry")
TOPIC_COMMAND   = os.getenv("TOPIC_COMMAND", "arduino/command")
FLASK_HOST      = os.getenv("FLASK_HOST", "0.0.0.0")
FLASK_PORT      = int(os.getenv("FLASK_PORT", 5000))
FLASK_DEBUG     = os.getenv("FLASK_DEBUG", "false").lower() == "true"
TOPIC_ALERT = os.getenv("TOPIC_ALERT", "arduino/alert")

# Logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
log = logging.getLogger(__name__)

# Flask app setup
FRONTEND_DIR  = Path(__file__).parent.parent / "frontend"
TEMPLATES_DIR = FRONTEND_DIR / "templates"
STATIC_DIR    = FRONTEND_DIR / "static"

app = Flask(
    __name__,
    template_folder=str(TEMPLATES_DIR),
    static_folder=str(STATIC_DIR),
    static_url_path="/static",
)

# MQTT instnace
mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)

# ---------------------------------------------------------------------------
#   off -> system is deactivated nothing is beign sent
#   Open: Connected but still not writing data to database
#   Start: Data is being written to database, system is active 
# ---------------------------------------------------------------------------
SYSTEM_OFF     = "off"
SYSTEM_READY   = "ready"
SYSTEM_RUNNING = "running"

system = {
    "state": SYSTEM_OFF,
    "session_started_at": None,
}

latest_telemetry: dict | None = None

# Telemetry mapping
def _normalize_telemetry(data: dict) -> dict:
    return {
        "cold":          data.get("cold"),
        "warm":          data.get("warm"),
        "setpoint":      data.get("setpoint"),
        "error":         data.get("error"),
        "p_term":        data.get("P_term"),
        "i_term":        data.get("I_term"),
        "d_term":        data.get("D_term"),
        "peltier_pwm":   data.get("peltier_pwm"),
        "pump_pwm":      data.get("pump_pwm"),
        "heater_pwm":    data.get("heater_pwm"),
        "resistance":    data.get("resistance"),
        "pump_from_pot": bool(data.get("pump_from_pot")),
        "flow_rate":     data.get("flow_rate_lpm"),
        "total_ml":      data.get("total_ml"),
        "timestamp":     datetime.now(timezone.utc).isoformat(),
    }


def _publish_command(payload: dict) -> None:
    mqtt_client.publish(TOPIC_COMMAND, json.dumps(payload))
    log.info("Command sent: %s", payload)

# MQTT callback after connecting to the broker. Subscribes to mqtt topics.
def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        log.info("MQTT connected, subscribing to %s", TOPIC_TELEMETRY)
        client.subscribe(TOPIC_TELEMETRY)
        log.info("Subscribed to %s", TOPIC_COMMAND)
        
        log.info("MQTT connected, subscribing to %s", TOPIC_ALERT)
        client.subscribe(TOPIC_ALERT)
        log.info("Subscribed to %s", TOPIC_ALERT)

    else:
        log.error("MQTT connection failed, rc=%s", rc)

# MQTT callback after receiving a message. Parses JSON and saves to DB.
def on_message(client, userdata, msg):
    global latest_alert, latest_telemetry
    try:
        data = json.loads(msg.payload.decode())

        if msg.topic == TOPIC_ALERT:
            latest_alert = data
            log.warning("Alert received at: %s", data)
            return

        if system["state"] == SYSTEM_OFF:
            return

        latest_telemetry = _normalize_telemetry(data)

        if system["state"] == SYSTEM_RUNNING:
            database.insert_measurement(data)
            log.info("Saved: cold=%s warm=%s peltier_pwm=%s",
                     data.get("cold"), data.get("warm"), data.get("peltier_pwm"))
    except json.JSONDecodeError:
        log.warning("Invalid JSON: %s", msg.payload)
    except Exception as e:
        log.error("Error processing message: %s", e)

mqtt_client.on_connect = on_connect
mqtt_client.on_message = on_message

latest_alert: dict | None = None

# GET
# Default route to homepage
@app.route("/")
def dashboard():
    return render_template("dashboard.html")


# API endpoint to get the latest measurement as JSON.
@app.route("/api/current")
def api_current():
    # System deactivated
    if system["state"] == SYSTEM_OFF:
        return jsonify({"error": "system off", "state": SYSTEM_OFF}), 409
    # Live values from memory (even in 'ready' state, without writing to DB).
    if latest_telemetry:
        return jsonify(latest_telemetry)
    # Fallback after startup, until the first telemetry arrives.
    data = database.get_latest()
    if not data:
        return jsonify({"error": "no data"}), 404
    return jsonify(data)

# API endpoint to get historical data for the last N minutes. Returns JSON list. Default range is 24 hours
@app.route("/api/history")
def api_history():
    minutes = request.args.get("minutes", type=int)
    if minutes is None:
        hours = request.args.get("hours", default=24, type=int)
        minutes = hours * 60
    minutes = max(1, min(minutes, 168 * 60))  
    return jsonify(database.get_history(minutes))

# POST
# API endpoint to send a command to Arduino through MQTT arduino/command.
# allowed keys: pumpPWM, heaterPWM, setpoint, Kp, Ki, Kd, reset.
@app.route("/api/command", methods=["POST"])
def api_command():
    if system["state"] == SYSTEM_OFF:
        return jsonify({"error": "system is closed, press Open first"}), 409

    payload = request.get_json()

    allowed = {"pumpPWM", "heaterPWM", "setpoint", "Kp", "Ki", "Kd", "reset"}
    if not payload or not set(payload.keys()).issubset(allowed):
        return jsonify({"error": "invalid command"}), 400

    msg = json.dumps(payload)
    mqtt_client.publish(TOPIC_COMMAND, msg)
    log.info("Command sent: %s", msg)
    return jsonify({"status": "ok"})

@app.route("/api/alert")
def api_alert():
    global latest_alert
    if not latest_alert:
        return jsonify(None), 204
    alert = latest_alert
    latest_alert = None
    return jsonify(alert)


# Actual system state
@app.route("/api/system/state")
def api_system_state():
    return jsonify(system)


# Open state
@app.route("/api/system/open", methods=["POST"])
def api_system_open():
    if system["state"] != SYSTEM_OFF:
        return jsonify({"error": "already open", **system}), 409
    _publish_command({"activate": 1})
    system["state"] = SYSTEM_READY
    log.info("System OPEN -> ready")
    return jsonify(system)


# Ready
@app.route("/api/system/start", methods=["POST"])
def api_system_start():
    if system["state"] != SYSTEM_READY:
        return jsonify({"error": "not ready (press Open first)", **system}), 409
    system["state"] = SYSTEM_RUNNING
    system["session_started_at"] = datetime.now(timezone.utc).isoformat()
    log.info("System START -> running")
    return jsonify(system)


# Stop
@app.route("/api/system/stop", methods=["POST"])
def api_system_stop():
    if system["state"] != SYSTEM_RUNNING:
        return jsonify({"error": "not running", **system}), 409
    system["state"] = SYSTEM_READY
    system["session_started_at"] = None
    log.info("System STOP -> ready")
    return jsonify(system)


# Close
@app.route("/api/system/close", methods=["POST"])
def api_system_close():
    _publish_command({"pumpPWM": 0})
    _publish_command({"heaterPWM": 0})
    _publish_command({"reset": 1})
    _publish_command({"activate": 0})
    system["state"] = SYSTEM_OFF
    system["session_started_at"] = None
    log.info("System CLOSE -> off (safe state)")
    return jsonify(system)

# History tab
@app.route('/history')
def history_page():
    return render_template('history.html')

# Api endpoint to get historical data for a custom date range
@app.route('/api/history/range', methods=['GET'])
def get_history_range():
    start = request.args.get('start')  
    end = request.args.get('end')      
    
    if not start or not end:
        return jsonify({"error": "Parameter 'start' or 'end' is missing"}), 400
    
    try:
        data = get_history_by_range(start, end)
        return jsonify(data)
        
    except Exception as e:
        return jsonify({"error": f"Error reading from database: {str(e)}"}), 500


# App startup
def main():
    log.info("Initializing database...")
    database.init_db()

    log.info("Connecting to MQTT broker %s:%s...", MQTT_HOST, MQTT_PORT)
    mqtt_client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
    mqtt_client.loop_start()

    log.info("Starting Flask on %s:%s", FLASK_HOST, FLASK_PORT)
    app.run(host=FLASK_HOST, port=FLASK_PORT, debug=FLASK_DEBUG)


if __name__ == "__main__":
    main()