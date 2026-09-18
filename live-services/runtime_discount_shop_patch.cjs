const fs=require('fs');
const path='server_v3.js';
let s=fs.readFileSync(path,'utf8');
const start=s.indexOf("app.post('/api/shop/checkout', async (req,res,next) => {");
const end=s.indexOf("app.get('/api/shop/orders/:id'",start);
if(start<0||end<0)throw new Error('shop checkout route not found');

const route=`app.post('/api/shop/checkout', async (req,res,next) => {
  if (!Array.isArray(req.body?.items)) return next();
  if (!stripe) return res.status(503).json({ error:'stripe_not_configured' });
  if (!SHOP_CHECKOUT_LIVE) return res.status(503).json({ error:'shop_not_live', detail: STRIPE_LIVE_KEY ? 'Merchandise checkout is not enabled yet.' : 'Merchandise checkout is ready but live Stripe payments have not been enabled yet.' });
  let items;
  try { items = normaliseShopItems(req.body.items); }
  catch (e) { return res.status(400).json({ error:e.message==='empty_basket'?'empty_basket':'invalid_product_variant' }); }

  const originalTotal = items.reduce((n,x)=>n+x.unit_price*x.quantity,0);
  const id = token('ord');
  const discountCode=normaliseDiscountCode(req.body?.discount_code||'');
  let discount=null,discountAmount=0,total=originalTotal;
  if(discountCode){
    discount=await reserveDiscountCode(discountCode,'shop',id,originalTotal);
    if(!discount)return res.status(400).json({error:'discount_code_invalid',detail:'Promo code not recognised, not active, expired or fully used.'});
    discountAmount=Number(discount.discount_amount||0);
    total=Math.max(0,originalTotal-discountAmount);
  }

  try {
    await pool.query(\`INSERT INTO orders(public_id,status,total,original_total,discount_code_id,discount_amount,items,stock_reserved,provider,fulfilment_status) VALUES($1,'pending',$2,$3,$4,$5,$6::jsonb,false,'printful','awaiting_payment')\`, [id,total,originalTotal,discount?.discount_code_id||null,discountAmount,JSON.stringify(items)]);
    const lines = discountAmount>0
      ? [{quantity:1,price_data:{currency:'gbp',unit_amount:total,tax_behavior:'exclusive',product_data:{name:'Afiléon Motorsport shop order',description:\`Promo code ${discount.code} applied: -£${(discountAmount/100).toFixed(2)}\`}}}]
      : items.map(x => ({ quantity:x.quantity,price_data:{currency:'gbp',unit_amount:x.unit_price,tax_behavior:'exclusive',product_data:{name:\`${x.name} — ${x.variant_label}\`}} }));

    const session = await stripe.checkout.sessions.create({
      mode:'payment',
      success_url:\`${SITE_URL}/shop-success.html?order=${id}&session_id={CHECKOUT_SESSION_ID}\`,
      cancel_url:\`${SITE_URL}/shop.html?cancelled=1\`,
      automatic_tax:{enabled:true},
      billing_address_collection:'required',
      shipping_address_collection:{allowed_countries:['GB']},
      shipping_options:[{shipping_rate_data:{type:'fixed_amount',fixed_amount:{amount:SHOP_DELIVERY_GBP,currency:'gbp'},display_name:'UK delivery'}}],
      phone_number_collection:{enabled:true},
      line_items:lines,
      expires_at:Math.floor(Date.now()/1000)+1800,
      metadata:{kind:'shop_order',order_id:id,discount_amount:String(discountAmount||0),discount_code:discount?.code||''},
      payment_intent_data:{metadata:{kind:'shop_order',order_id:id,discount_code:discount?.code||''}}
    }, { idempotencyKey:\`shop_${id}\` });

    await pool.query(\`UPDATE orders SET stripe_checkout_session_id=$1,updated_at=now() WHERE public_id=$2\`,[session.id,id]);
    if(discountCode)await attachDiscountSession('shop',id,session.id);
    return res.json({order_id:id,checkout_url:session.url,delivery_price:SHOP_DELIVERY_GBP,discount_applied:discountAmount,total});
  } catch (e) {
    console.error('Shop checkout',e);
    if(discountCode)await releaseDiscountCode('shop',id).catch(()=>{});
    await pool.query(\`UPDATE orders SET status='failed',fulfilment_error=$1,updated_at=now() WHERE public_id=$2\`,[clean(e.message,1000),id]).catch(()=>{});
    return res.status(500).json({ error:'checkout_creation_failed' });
  }
});

`;

s=s.slice(0,start)+route+s.slice(end);
fs.writeFileSync(path,s);
console.log('Applied shop discount checkout');
