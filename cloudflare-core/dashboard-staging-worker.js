// Afiléon Core — STAGING ONLY. Not connected to the live website.
function reply(data, status = 200, origin) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  };
  if (origin) {
    headers["access-control-allow-origin"] = origin;
    headers["vary"] = "Origin";
  }
  return new Response(JSON.stringify(data), { status, headers });
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    const origin = request.headers.get("Origin");
    const allowedOrigin = origin && origin === env.SITE_ORIGIN ? origin : undefined;

    if (request.method === "OPTIONS" && allowedOrigin) {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": allowedOrigin,
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-allow-headers": "Content-Type",
          "vary": "Origin"
        }
      });
    }

    if (request.method === "GET" && path === "/__migration/health") {
      try {
        const tableResult = await env.DB.prepare(
          "SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'"
        ).first();
        const indexResult = await env.DB.prepare(
          "SELECT count(*) AS n FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'"
        ).first();
        const tables = Number(tableResult?.n ?? 0);
        const indexes = Number(indexResult?.n ?? 0);
        const ok = tables === 25 && indexes === 13;
        return reply({
          ok,
          service: "Afileon Core staging",
          database: "D1",
          tables,
          indexes,
          production_ready: false
        }, ok ? 200 : 503, allowedOrigin);
      } catch {
        return reply({
          ok: false,
          error: "database_unavailable",
          production_ready: false
        }, 503, allowedOrigin);
      }
    }

    try {
      if (request.method === "GET" && path === "/api/season") {
        const now = new Date().toISOString();
        const season = await env.DB.prepare(
          "SELECT slug,name,headline,message,accent,background_effect,banner_url,shop_collection,starts_at,ends_at FROM seasonal_campaigns WHERE active=1 AND starts_at<=?1 AND ends_at>=?1 ORDER BY starts_at DESC LIMIT 1"
        ).bind(now).first();
        return reply({ season: season ?? null }, 200, allowedOrigin);
      }

      if (request.method === "GET" && path === "/api/shop/products") {
        const results = await env.DB.prepare(
          "SELECT slug,name,description,price,image_url,stock,featured,collection FROM shop_products WHERE active=1 ORDER BY featured DESC,name"
        ).all();
        return reply({
          products: results.results.map(p => ({ ...p, featured: Boolean(p.featured) }))
        }, 200, allowedOrigin);
      }
    } catch {
      return reply({
        error: "database_unavailable",
        production_ready: false
      }, 503, allowedOrigin);
    }

    // Booking, admin, checkout and webhooks MUST remain disabled.
    return reply({ error: "not_migrated", production_ready: false }, 503, allowedOrigin);
  }
};
