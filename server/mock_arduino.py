import paho.mqtt.client as mqtt
import json
import time
import math
import random

# Config
MQTT_HOST  = "localhost"
MQTT_PORT  = 1883
MQTT_TOPIC = "arduino/telemetry"

# Broker connection
client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
client.connect(MQTT_HOST, MQTT_PORT)
client.loop_start()

# State of the simulated system
t = 0
setpoint = 22.0
pump_pwm = 128
heater_pwm = 50

print("Mock sender started")
print("Stop: Ctrl+C\n")

try:
    while True:
        cold = 18.0 + math.sin(t * 0.1) * 2.0 + random.uniform(-0.2, 0.2)
        warm = 34.0 + math.cos(t * 0.1) * 3.0 + random.uniform(-0.2, 0.2)

        error = setpoint - cold
        peltier_pwm = max(0, min(255, int(abs(error) * 50)))

        payload = {
            "cold":           round(cold, 1),
            "warm":           round(warm, 1),
            "setpoint":       setpoint,
            "peltier_pwm":    peltier_pwm,
            "pump_pwm":       pump_pwm,
            "heater_pwm":     heater_pwm,
            "resistance":     random.randint(400, 600),
            "pump_from_pot":  False,
            "ts":             int(time.time())
        }

        msg = json.dumps(payload)
        client.publish(MQTT_TOPIC, msg)
        print(f"→ {msg}")

        t += 1
        time.sleep(1)

except KeyboardInterrupt:
    print("\Stopping...")
    client.loop_stop()
    client.disconnect()
