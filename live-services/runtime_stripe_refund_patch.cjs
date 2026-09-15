const fs = require('fs');
const path = 'server_v3.js';
let s = fs.readFileSync(path, 'utf8');

// Refund status is customer-visible and must not be overwritten by later fulfilment events.
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
  "UPDATE orders SET status='shipped',fulfilment_status='shipped',tracking_number=$1,tracking_url=$2,updated_at=now() WHERE public_id=$3",
  "UPDATE orders SET status=CASE WHEN status IN ('refunded','partially_refunded') THEN status ELSE 'shipped' END,fulfilment_status='shipped',tracking_number=$1,tracking_url=$2,updated_at=now() WHERE public_id=$3",
  'preserve refund status on shipment'
);

replaceOnce(
  "UPDATE orders SET status='returned',fulfilment_status='returned',fulfilment_error=$1,updated_at=now() WHERE public_id=$2",
  "UPDATE orders SET status=CASE WHEN status IN ('refunded','partially_refunded') THEN status ELSE 'returned' END,fulfilment_status='returned',fulfilment_error=$1,updated_at=now() WHERE public_id=$2",
  'preserve refund status on return'
);

replaceOnce(
  "UPDATE orders SET status='fulfilment_failed',fulfilment_status='failed',fulfilment_error=$1,updated_at=now() WHERE public_id=$2",
  "UPDATE orders SET status=CASE WHEN status IN ('refunded','partially_refunded') THEN status ELSE 'fulfilment_failed' END,fulfilment_status='failed',fulfilment_error=$1,updated_at=now() WHERE public_id=$2",
  'preserve refund status on fulfilment failure'
);

replaceOnce(
  "UPDATE orders SET status='cancelled',fulfilment_status='cancelled',updated_at=now() WHERE public_id=$1",
  "UPDATE orders SET status=CASE WHEN status IN ('refunded','partially_refunded') THEN status ELSE 'cancelled' END,fulfilment_status='cancelled',updated_at=now() WHERE public_id=$1",
  'preserve refund status on fulfilment cancellation'
);

replaceOnce(
  "SELECT public_id,status,total,customer_email,provider,printful_order_id,fulfilment_status,tracking_number,tracking_url,fulfilment_error,created_at,updated_at FROM orders WHERE public_id=$1 LIMIT 1",
  "SELECT public_id,status,total,fulfilment_status,tracking_number,tracking_url,amount_refunded,refunded_at,created_at,updated_at FROM orders WHERE public_id=$1 LIMIT 1",
  'public order response privacy and refund fields'
);

replaceOnce(
  "    if (event.type === 'invoice.paid' && o.metadata?.kind === 'service_balance') {",
  `    if (event.type === 'charge.refunded') {\n      const paymentIntentId = typeof o.payment_intent === 'string' ? o.payment_intent : o.payment_intent?.id;\n      const amountRefunded = Number(o.amount_refunded || 0);\n      const amount = Number(o.amount || 0);\n      const fullyRefunded = o.refunded === true || (amount > 0 && amountRefunded >= amount);\n      if (paymentIntentId) {\n        const refundStatus = fullyRefunded ? 'refunded' : 'partially_refunded';\n        const { rows: matchedOrders } = await pool.query(\`SELECT public_id,printful_order_id FROM orders WHERE stripe_payment_intent_id=$1 LIMIT 1\`, [paymentIntentId]);\n        const matchedOrder = matchedOrders[0] || null;\n        await pool.query(\`UPDATE orders SET status=$1,amount_refunded=$2,refunded_at=CASE WHEN $4 THEN COALESCE(refunded_at,now()) ELSE refunded_at END,updated_at=now() WHERE stripe_payment_intent_id=$3\`, [refundStatus, amountRefunded, paymentIntentId, fullyRefunded]);\n        if (amountRefunded > 0 && matchedOrder?.printful_order_id && !PRINTFUL_FULFILMENT_LIVE) {\n          try {\n            await printfulRequest('DELETE', \`/orders/\${encodeURIComponent(matchedOrder.printful_order_id)}\`);\n            await pool.query(\`UPDATE orders SET fulfilment_status='cancelled',fulfilment_error=NULL,updated_at=now() WHERE public_id=$1\`, [matchedOrder.public_id]);\n          } catch (pfCancelError) {\n            console.error('Printful draft cancellation after refund failed', pfCancelError.message);\n            await pool.query(\`UPDATE orders SET fulfilment_error=$1,updated_at=now() WHERE public_id=$2\`, [clean(pfCancelError.message,1000),matchedOrder.public_id]);\n          }\n        }\n      }\n    }\n    if (event.type === 'invoice.paid' && o.metadata?.kind === 'service_balance') {`,
  'Stripe charge.refunded handler'
);

fs.writeFileSync(path, s);
console.log('Stripe refund webhook patch applied');
