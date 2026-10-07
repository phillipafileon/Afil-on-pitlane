const fs = require('fs');
const path = 'server_v3.js';
let s = fs.readFileSync(path, 'utf8');

function insertBefore(anchor, block, label) {
  if (s.includes(block.trim().slice(0, 80))) return;
  const i = s.indexOf(anchor);
  if (i < 0) throw new Error(`Dynamic pricing patch: missing ${label}`);
  s = s.slice(0, i) + block + '\n' + s.slice(i);
}

const helpers = `
// --- Dynamic service and travel pricing (admin-managed) ---
const BASE_SERVICE_PRICING = new Map();
const BASE_TRAVEL_PRICING = new Map();
for (const service of SERVICES) {
  for (const variant of service.variants || []) BASE_SERVICE_PRICING.set(\`${'${service.id}'}:${'${variant.id}'}\`, variant.price == null ? null : Number(variant.price));
  if (service.travelMode) BASE_TRAVEL_PRICING.set(service.id, Number(service.travelRatePencePerMile || 0));
}
let pricingOverridesLoadedAt = 0;

async function ensurePricingTables() {
  await pool.query(\`
    CREATE TABLE IF NOT EXISTS service_price_overrides(
      service_id TEXT NOT NULL,
      variant_id TEXT NOT NULL,
      price_pence INTEGER NOT NULL CHECK(price_pence >= 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY(service_id, variant_id)
    );
    CREATE TABLE IF NOT EXISTS travel_price_overrides(
      service_id TEXT PRIMARY KEY,
      rate_pence_per_mile INTEGER NOT NULL CHECK(rate_pence_per_mile >= 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  \`);
}

async function loadPricingOverrides(force = false) {
  if (!force && pricingOverridesLoadedAt && Date.now() - pricingOverridesLoadedAt < 5000) return;
  await ensurePricingTables();
  for (const service of SERVICES) {
    for (const variant of service.variants || []) {
      const key = \`${'${service.id}'}:${'${variant.id}'}\`;
      if (BASE_SERVICE_PRICING.has(key)) variant.price = BASE_SERVICE_PRICING.get(key);
    }
    if (BASE_TRAVEL_PRICING.has(service.id)) service.travelRatePencePerMile = BASE_TRAVEL_PRICING.get(service.id);
  }
  const [serviceRows, travelRows] = await Promise.all([
    pool.query('SELECT service_id,variant_id,price_pence,updated_at FROM service_price_overrides'),
    pool.query('SELECT service_id,rate_pence_per_mile,updated_at FROM travel_price_overrides')
  ]);
  for (const row of serviceRows.rows) {
    const service = SERVICE_MAP.get(row.service_id);
    const variant = service?.variants?.find(v => v.id === row.variant_id);
    if (variant) variant.price = Number(row.price_pence);
  }
  for (const row of travelRows.rows) {
    const service = SERVICE_MAP.get(row.service_id);
    if (service?.travelMode) service.travelRatePencePerMile = Number(row.rate_pence_per_mile);
  }
  pricingOverridesLoadedAt = Date.now();
}

function pricingSnapshot() {
  return {
    services: SERVICES.map(service => ({
      id: service.id,
      name: service.name,
      payment: service.payment,
      bookable: service.bookable !== false,
      variants: (service.variants || []).map(variant => {
        const key = \`${'${service.id}'}:${'${variant.id}'}\`;
        const base = BASE_SERVICE_PRICING.has(key) ? BASE_SERVICE_PRICING.get(key) : null;
        return {
          id: variant.id,
          label: variant.label,
          price_pence: variant.price == null ? null : Number(variant.price),
          default_price_pence: base,
          editable: service.payment !== 'quote' && base != null
        };
      })
    })),
    travel: SERVICES.filter(service => service.travelMode).map(service => ({
      service_id: service.id,
      name: service.name,
      mode: service.travelMode,
      rate_pence_per_mile: Number(service.travelRatePencePerMile || 0),
      default_rate_pence_per_mile: BASE_TRAVEL_PRICING.get(service.id) ?? 0
    })),
    venues: typeof KENT_VENUES === 'object' ? Object.values(KENT_VENUES) : [],
    currency: 'GBP',
    operations_base: typeof OPERATIONS_BASE === 'object' ? OPERATIONS_BASE.name : 'Gravesend'
  };
}

app.use(['/api/config','/api/services','/api/travel-estimate','/api/quotes','/api/bookings'], async (_req, res, next) => {
  try { await loadPricingOverrides(); next(); }
  catch (e) { console.error('pricing load failed', e); res.status(503).json({error:'pricing_unavailable'}); }
});
`;
insertBefore("app.get('/api/config'", helpers, 'public config route');

