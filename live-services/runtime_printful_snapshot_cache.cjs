const fs = require('fs');
const path = 'server_v3.js';
let s = fs.readFileSync(path, 'utf8');

function mustReplace(oldText, newText, label) {
  if (s.includes(newText)) return;
  if (!s.includes(oldText)) throw new Error('Printful snapshot patch marker missing: ' + label);
  s = s.replace(oldText, newText);
}

mustReplace(
  'const SHOP_CATALOG_TTL_MS = 60 * 1000;',
  'const SHOP_CATALOG_TTL_MS = 5 * 60 * 1000;',
  'catalogue refresh ttl'
);

const start = s.indexOf('async function getPrintfulShopCatalog(force = false) {');
const end = s.indexOf('\n\nasync function ensurePrintfulWebhook()', start);
if (start < 0 || end < 0) throw new Error('Printful snapshot patch marker missing: getPrintfulShopCatalog range');

const replacement = `
const SHOP_CATALOG_SNAPSHOT_KEY = 'printful-shop-v1';
const SHOP_CATALOG_DISPLAY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SHOP_CATALOG_CHECKOUT_MAX_AGE_MS = 6 * 60 * 60 * 1000;
let SHOP_CATALOG_HYDRATED = false;
let SHOP_CATALOG_REFRESH_FAILED_AT = 0;

async function ensurePrintfulShopSnapshotTable() {
  await pool.query(\`
    CREATE TABLE IF NOT EXISTS shop_catalog_snapshots(
      cache_key TEXT PRIMARY KEY,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      refreshed_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  \`);
}

async function hydratePrintfulShopCatalogSnapshot() {
  if (SHOP_CATALOG_HYDRATED) return;
  SHOP_CATALOG_HYDRATED = true;
  try {
    await ensurePrintfulShopSnapshotTable();
    const { rows } = await pool.query(
      'SELECT payload,refreshed_at FROM shop_catalog_snapshots WHERE cache_key=$1 LIMIT 1',
      [SHOP_CATALOG_SNAPSHOT_KEY]
    );
    const row = rows[0];
    const products = row?.payload?.products;
    if (Array.isArray(products)) {
      SHOP_CATALOG_CACHE = products;
      const ts = new Date(row.refreshed_at).getTime();
      SHOP_CATALOG_CACHE_AT = Number.isFinite(ts) ? ts : 0;
      console.log('Printful shop catalogue snapshot restored', products.length, 'products');
    }
  } catch (e) {
    console.error('Printful shop catalogue snapshot restore failed', e.message);
  }
}

async function persistPrintfulShopCatalogSnapshot(products, refreshedAt) {
  try {
    await ensurePrintfulShopSnapshotTable();
    await pool.query(
      \`INSERT INTO shop_catalog_snapshots(cache_key,payload,refreshed_at,updated_at)
         VALUES($1,$2::jsonb,$3,now())
         ON CONFLICT(cache_key) DO UPDATE
         SET payload=EXCLUDED.payload,refreshed_at=EXCLUDED.refreshed_at,updated_at=now()\`,
      [SHOP_CATALOG_SNAPSHOT_KEY, JSON.stringify({ products }), new Date(refreshedAt)]
    );
  } catch (e) {
    console.error('Printful shop catalogue snapshot persist failed', e.message);
  }
}

function printfulCatalogAgeMs() {
  return SHOP_CATALOG_CACHE_AT ? Math.max(0, Date.now() - SHOP_CATALOG_CACHE_AT) : Number.POSITIVE_INFINITY;
}

function printfulCatalogueCheckoutFresh() {
  return Array.isArray(SHOP_CATALOG_CACHE) && printfulCatalogAgeMs() <= SHOP_CATALOG_CHECKOUT_MAX_AGE_MS;
}

function launchPrintfulShopCatalogRefresh() {
  if (!PRINTFUL_API_TOKEN) return null;
  if (SHOP_CATALOG_REFRESH) return SHOP_CATALOG_REFRESH;
  SHOP_CATALOG_REFRESH = (async () => {
    try {
      const next = await fetchPrintfulShopCatalog();
      if (!Array.isArray(next)) throw new Error('printful_catalog_invalid');
      const refreshedAt = Date.now();
      SHOP_CATALOG_CACHE = next;
      SHOP_CATALOG_CACHE_AT = refreshedAt;
      SHOP_CATALOG_REFRESH_FAILED_AT = 0;
      await persistPrintfulShopCatalogSnapshot(next, refreshedAt);
      console.log('Printful shop catalogue refreshed', next.length, 'products');
      return next;
    } catch (e) {
      SHOP_CATALOG_REFRESH_FAILED_AT = Date.now();
      console.error('Printful shop catalogue refresh failed', e.message);
      return Array.isArray(SHOP_CATALOG_CACHE) ? SHOP_CATALOG_CACHE : [];
    } finally {
      SHOP_CATALOG_REFRESH = null;
    }
  })();
  return SHOP_CATALOG_REFRESH;
}

async function getPrintfulShopCatalog(force = false) {
  await hydratePrintfulShopCatalogSnapshot();
  const haveSnapshot = Array.isArray(SHOP_CATALOG_CACHE);
  const stale = !SHOP_CATALOG_CACHE_AT || printfulCatalogAgeMs() >= SHOP_CATALOG_TTL_MS;

  if (!force && haveSnapshot) {
    if (stale) launchPrintfulShopCatalogRefresh();
    return SHOP_CATALOG_CACHE;
  }

  const refresh = launchPrintfulShopCatalogRefresh();
  if (!refresh) return haveSnapshot ? SHOP_CATALOG_CACHE : [];
  const next = await refresh;
  return Array.isArray(next) ? next : (haveSnapshot ? SHOP_CATALOG_CACHE : []);
}
`;

