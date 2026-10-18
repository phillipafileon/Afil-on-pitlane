"""Staging-only SQLite proof that atomic hold conditions are internally consistent.
No live Cloudflare or customer data is used. D1 concurrency must still be tested
separately before production cutover.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Barrier
import sqlite3
import re

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = (ROOT / "migrations/0001_neon_schema_draft.sql").read_text()
SQL = (ROOT / "prototypes/atomic-booking-hold.sql").read_text()
PYSQL = re.sub(r"\?(\d+)", lambda m: ":v"+m.group(1), SQL)
UTC_NOW = "2026-10-18T12:00:00.000Z"
UK_TODAY = "2026-10-18"
DATE = "2026-10-20"
HOLD_EXPIRY = "2026-10-18T12:20:00.000Z"

def args(id, service="track_day_support", date=DATE):
    return (id, service, "full_day", date, "Test Customer", "example@test.invalid",
            "01000000000", HOLD_EXPIRY, UTC_NOW, UK_TODAY, "staging-test")

def fresh():
    db = sqlite3.connect(":memory:")
    db.executescript(SCHEMA)
    return db

def reserve(db, id, service="track_day_support", date=DATE):
    row = db.execute(SQL, args(id,service,date)).fetchone()
    return row[0] if row else None

def test_no_double_hold():
    db = fresh()
    assert reserve(db, "test_a") == "test_a"
    assert reserve(db, "test_b") is None
    assert db.execute("SELECT COUNT(*) FROM bookings").fetchone()[0] == 1
    db.close()

def test_expired_hold_can_be_replaced():
    db = fresh()
    db.execute("""INSERT INTO bookings(public_id,service_id,booking_date,status,hold_expires_at)
                VALUES('expired','track_day_support',?,'hold','2026-10-18T11:00:00.000Z')""",(DATE,))
    assert reserve(db,"new_hold") == "new_hold"
    db.close()

def test_paid_and_manual_due_block():
    for balance in ("invoiced","payment_failed","manual_due"):
        db = fresh()
        db.execute("""INSERT INTO bookings(public_id,service_id,booking_date,status,balance_status)
                    VALUES('other','vehicle_hire_day',?,'cancelled',?)""",(DATE,balance))
        assert reserve(db,"candidate") is None, balance
        db.close()

def test_blocks_are_scoped_and_global():
    db=fresh()
    db.execute("INSERT INTO availability_blocks(block_date,service_id,label) VALUES(?,?,'Test')",
               (DATE,"vehicle_hire_day"))
    assert reserve(db,"allowed") == "allowed"
    assert reserve(db,"denied") is None  # same date now occupied
    db.close()
    db=fresh()
    for sid in ("vehicle_hire_day","track_day_support","vehicle_transport"):
        db.execute("INSERT INTO availability_blocks(block_date,service_id,label) VALUES(?,?,'Test')",(DATE,sid))
    assert reserve(db,"candidate","pre_track_inspection") is None
    db.close()

def test_business_closure_rejects_now_and_target_date():
    db=fresh()
    db.execute("""INSERT INTO business_availability_settings(id,start_date,end_date)
                VALUES(1,'2026-10-20','2026-10-21')""")
    assert reserve(db,"closed_target") is None
    db.execute("UPDATE business_availability_settings SET start_date='2026-10-18',end_date='2026-10-19' WHERE id=1")
    assert reserve(db,"closed_today") is None
    db.close()

def test_parallel_inserts_are_single_winner():
    with TemporaryDirectory() as tmp:
        path=str(Path(tmp)/"staging.sqlite")
        db=sqlite3.connect(path)
        db.execute("PRAGMA journal_mode=WAL")
        db.executescript(SCHEMA)
        db.close()
        barrier=Barrier(10)
        def attempt(i):
            db=sqlite3.connect(path,timeout=10,isolation_level=None)
            db.execute("PRAGMA busy_timeout=10000")
            try:
                barrier.wait(timeout=10)
                return reserve(db, "hold_"+str(i))
            finally:
                db.close()
        with ThreadPoolExecutor(max_workers=10) as pool:
            winners=list(pool.map(attempt,range(10)))
        assert sum(x is not None for x in winners)==1,winners
        db=sqlite3.connect(path)
        assert db.execute("SELECT COUNT(*) FROM bookings").fetchone()[0]==1
        db.close()

if __name__=="__main__":
    for test in (test_no_double_hold,test_expired_hold_can_be_replaced,
                 test_paid_and_manual_due_block,test_blocks_are_scoped_and_global,
                 test_business_closure_rejects_now_and_target_date,test_parallel_inserts_are_single_winner):
        test()
        print("PASS:",test.__name__)
