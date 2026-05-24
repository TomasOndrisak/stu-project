import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(__file__).parent / "data.db"


@contextmanager
def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()

# DB init, executed once at server startup. Creates the table if it doesn't exist.
def init_db():
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS measurements (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp     DATETIME DEFAULT CURRENT_TIMESTAMP,
                cold          REAL,
                warm          REAL,
                setpoint      REAL,
                peltier_pwm   INTEGER,
                pump_pwm      INTEGER,
                heater_pwm    INTEGER,
                resistance    INTEGER,
                pump_from_pot INTEGER
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_ts ON measurements(timestamp)")

# Insert one measurement into the DB. The argument is a dict from the MQTT message.
def insert_measurement(data: dict):
    with get_connection() as conn:
        conn.execute("""
            INSERT INTO measurements
                (cold, warm, setpoint, peltier_pwm, pump_pwm, heater_pwm, resistance, pump_from_pot)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            data.get("cold"),
            data.get("warm"),
            data.get("setpoint"),
            data.get("peltier_pwm"),
            data.get("pump_pwm"),
            data.get("heater_pwm"),
            data.get("resistance"),
            1 if data.get("pump_from_pot") else 0,
        ))

# Get the latest measurement from the DB. Returns a dict or None if DB is empty.
def get_latest():
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM measurements ORDER BY timestamp DESC LIMIT 1"
        ).fetchone()
        return dict(row) if row else None

# Get measurements from the last N hours. Returns a list of dicts.    
def get_history(hours: int = 24):
    with get_connection() as conn:
        rows = conn.execute("""
            SELECT * FROM measurements
            WHERE timestamp > datetime('now', ?)
            ORDER BY timestamp ASC
        """, (f"-{hours} hours",)).fetchall()
        return [dict(row) for row in rows]