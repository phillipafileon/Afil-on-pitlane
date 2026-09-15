const fs = require('fs');
const path = 'server_v3.js';
let s = fs.readFileSync(path, 'utf8');

function replaceOnce(oldText, newText, label) {
  if (s.includes(newText)) return;
  if (!s.includes(oldText)) throw new Error(`Patch marker missing: ${label}`);
  s = s.replace(oldText, newText);
}

replaceOnce(
  "const SHOP_MAP = new Map(SHOP_CATALOG.map(p => [p.slug,p]));",
  `const SHOP_MAP = new Map(SHOP_CATALOG.map(p => [p.slug,p]));
let SHOP_IMAGE_CACHE = {};
let SHOP_IMAGE_CACHE_AT = 0;
async function refreshShopImageCache() {
  if (!PRINTFUL_API_TOKEN) return SHOP_IMAGE_CACHE;
  if (Date.now() - SHOP_IMAGE_CACHE_AT < 6 * 60 * 60 * 1000 && Object.keys(SHOP_IMAGE_CACHE).length) return SHOP_IMAGE_CACHE;
  try {
    const j = await printfulRequest('GET','/store/products?limit=100');
    const next = {};
    for (const p of (j.result || [])) {
      const name = String(p.name || '').toLowerCase();
      const url = p.thumbnail_url || p.thumbnail || null;
      if (!url) continue;
      if (name.includes('t-shirt') || name.includes('tshirt')) next['embroidered-tshirt'] = url;
      else if (name.includes('hoodie')) next['embroidered-hoodie'] = url;
      else if (name.includes('polo')) next['embroidered-polo'] = url;
      else if (name.includes('beanie')) next['beanie'] = url;
      else if (name.includes('snapback')) next['snapback'] = url;
    }
    if (Object.keys(next).length) {
      SHOP_IMAGE_CACHE = { ...SHOP_IMAGE_CACHE, ...next };
      SHOP_IMAGE_CACHE_AT = Date.now();
    }
  } catch (e) {
    console.error('Printful shop image refresh failed', e.message);
  }
  return SHOP_IMAGE_CACHE;
}`,
  'shop image cache helper'
);

replaceOnce(
  "app.get('/api/shop/products', (_q,res) => res.json({",
  "app.get('/api/shop/products', async (_q,res) => { const dynamicImages = await refreshShopImageCache(); return res.json({",
  'async shop products route'
);

replaceOnce(
  "price:p.price,image_url:p.image_url,stock:null",
  "price:p.price,image_url:p.image_url || dynamicImages[p.slug] || null,stock:null",
  'dynamic product image URL'
);

replaceOnce(
  "  fulfilment_live: PRINTFUL_FULFILMENT_LIVE\n}));\n\napp.post('/api/shop/checkout'",
  "  fulfilment_live: PRINTFUL_FULFILMENT_LIVE\n}); });\n\napp.post('/api/shop/checkout'",
  'close async shop products route'
);

fs.writeFileSync(path, s);
console.log('Applied dynamic Printful shop image patch');
