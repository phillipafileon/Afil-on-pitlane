"""Staging-only webhook inbox tests; do not connect to Stripe or live D1."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Barrier
import sqlite3
import re

ROOT=Path(__file__).resolve().parents[1]
SCHEMA=(ROOT/"migrations/0002_webhook_inbox_staging.sql").read_text()
CLAIM=(ROOT/"webhooks/claim-stripe-event.sql").read_text()
DONE=(ROOT/"webhooks/complete-stripe-event.sql").read_text()
def named(sql):
    return re.sub(r"\?(\d+)", lambda m: ":v"+m.group(1), sql)
CLAIM=named(CLAIM)
DONE=named(DONE)
EVENT="evt_1234567890abcdef"
TYPE="checkout.session.completed"
HASH="a"*64
NOW="2026-10-18T08:00:00.000Z"
EXPIRES="2026-10-18T08:01:00.000Z"
LATER="2026-10-18T08:02:00.000Z"
def put(db, token, at=NOW, until=EXPIRES, digest=HASH, event_id=EVENT):
    p=(event_id,TYPE,digest,token,at,until)
    return db.execute(CLAIM,{f"v{i+1}":v for i,v in enumerate(p)}).fetchone()
def finish(db,token,at=NOW):
    return db.execute(DONE,{"v1":EVENT,"v2":token,"v3":at}).fetchone()
def fresh():
    db=sqlite3.connect(":memory:")
    db.executescript(SCHEMA)
    return db
def test_replay_and_mismatch():
    db=fresh()
    assert put(db,"lease_one_123456789") is not None
    assert put(db,"lease_two_123456789") is None
    assert put(db,"lease_two_123456789",LATER,"2026-10-18T08:03:00.000Z","b"*64) is None
    assert db.execute("SELECT attempt_count FROM stripe_webhook_inbox").fetchone()==(1,)
    assert finish(db,"lease_other_123456789") is None
    assert finish(db,"lease_one_123456789") is not None
    assert put(db,"lease_three_123456789",LATER,"2026-10-18T08:03:00.000Z") is None
    db.close()
def test_expired_claim_and_stale_completer():
    db=fresh()
    assert put(db,"lease_one_123456789") is not None
    assert put(db,"lease_two_123456789",LATER,"2026-10-18T08:03:00.000Z") is not None
    assert finish(db,"lease_one_123456789",LATER) is None
    assert finish(db,"lease_two_123456789",LATER) is not None
    assert db.execute("SELECT attempt_count FROM stripe_webhook_inbox").fetchone()==(2,)
    db.close()
def test_batch_rollback():
    db=fresh()
    assert put(db,"lease_one_123456789") is not None
    db.execute("CREATE TABLE business_effect (id INTEGER PRIMARY KEY,payment_id TEXT)")
    db.execute("BEGIN")
    try:
        db.execute("INSERT INTO business_effect(id,payment_id) VALUES (1,?)",("cs_test_one",))
        assert finish(db,"lease_one_123456789") is not None
        # Simulate a later SQL failure in the same D1 transaction.
        db.execute("INSERT INTO business_effect(id,payment_id) VALUES (1,?)",("conflict",))
        db.commit()
    except sqlite3.IntegrityError:
        db.rollback()
    assert db.execute("SELECT count(*) FROM business_effect").fetchone()[0]==0
    assert db.execute("SELECT state FROM stripe_webhook_inbox").fetchone()[0]=="processing"
    db.close()
def test_10_simultaneous_claimants():
    with TemporaryDirectory() as tmp:
        path=str(Path(tmp)/"test.sqlite")
        db=sqlite3.connect(path)
        db.execute("PRAGMA journal_mode=WAL")
        db.executescript(SCHEMA)
        db.close()
        gate=Barrier(10)
        def contestant(i):
            cx=sqlite3.connect(path,isolation_level=None,timeout=10)
            cx.execute("PRAGMA busy_timeout=10000")
            try:
                gate.wait(timeout=10)
                return put(cx,f"lease_{str(i).zfill(18)}")
            finally:
                cx.close()
        with ThreadPoolExecutor(max_workers=10) as pool:
            items=list(pool.map(contestant,range(10)))
        assert sum(x is not None for x in items)==1,items
if __name__=="__main__":
    for t in (test_replay_and_mismatch,test_expired_claim_and_stale_completer,
              test_batch_rollback,test_10_simultaneous_claimants):
        t()
        print("PASS:",t.__name__)
