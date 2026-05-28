from datetime import datetime, timezone
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()
DB_PATH = Path(os.getenv("DB_PATH", Path(__file__).parent / "data.db"))


@contextmanager
def get_connection():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
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
                error         REAL,
                p_term        REAL,
                i_term        REAL,
                d_term        REAL,
                peltier_pwm   INTEGER,
                pump_pwm      INTEGER,
                heater_pwm    INTEGER,
                resistance    INTEGER,
                pump_from_pot INTEGER,
                flow_rate     REAL,
                total_ml      REAL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_ts ON measurements(timestamp)")

# Insert one measurement into the DB. The argument is a dict from the MQTT message.
def insert_measurement(data: dict):
    with get_connection() as conn:
        conn.execute("""
            INSERT INTO measurements
                (cold, warm, setpoint, error, p_term, i_term, d_term,
                 peltier_pwm, pump_pwm, heater_pwm, resistance, pump_from_pot, flow_rate, total_ml)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            data.get("cold"),
            data.get("warm"),
            data.get("setpoint"),
            data.get("error"),
            data.get("P_term"),
            data.get("I_term"),
            data.get("D_term"),
            data.get("peltier_pwm"),
            data.get("pump_pwm"),
            data.get("heater_pwm"),
            data.get("resistance"),
            1 if data.get("pump_from_pot") else 0,
            data.get("flow_rate_lpm"),
            data.get("total_ml")
        ))
# Get the latest measurement from the DB. Returns a dict or None if DB is empty.
def get_latest():
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM measurements ORDER BY timestamp DESC LIMIT 1"
        ).fetchone()
        return _normalize_timestamp(dict(row)) if row else None

# Get measurements from the last N minutes. Returns a list of dicts.
def get_history(minutes: int = 1440):
    with get_connection() as conn:
        rows = conn.execute("""
            SELECT * FROM measurements
            WHERE timestamp > datetime('now', ?)
            ORDER BY timestamp ASC
        """, (f"-{minutes} minutes",)).fetchall()
        return [_normalize_timestamp(dict(row)) for row in rows]
    
# SQLite UTC to ISO 8601 with time zone
def _normalize_timestamp(row_dict):
    ts = row_dict.get("timestamp")
    if ts and isinstance(ts, str):
        # SQLite CURRENT_TIMESTAMP returns "YYYY-MM-DD HH:MM:SS" in UTC
        dt = datetime.strptime(ts, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        row_dict["timestamp"] = dt.isoformat()
    return row_dict