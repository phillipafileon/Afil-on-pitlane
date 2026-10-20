'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(process.argv[2] || 'server_v3.js', 'utf8');
const routeName = "app.post('/api/bookings/:id/cancel-pending'";
const from = source.indexOf(routeName);
const to = source.indexOf("app.get('/api/bookings/:id'", from);
assert(from >= 0 && to > from, 'Assembled server must contain cancel-pending route before get booking');
assert(!source.slice(0, from).includes("consent_collection:{terms_of_service:'required'}"), 'Duplicate Stripe Terms requirement should be removed');

async function run(name, {record, session, getFailure, stripeAvailable=true, expireFailure=false, expectedStatus=200, expectedUpdates=1, expectedExpires=0, expectedRestores=1}) {
  let handler, updates=0, expires=0, restores=0, discounts=0, lookups=0;
  const app={post(path,fn){assert.equal(path,'/api/bookings/:id/cancel-pending');handler=fn}};
  const pool={async query(sql,args) {
    if (sql.startsWith('SELECT ')) return {rows:record?[record]:[]};
    if (sql.startsWith('UPDATE bookings SET')) {updates++;return {rowCount:1}};
    throw Error('Unexpected SQL in test: '+sql);
  }};
  const stripe=stripeAvailable?{checkout:{sessions:{
    async retrieve(){lookups++;if(getFailure)throw Error('stripe temporarily unavailable');return session},
    async expire(){expires++;if(expireFailure)throw Error('cannot expire');return {...session,status:'expired'}},
  }}}:null;
  const context={app,pool,stripe,console,restoreVoucherForBooking:async()=>{restores++},releaseDiscountCode:async()=>{discounts++}};
  vm.runInNewContext(source.slice(from,to),context,{filename:'assembled-cancel-route.js'});
  assert.equal(typeof handler,'function');
  let status=200,response;
  const res={status(s){status=s;return this},json(data){response=data;return this}};
  await handler({params:{id:'bk_test_nonproduction'}},res);
  assert.equal(status,expectedStatus,name+': http code');
  assert.equal(updates,expectedUpdates,name+': booking update count');
  assert.equal(expires,expectedExpires,name+': Stripe expire count');
  assert.equal(restores,expectedRestores,name+': voucher restore count');
  assert.equal(discounts,expectedRestores,name+': promo restore count');
  console.log('PASS:',name,'HTTP',status,'Stripe read',lookups,'release',updates);
}
(async()=>{
 const pending={public_id:'bk_test_nonproduction',status:'hold',amount_paid:0,stripe_checkout_session_id:'cs_test_unpaid'};
 await run('open unpaid checkout releases immediately',{record:pending,session:{status:'open',payment_status:'unpaid'},expectedExpires:1});
 await run('expired unpaid checkout releases',{record:pending,session:{status:'expired',payment_status:'unpaid'}});
 await run('completed paid checkout cannot be cancelled',{record:pending,session:{status:'complete',payment_status:'paid'},expectedStatus:409,expectedUpdates:0,expectedRestores:0});
 await run('paid booking cannot be cancelled',{record:{...pending,status:'confirmed',amount_paid:12000},expectedStatus:409,expectedUpdates:0,expectedRestores:0});
 await run('already released is idempotent',{record:{...pending,status:'expired'},expectedUpdates:0,expectedRestores:0});
 await run('Stripe outage does not release hold',{record:pending,getFailure:true,expectedStatus:503,expectedUpdates:0,expectedRestores:0});
 await run('Stripe expire failure does not release hold',{record:pending,session:{status:'open',payment_status:'unpaid'},expireFailure:true,expectedStatus:503,expectedUpdates:0,expectedExpires:1,expectedRestores:0});
 await run('no Stripe checkout ID can release pending hold',{record:{...pending,stripe_checkout_session_id:null}});
 console.log('ALL CANCEL ROUTE MOCK TESTS PASSED');
})().catch(e=>{console.error(e);process.exitCode=1});
