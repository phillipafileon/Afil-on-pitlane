"""Local SQLite transactional tests for Stripe booking payment finalisation.
No Stripe account, Cloudflare D1, customer records, or live Worker involved.
"""
import sqlite3, re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BASE=(ROOT/"migrations/0001_neon_schema_draft.sql").read_text()
INBOX=(ROOT/"migrations/0002_webhook_inbox_staging.sql").read_text()
CLAIM=(ROOT/"webhooks/claim-stripe-event.sql").read_text()
APPLY=(ROOT/"webhooks/apply-verified-booking-payment.sql").read_text()
COMPLETE=(ROOT/"webhooks/complete-verified-booking-payment.sql").read_text()
def sql(s):return re.sub(r"\?(\d+)",lambda m:":v"+m.group(1),s)
CLAIM,APPLY,COMPLETE=map(sql,(CLAIM,APPLY,COMPLETE))
NOW="2026-10-18T10:00:00.000Z"
CREATED="2026-10-18T09:59:00.000Z"
HOLD_EXPIRES="2026-10-18T10:20:00.000Z"
DATE="2026-11-08"
BOOKING="bk_1234567890abcdef"
SESSION="cs_test_1234567890abcde"
PAYMENT="pi_1234567890abcde"
EVENT="evt_1234567890abcdef"
LEASE="lease_1234567890abcde"
def params(values):return {f"v{i+1}":x for i,x in enumerate(values)}
def fresh():
    db=sqlite3.connect(":memory:",isolation_level=None)
    db.executescript(BASE)
    db.executescript(INBOX)
    db.execute("""INSERT INTO bookings (
      public_id,service_id,variant_id,booking_date,customer_email,
      status,hold_expires_at,stripe_checkout_session_id,
      amount_total,booking_payment_amount,balance_amount,licence_required,
      terms_version,terms_accepted_at,created_at
    ) VALUES (?,?,?,?,?,'hold',?,?,?,?,?,?,?,?,?)""",(
      BOOKING,"vehicle_hire_day","full_day",DATE,"example@test.invalid",
      HOLD_EXPIRES,SESSION,70000,25000,45000,1,
      "2026-10-07-v10","2026-10-18T09:00:00.000Z","2026-10-18T09:00:00.000Z"))
    return db
def claim(db,event=EVENT,lease=LEASE):
    return db.execute(CLAIM,params([event,"checkout.session.completed","a"*64,
      lease,NOW,"2026-10-18T10:01:00.000Z"])).fetchone()
def bindings(event=EVENT,session=SESSION,payment=PAYMENT,
             amount=25000,approval=1,event_created=CREATED):
    return params([BOOKING,session,payment,"cus_1234567890abcde",amount,
      event_created,event,LEASE,NOW,"2026-10-07-v10",
      "vehicle_hire_day","full_day",DATE,"2026-10-18",
      "checkout.session.completed",approval])
def pair(db, p, crash=False):
    db.execute("BEGIN")
    try:
        applied=db.execute(APPLY,p).fetchone()
        finished=db.execute(COMPLETE,p).fetchone()
        if crash:
            # Crash/failure in the atomic group must roll back both updates.
            db.execute("INSERT INTO bookings(public_id,service_id,booking_date) VALUES (?,?,?)",
              (BOOKING,"vehicle_hire_day",DATE))
        db.execute("COMMIT")
        return applied,finished
    except:
        db.execute("ROLLBACK")
        raise
def row(db):
    return db.execute("""SELECT status,amount_paid,stripe_payment_intent_id
                         FROM bookings WHERE public_id=?""",(BOOKING,)).fetchone()
def test_payment_once_and_same_session_replay():
    db=fresh();assert claim(db)
    updated,ack=pair(db,bindings())
    assert updated and ack
    assert row(db)==("confirmed_pending_licence",25000,PAYMENT)
    assert db.execute("SELECT state FROM stripe_webhook_inbox").fetchone()==("processed",)
    assert claim(db) is None
    # A DIFFERENT authentic event for SAME paid session should not double-count.
    e2="evt_abcdef1234567890"
    assert claim(db,event=e2)
    updated,ack=pair(db,bindings(event=e2))
    assert updated is None and ack
    assert row(db)[1]==25000
    db.close()
def test_mismatch_event_or_amount_is_never_acknowledged():
    for kwargs in ({"session":"cs_test_other_session_12345678"},
                   {"payment":"pi_other_12345678"},
                   {"amount":20000},{"approval":0}):
        db=fresh();assert claim(db)
        # Checkout may not know the payment_intent until payment succeeds.
        # When a known intent was stored, a *different* one must be rejected.
        if "payment" in kwargs:
            db.execute("UPDATE bookings SET stripe_payment_intent_id=? WHERE public_id=?",(PAYMENT,BOOKING))
        updated,ack=pair(db,bindings(**kwargs))
        assert updated is None and ack is None,kwargs
        assert row(db)==("hold",0,PAYMENT if "payment" in kwargs else None),kwargs
        assert db.execute("SELECT state FROM stripe_webhook_inbox").fetchone()==("processing",)
        db.close()
def test_paid_event_after_hold_expiry_stays_pending_for_review():
    db=fresh();assert claim(db)
    updated,ack=pair(db,bindings(event_created="2026-10-18T10:21:00.000Z"))
    assert updated is None and ack is None
    assert row(db)[0]=="hold"
    db.close()
def test_rollback_reverts_payment_and_inbox():
    db=fresh();assert claim(db)
    try:pair(db,bindings(),crash=True)
    except sqlite3.IntegrityError:pass
    else:raise AssertionError("Expected rollback due to duplicate public_id")
    assert row(db)==("hold",0,None)
    assert db.execute("SELECT state FROM stripe_webhook_inbox").fetchone()==("processing",)
    db.close()
def test_closure_and_block_prevent_confirming_newly_invalid_booking():
    for kind in ("closure","block","second_paid"):
        db=fresh();assert claim(db)
        if kind=="closure":
            db.execute("INSERT INTO business_availability_settings(id,start_date,end_date) VALUES(1,?,?)",(DATE,DATE))
        elif kind=="block":
            db.execute("INSERT INTO availability_blocks(block_date,service_id,label) VALUES (?,?,'closed')",(DATE,None))
        else:
            db.execute("""INSERT INTO bookings(public_id,service_id,booking_date,status)
                          VALUES('other','track_day_support',?,'confirmed')""",(DATE,))
        updated,ack=pair(db,bindings())
        assert updated is None and ack is None
        assert row(db)[0]=="hold"
        db.close()
if __name__=="__main__":
    for t in (test_payment_once_and_same_session_replay,
              test_mismatch_event_or_amount_is_never_acknowledged,
              test_paid_event_after_hold_expiry_stays_pending_for_review,
              test_rollback_reverts_payment_and_inbox,
              test_closure_and_block_prevent_confirming_newly_invalid_booking):
        t();print("PASS:",t.__name__)
