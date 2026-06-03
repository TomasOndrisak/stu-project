import json
import os
import threading
import time

os.environ.setdefault(
    "DB_PATH", os.path.join(os.path.dirname(__file__), "mock_data.db")
)

import app as A
from mock_sim import ThermalSim

ALERT_THRESHOLD = float(os.getenv("ALERT_ERROR_THRESHOLD", "5.0"))
PORT = int(os.getenv("FLASK_PORT", "5000"))

sim = ThermalSim()


class FakeMsg:
    def __init__(self, topic: str, payload: str):
        self.topic = topic
        self.payload = payload.encode()


def fake_publish(topic, payload=None, *args, **kwargs):
    if topic == A.TOPIC_COMMAND and payload:
        try:
            sim.apply_command(json.loads(payload))
        except Exception:
            pass


A.mqtt_client.publish = fake_publish


def sim_loop():
    while True:
        telem = sim.step()
        A.on_message(None, None, FakeMsg(A.TOPIC_TELEMETRY, json.dumps(telem)))
        if abs(telem["error"]) > ALERT_THRESHOLD:
            alert = {
                "type": "setpoint_deviation",
                "error": telem["error"],
                "cold": telem["cold"],
                "setpoint": telem["setpoint"],
                "ts": int(time.time()),
            }
            A.on_message(None, None, FakeMsg(A.TOPIC_ALERT, json.dumps(alert)))
        time.sleep(ThermalSim.T)


def main():
    A.database.init_db()
    threading.Thread(target=sim_loop, daemon=True).start()

    print("MOCK running")
    print(f" Dashboard:  http://localhost:{PORT}")
    print(" Database:   server/mock_data.db")
    print(" Stop:       Ctrl+C")

    A.app.run(host="127.0.0.1", port=PORT, debug=False, use_reloader=False)


if __name__ == "__main__":
    main()