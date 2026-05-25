import json
import logging
import os
import sys
from pathlib import Path

import paho.mqtt.client as mqtt
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request

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

# MQTT callback after connecting to the broker. Subscribes to telemetry topic.
def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        log.info("MQTT connected, subscribing to %s", TOPIC_TELEMETRY)
        client.subscribe(TOPIC_TELEMETRY)
    else:
        log.error("MQTT connection failed, rc=%s", rc)

# MQTT callback after receiving a message. Parses JSON and saves to DB.
def on_message(client, userdata, msg):
    try:
        data = json.loads(msg.payload.decode())
        database.insert_measurement(data)
        log.info("Saved: cold=%s warm=%s peltier_pwm=%s",
                 data.get("cold"), data.get("warm"), data.get("peltier_pwm"))
    except json.JSONDecodeError:
        log.warning("Invalid JSON: %s", msg.payload)
    except Exception as e:
        log.error("Error processing message: %s", e)

mqtt_client.on_connect = on_connect
mqtt_client.on_message = on_message

# GET
# Default route to homepage
@app.route("/")
def dashboard():
    return render_template("dashboard.html")


# API endpoint to get the latest measurement as JSON.
@app.route("/api/current")
def api_current():
    data = database.get_latest()
    if not data:
        return jsonify({"error": "no data"}), 404
    return jsonify(data)

# API endpoint to get historical data for the last N hours. Returns JSON list. Default range is 24 hours
@app.route("/api/history")
def api_history():
    hours = request.args.get("hours", default=24, type=int)
    hours = max(1, min(hours, 168))
    return jsonify(database.get_history(hours))

# POST
# API endpoint to send a command to Arduino through MQTT arduino/command.
# allowed keys: pumpPWM, heaterPWM, setpoint, Kp, Ki, Kd, reset.
@app.route("/api/command", methods=["POST"])
def api_command():
    payload = request.get_json()

    allowed = {"pumpPWM", "heaterPWM", "setpoint", "Kp", "Ki", "Kd", "reset"}
    if not payload or not set(payload.keys()).issubset(allowed):
        return jsonify({"error": "invalid command"}), 400

    msg = json.dumps(payload)
    mqtt_client.publish(TOPIC_COMMAND, msg)
    log.info("Command sent: %s", msg)
    return jsonify({"status": "ok"})


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