const routes = `
app.get('/api/admin/pricing', admin, async (_req, res) => {
  try { await loadPricingOverrides(true); res.json(pricingSnapshot()); }
  catch (e) { console.error(e); res.status(500).json({error:'pricing_load_failed'}); }
});

app.post('/api/admin/service-price', admin, async (req, res) => {
  try {
    await loadPricingOverrides(true);
    const serviceId = clean(req.body?.service_id, 80);
    const variantId = clean(req.body?.variant_id, 80);
    const service = SERVICE_MAP.get(serviceId);
    const variant = service?.variants?.find(v => v.id === variantId);
    if (!service || !variant) return res.status(404).json({error:'service_variant_not_found'});
    const key = \`${'${serviceId}'}:${'${variantId}'}\`;
    const base = BASE_SERVICE_PRICING.get(key);
    if (service.payment === 'quote' || base == null) return res.status(400).json({error:'quote_only_service',detail:'This service is quote-only and does not have a fixed base price.'});
    if (req.body?.price_pence == null) {
      await pool.query('DELETE FROM service_price_overrides WHERE service_id=$1 AND variant_id=$2',[serviceId,variantId]);
      variant.price = base;
    } else {
      const price = Number(req.body.price_pence);
      if (!Number.isInteger(price) || price < 0 || price > 5000000) return res.status(400).json({error:'invalid_price'});
      await pool.query(\`INSERT INTO service_price_overrides(service_id,variant_id,price_pence) VALUES($1,$2,$3) ON CONFLICT(service_id,variant_id) DO UPDATE SET price_pence=excluded.price_pence,updated_at=now()\`,[serviceId,variantId,price]);
      variant.price = price;
    }
    pricingOverridesLoadedAt = Date.now();
    res.json({ok:true,service_id:serviceId,variant_id:variantId,price_pence:variant.price,default_price_pence:base});
  } catch (e) { console.error(e); res.status(500).json({error:'service_price_update_failed'}); }
});

app.post('/api/admin/travel-price', admin, async (req, res) => {
  try {
    await loadPricingOverrides(true);
    const serviceId = clean(req.body?.service_id, 80);
    const service = SERVICE_MAP.get(serviceId);
    if (!service?.travelMode) return res.status(404).json({error:'travel_service_not_found'});
    const base = BASE_TRAVEL_PRICING.get(serviceId) ?? 0;
    if (req.body?.rate_pence_per_mile == null) {
      await pool.query('DELETE FROM travel_price_overrides WHERE service_id=$1',[serviceId]);
      service.travelRatePencePerMile = base;
    } else {
      const rate = Number(req.body.rate_pence_per_mile);
      if (!Number.isInteger(rate) || rate < 0 || rate > 10000) return res.status(400).json({error:'invalid_travel_rate'});
      await pool.query(\`INSERT INTO travel_price_overrides(service_id,rate_pence_per_mile) VALUES($1,$2) ON CONFLICT(service_id) DO UPDATE SET rate_pence_per_mile=excluded.rate_pence_per_mile,updated_at=now()\`,[serviceId,rate]);
      service.travelRatePencePerMile = rate;
    }
    pricingOverridesLoadedAt = Date.now();
    res.json({ok:true,service_id:serviceId,rate_pence_per_mile:Number(service.travelRatePencePerMile||0),default_rate_pence_per_mile:base});
  } catch (e) { console.error(e); res.status(500).json({error:'travel_price_update_failed'}); }
});
`;
insertBefore("app.post('/api/admin/block-date'", routes, 'admin block-date route');

fs.writeFileSync(path, s);
console.log('Applied persistent admin-managed service pricing and separate travel pricing.');
