// Isolated migration readiness probe. No customer routes or data are exposed.
import { neon } from '@neondatabase/serverless';

const respond = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
});

export default {
  async fetch(request, env) {
    // Disable this probe unless its private staging access key has been configured.
    if (!env.MIGRATION_PROBE_KEY) return respond({ ready: false }, 503);
    if (request.headers.get('x-probe-key') !== env.MIGRATION_PROBE_KEY) {
      return respond({ error: 'unauthorized' }, 401);
    }
    if (request.method !== 'GET') return respond({ error: 'read_only' }, 405);
    const path = new URL(request.url).pathname;
    if (path === '/health') return respond({ staging: true, live_api: false });
    if (path !== '/health/db') return respond({ error: 'not_found' }, 404);
    if (!env.DATABASE_URL) return respond({ connected: false }, 503);
    try {
      const sql = neon(env.DATABASE_URL);
      const rows = await sql`SELECT 1 AS connected`;
      return respond({ connected: Number(rows[0]?.connected) === 1 });
    } catch (err) {
      console.error('Migration staging database probe error', err?.name || 'error');
      return respond({ connected: false }, 503);
    }
  }
};
