"""Validate full booking-hold D1 SQL with production-shaped 25-table schema.
No actual customer rows; not deployed to Cloudflare or connected to Stripe.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Barrier
import sqlite3
import re

ROOT=Path(__file__).resolve().parents[1]
SCHEMA=(ROOT/"migrations/0001_neon_schema_draft.sql").read_text()
SQL=(ROOT/"booking/atomic-booking-hold-full.sql").read_text()
# Python 3.14 discourages binding sequences to numbered ?NNN placeholders.
# The translated named bindings have the same semantics as the D1 ordered SQL.
PYSQL=re.sub(r"\\?(\\d+)",lambda m: ":v"+m.group(1),SQL)
DATE="2026-10-25"
NOW="2026-10-18T07:00:00.000Z"
TODAY="2026-10-18"
def args(pid,service="track_day_support"):
    return (
      pid,service,"full_day",DATE,"Example Person","example@test.invalid",
      "01234567890",None,None,None,None,"2026-10-18T07:20:00.000Z",
      51500,51500,0,None,None,None,0,None,0,None,
      "2026-10-07-v10",NOW,"Example Person",'[{"type":"booking","version":"2026-10-07-v10"}]',
      None,NOW,TODAY
    )
def fresh():
    db=sqlite3.connect(":memory:")
    db.executescript(SCHEMA)
    return db
def reserve(db,pid,service="track_day_support"):
    return db.execute(PYSQL,{f"v{i+1}":v for i,v in enumerate(args(pid,service))}).fetchone()
def test_fields_and_preexisting_busy():
    db=fresh()
    first=reserve(db,"bk_1234567890abcdef")
    assert first and first[0]=="bk_1234567890abcdef"
    row=db.execute("""SELECT booking_payment_amount,amount_total,balance_amount,
      customer_email,terms_version,terms_accepted_at,status
      FROM bookings WHERE public_id=?""",(first[0],)).fetchone()
    assert row==(51500,51500,0,"example@test.invalid","2026-10-07-v10",NOW,"hold"),row
    assert reserve(db,"bk_abcdef1234567890") is None
    db.close()
def test_global_and_service_block():
    db=fresh()
    db.execute("INSERT INTO availability_blocks(block_date,service_id,label) VALUES (?,?,?)",(DATE,"track_day_support","unavailable"))
    assert reserve(db,"bk_a1234567890abcde") is None
    # Existing service-specific blocking is not the same as a global date block.
    assert reserve(db,"bk_b1234567890abcde","vehicle_hire_day") is not None
    db.close()
    db=fresh()
    db.execute("INSERT INTO availability_blocks(block_date,service_id,label) VALUES (?,?,?)",(DATE,None,"closed"))
    assert reserve(db,"bk_c1234567890abcde","vehicle_hire_day") is None
    db.close()
def test_closure():
    db=fresh()
    db.execute("INSERT INTO business_availability_settings(id,start_date,end_date) VALUES (1,?,?)",(DATE,DATE))
    assert reserve(db,"bk_1234567890abcdeg") is None
    db.close()
def test_concurrency():
    with TemporaryDirectory() as temp:
        path=str(Path(temp)/"test.sqlite")
        db=sqlite3.connect(path)
        db.execute("PRAGMA journal_mode=WAL")
        db.executescript(SCHEMA)
        db.close()
        gate=Barrier(10)
        def contender(i):
            conn=sqlite3.connect(path, timeout=10, isolation_level=None)
            conn.execute("PRAGMA busy_timeout=10000")
            try:
                gate.wait(timeout=10)
                return reserve(conn,"bk_"+str(i).zfill(18))
            finally:
                conn.close()
        with ThreadPoolExecutor(max_workers=10) as pool:
            results=list(pool.map(contender,range(10)))
        assert sum(r is not None for r in results)==1,results
if __name__=="__main__":
    for t in (test_fields_and_preexisting_busy,test_global_and_service_block,test_closure,test_concurrency):
        t();print("PASS:",t.__name__)