s = s.slice(0, start) + replacement + s.slice(end);

const normaliseStart = s.indexOf('async function normaliseShopItems(input) {');
const normaliseEnd = s.indexOf('\n}\n\nasync function submitPrintfulOrder', normaliseStart);
if (normaliseStart < 0 || normaliseEnd < 0) throw new Error('Printful snapshot patch marker missing: normaliseShopItems range');
let normalise = s.slice(normaliseStart, normaliseEnd + 2);
normalise = normalise.replace(
  '  const catalog = await getPrintfulShopCatalog();',
  "  const catalog = await getPrintfulShopCatalog(true);\n  if (!printfulCatalogueCheckoutFresh()) throw new Error('catalogue_refresh_required');"
);
s = s.slice(0, normaliseStart) + normalise + s.slice(normaliseEnd + 2);

mustReplace(
  "    checkout_live:SHOP_CHECKOUT_LIVE && catalog.length > 0,",
  "    checkout_live:SHOP_CHECKOUT_LIVE && catalog.length > 0 && printfulCatalogueCheckoutFresh(),",
  'checkout freshness'
);

mustReplace(
  "    catalogue_refreshed_at:SHOP_CATALOG_CACHE_AT ? new Date(SHOP_CATALOG_CACHE_AT).toISOString() : null,",
  "    catalogue_refreshed_at:SHOP_CATALOG_CACHE_AT ? new Date(SHOP_CATALOG_CACHE_AT).toISOString() : null,\n    catalogue_stale:printfulCatalogAgeMs() >= SHOP_CATALOG_TTL_MS,\n    catalogue_age_seconds:Number.isFinite(printfulCatalogAgeMs()) ? Math.round(printfulCatalogAgeMs()/1000) : null,\n    catalogue_refreshing:!!SHOP_CATALOG_REFRESH,\n    catalogue_display_fresh:printfulCatalogAgeMs() <= SHOP_CATALOG_DISPLAY_MAX_AGE_MS,",
  'catalogue freshness metadata'
);

mustReplace(
  "  try { items = await normaliseShopItems(req.body.items); } catch (e) { return res.status(400).json({ error:e.message==='empty_basket'?'empty_basket':'invalid_product_variant' }); }",
  "  try { items = await normaliseShopItems(req.body.items); } catch (e) {\n    if (e.message === 'catalogue_refresh_required') return res.status(503).json({ error:'catalogue_refresh_required', detail:'The live merchandise catalogue could not be refreshed. Please try checkout again shortly.' });\n    return res.status(400).json({ error:e.message==='empty_basket'?'empty_basket':'invalid_product_variant' });\n  }",
  'checkout refresh error'
);

fs.writeFileSync(path, s);
console.log('Applied persistent Printful last-known-good snapshot cache');
