const fs = require('fs');
const path = 'server_v3.js';
let s = fs.readFileSync(path, 'utf8');

function replaceOnce(oldText, newText, label) {
  if (s.includes(newText)) return;
  if (!s.includes(oldText)) throw new Error(`Patch marker missing: ${label}`);
  s = s.replace(oldText, newText);
}

replaceOnce(
  "    ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfilment_error TEXT;",
  `    ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfilment_error TEXT;\n    ALTER TABLE orders ADD COLUMN IF NOT EXISTS amount_refunded INTEGER NOT NULL DEFAULT 0;\n    ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;`,
  'refund tracking columns'
);

replaceOnce(
  "  const { rows } = await pool.query(`SELECT public_id,items,printful_order_id FROM orders WHERE public_id=$1 LIMIT 1`, [orderId]);",
  "  const { rows } = await pool.query(`SELECT public_id,items,printful_order_id,status FROM orders WHERE public_id=$1 LIMIT 1`, [orderId]);",
  'Printful order status lookup'
);

replaceOnce(
  "  if (!order) throw new Error('order_not_found');\n  if (order.printful_order_id) return { id:order.printful_order_id, already:true };",
  "  if (!order) throw new Error('order_not_found');\n  if (['refunded','partially_refunded'].includes(order.status)) return { skipped:true, refunded:true };\n  if (order.printful_order_id) return { id:order.printful_order_id, already:true };",
  'skip Printful after refund'
);

replaceOnce(
  "UPDATE orders SET status='paid',stock_reserved=false,stripe_payment_intent_id=$1,customer_email=COALESCE(customer_email,$2),updated_at=now() WHERE public_id=$3",
  "UPDATE orders SET status=CASE WHEN status IN ('refunded','partially_refunded') THEN status ELSE 'paid' END,stock_reserved=false,stripe_payment_intent_id=$1,customer_email=COALESCE(customer_email,$2),updated_at=now() WHERE public_id=$3",
  'preserve refund status on checkout completion'
);

replaceOnce(
  "    if (event.type === 'invoice.paid' && o.metadata?.kind === 'service_balance') {",
  `    if (event.type === 'charge.refunded') {\n      const paymentIntentId = typeof o.payment_intent === 'string' ? o.payment_intent : o.payment_intent?.id;\n      const amountRefunded = Number(o.amount_refunded || 0);\n      const amount = Number(o.amount || 0);\n      const fullyRefunded = o.refunded === true || (amount > 0 && amountRefunded >= amount);\n      if (paymentIntentId) {\n        const refundStatus = fullyRefunded ? 'refunded' : 'partially_refunded';\n        await pool.query(\`UPDATE orders SET status=$1,amount_refunded=$2,refunded_at=CASE WHEN $4 THEN COALESCE(refunded_at,now()) ELSE refunded_at END,updated_at=now() WHERE stripe_payment_intent_id=$3\`, [refundStatus, amountRefunded, paymentIntentId, fullyRefunded]);\n      }\n    }\n    if (event.type === 'invoice.paid' && o.metadata?.kind === 'service_balance') {`,
  'Stripe charge.refunded handler'
);

fs.writeFileSync(path, s);
console.log('Stripe refund webhook patch applied');
