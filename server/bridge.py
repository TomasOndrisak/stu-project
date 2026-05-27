import json
import logging
import os
import sys
import time
from pathlib import Path

import paho.mqtt.client as mqtt
import serial
from dotenv import load_dotenv

# Load .env
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# Config
SERIAL_PORT     = os.getenv("SERIAL_PORT", "COM3")  # Linux: /dev/ttyACM0 or /dev/ttyUSB0
SERIAL_BAUD     = int(os.getenv("SERIAL_BAUD", 9600))
MQTT_HOST       = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT       = int(os.getenv("MQTT_PORT", 1883))
TOPIC_TELEMETRY = os.getenv("TOPIC_TELEMETRY", "arduino/telemetry")
TOPIC_COMMAND   = os.getenv("TOPIC_COMMAND", "arduino/command")
RECONNECT_DELAY = int(os.getenv("RECONNECT_DELAY", 5))
TOPIC_ALERT = os.getenv("TOPIC_ALERT", "arduino/alert")
ALERT_ERROR_THRESHOLD = float(os.getenv("ALERT_ERROR_THRESHOLD", "5.0"))

# Logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
log = logging.getLogger(__name__)


# MQTT client
mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
ser = None  # Serial port initialized in main()
mqtt_client.reconnect_delay_set(min_delay=1, max_delay=30)

# After connecting to MQTT broker, subscribe to command topic
def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        log.info("MQTT connected, subscribing to %s", TOPIC_COMMAND)
        client.subscribe(TOPIC_COMMAND)
    else:
        log.error("MQTT connection failed, rc=%s", rc)

def on_disconnect(client, userdata, disconnect_flags, rc, properties=None):
    if rc != 0:
        log.warning("MQTT disconnected unexpectedly rc=%s, reconnecting...", rc)

# Command from backend send to Arduino via Serial
def on_message(client, userdata, msg):
    global ser
    if ser is None or not ser.is_open:
        log.warning("Serial not available, dropping command")
        return

    try:
        # Send JSON to Arduino, followed by newline as delimiter
        line = msg.payload.decode() + "\n"
        ser.write(line.encode())
        log.info("Command sent to Arduino: %s", line.strip())
    except Exception as e:
        log.error("Failed to write to serial: %s", e)


mqtt_client.on_connect = on_connect
mqtt_client.on_message = on_message
mqtt_client.on_disconnect = on_disconnect


# Serial reconnection logic
def open_serial():
    while True:
        try:
            s = serial.Serial(SERIAL_PORT, SERIAL_BAUD, timeout=2)
            log.info("Serial port opened: %s @ %d baud", SERIAL_PORT, SERIAL_BAUD)
            time.sleep(2)
            s.reset_input_buffer()
            return s
        except serial.SerialException as e:
            log.error("Cannot open %s: %s. Retrying in %ds...", SERIAL_PORT, e, RECONNECT_DELAY)
            time.sleep(RECONNECT_DELAY)

def connect_mqtt():
    while True:
        try:
            mqtt_client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
            return
        except (ConnectionRefusedError, OSError) as e:
            log.error("MQTT connect failed: %s. Retrying in %ds", e, RECONNECT_DELAY)
            time.sleep(RECONNECT_DELAY)

# Check telemetry for alert conditions and publish alert if needed
def check_and_publish_alert(parsed: dict) -> None:
    error = parsed.get("error")
    if error is None:
        return

    if abs(error) > ALERT_ERROR_THRESHOLD:
        payload = json.dumps({
            "type": "setpoint_deviation",
            "error": error,
            "cold": parsed.get("cold"),
            "setpoint": parsed.get("setpoint"),
            "ts": int(time.time()),
        })
        mqtt_client.publish(TOPIC_ALERT, payload)
        log.warning("ALERT published: error=%.3f > threshold=%.1f", error, ALERT_ERROR_THRESHOLD)

def main():
    global ser

    log.info("Starting MISA serial bridge...")
    log.info("Connecting to MQTT broker %s:%s", MQTT_HOST, MQTT_PORT)
    connect_mqtt()
    mqtt_client.loop_start()

    ser = open_serial()

    while True:
        try:
            raw = ser.readline()
            if not raw:
                continue

            line = raw.decode("utf-8", errors="replace").strip()
            if not line:
                continue

            # Validate JSON before publishing to MQTT
            try:
                parsed = json.loads(line)
            except json.JSONDecodeError:
                log.warning("Invalid JSON from Arduino: %s", line)
                continue

            if "cold" not in parsed and "warm" not in parsed:
                log.info("Non-telemetry message from Arduino: %s", line)
                continue

            mqtt_client.publish(TOPIC_TELEMETRY, line)
            check_and_publish_alert(parsed)
            log.info("Published telemetry: %s", line)

        except serial.SerialException as e:
            log.error("Serial error: %s. Reopening...", e)
            try:
                ser.close()
            except Exception:
                pass
            ser = open_serial()

        except KeyboardInterrupt:
            log.info("Shutting down...")
            break

        except Exception as e:
            log.error("Unexpected error: %s", e)
            time.sleep(1)

    ser.close()
    mqtt_client.loop_stop()
    mqtt_client.disconnect()


if __name__ == "__main__":
    main()
