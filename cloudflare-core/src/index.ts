/** Afiléon Core: staging-only Worker. Production endpoints are NOT fully ported. */
export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
  SITE_ORIGIN?: string;
}
function json(data: Record<string, unknown>, status = 200, origin?: string): Response {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  if (origin) {
    headers.set('access-control-allow-origin', origin);
    headers.set('vary', 'Origin');
  }
  return new Response(JSON.stringify(data), { status, headers });
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const requestedOrigin = request.headers.get('origin');
    const allowedOrigin = requestedOrigin && env.SITE_ORIGIN === requestedOrigin ? requestedOrigin : undefined;
    if (request.method === 'OPTIONS' && allowedOrigin) {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': allowedOrigin,
          'access-control-allow-methods': 'GET, OPTIONS',
          'access-control-allow-headers': 'Content-Type',
          'vary': 'Origin'
        }
      });
    }
    if (request.method === 'GET' && url.pathname === '/__migration/health') {
      try {
        await env.DB.prepare('SELECT 1').first();
        return json({
          ok: true, component: 'Afileon Core API staging', database: 'D1 connected',
          production_ready: false
        }, 200, allowedOrigin);
      } catch {
        return json({
          ok: false, component: 'Afileon Core API staging',
          error: 'database_unavailable', production_ready: false
        }, 503, allowedOrigin);
      }
    }

    // Initial read-only translations of the base Express routes.
    // IMPORTANT: subsequent Render build-time patches may change behaviour;
    // do not use either endpoint for a production cutover without parity tests.
    try {
      if (request.method === 'GET' && url.pathname === '/api/season') {
        const now = new Date().toISOString();
        const season = await env.DB.prepare(
          `SELECT slug,name,headline,message,accent,background_effect,banner_url,
                  shop_collection,starts_at,ends_at
           FROM seasonal_campaigns WHERE active=1 AND starts_at<=?1 AND ends_at>=?1
           ORDER BY starts_at DESC LIMIT 1`
        ).bind(now).first();
        return json({ season: season ?? null }, 200, allowedOrigin);
      }
      if (request.method === 'GET' && url.pathname === '/api/shop/products') {
        const result = await env.DB.prepare(
          `SELECT slug,name,description,price,image_url,stock,featured,collection
           FROM shop_products WHERE active=1 ORDER BY featured DESC,name`
        ).all();
        const products = result.results.map(p => ({ ...p, featured: Boolean(p.featured) }));
        return json({ products }, 200, allowedOrigin);
      }
    } catch {
      return json({ error: 'database_unavailable', production_ready: false }, 503, allowedOrigin);
    }
    // A missing implementation must never silently proxy checkout, admin, or signed webhooks.
    return json({ error: 'not_migrated', production_ready: false }, 503, allowedOrigin);
  }
} satisfies ExportedHandler<Env>;
