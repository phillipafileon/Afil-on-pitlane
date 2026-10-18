/** Afiléon Core API: NON-PRODUCTION migration harness, not the full backend. */
export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
}
function respond(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/__migration/health') {
      try {
        await env.DB.prepare('SELECT 1').first();
        return respond({
          ok: true,
          component: 'Afileon Core API staging',
          database: 'D1 connected',
          production_ready: false
        });
      } catch {
        return respond({
          ok: false,
          component: 'Afileon Core API staging',
          error: 'database_unavailable',
          production_ready: false
        }, 503);
      }
    }
    // Fail closed. Never proxy paid bookings or production data to a partial port.
    return respond({ error: 'not_migrated', production_ready: false }, 503);
  }
} satisfies ExportedHandler<Env>;
