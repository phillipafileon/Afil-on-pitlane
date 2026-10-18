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


const DEFAULT_CLOSURE_MESSAGE =
  "Afiléon Motorsport is temporarily unavailable for new bookings. Online booking will reopen automatically after this temporary closure.";

function ukDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(now);
  const get = type => parts.find(part => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function addDays(date, count) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
}
function addCalendarMonths(date, count) {
  const [year, month, day] = date.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1 + count, 1, 12));
  const lastDay = new Date(Date.UTC(
    first.getUTCFullYear(), first.getUTCMonth() + 1, 0, 12
  )).getUTCDate();
  first.setUTCDate(Math.min(day, lastDay));
  return first.toISOString().slice(0, 10);
}
function publicClosure(row, today) {
  const start = row?.start_date || null;
  const end = row?.end_date || null;
  const configured = Boolean(start && end);
  const closed = configured && start <= today && today <= end;
  const status = !configured ? "open" : closed ? "closed" : today < start ? "scheduled" : "expired";
  return {
    configured, closed_now: closed, status,
    start_date: start, end_date: end,
    reopens_on: configured ? addDays(end, 1) : null,
    public_message: String(row?.public_message || (configured ? DEFAULT_CLOSURE_MESSAGE : "")).slice(0, 500),
    today
  };
}
// Public calendar is advisory, not a substitute for transactional hold and checkout validation.
async function publicAvailability(env, url, now = new Date()) {
  const requestedMonths = Number(url.searchParams.get("months") || 6);
  const months = Number.isFinite(requestedMonths)
    ? Math.max(1, Math.min(6, Math.trunc(requestedMonths))) : 6;
  const today = ukDate(now);
  const endExclusive = addCalendarMonths(today, months);
  const rows = await env.DB.prepare(
    `SELECT date,service_id,status,kind FROM (
       SELECT booking_date AS date,service_id,status,'booking' AS kind
       FROM bookings WHERE booking_date>=?1 AND booking_date<?2 AND
         (status IN ('confirmed','confirmed_pending_licence')
          OR (status='hold' AND strftime('%s',hold_expires_at)>strftime('%s',?3))
          OR balance_status IN ('invoiced','payment_failed'))
       UNION ALL
       SELECT block_date AS date,COALESCE(service_id,'') AS service_id,
              'blocked' AS status,'block' AS kind
       FROM availability_blocks WHERE block_date>=?1 AND block_date<?2
     ) ORDER BY date`
  ).bind(today, endExclusive, now.toISOString()).all();
  const busy = (rows.results || []).map(x => ({
    date: x.date, service_id: x.service_id || "",
    status: x.status, kind: x.kind
  }));

  // Preserve existing site compatibility with three legacy service-specific full-day blocks.
  const byDate = new Map();
  for (const row of busy) {
    if (row.status !== "blocked") continue;
    if (!byDate.has(row.date)) byDate.set(row.date, new Set());
    byDate.get(row.date).add(row.service_id);
  }
  for (const [date, serviceIds] of byDate) {
    if (serviceIds.has("") || serviceIds.has("*")) continue;
    if (["vehicle_hire_day","track_day_support","vehicle_transport"].every(x => serviceIds.has(x))) {
      busy.push({ date, service_id: "", status: "blocked",
        kind: "legacy_all_services", label: "Unavailable" });
    }
  }

  const setting = await env.DB.prepare(
    "SELECT start_date,end_date,public_message FROM business_availability_settings WHERE id=1 LIMIT 1"
  ).first();
  const closure = publicClosure(setting, today);
  if (closure.configured) {
    const first = closure.start_date > today ? closure.start_date : today;
    let date = first;
    // At most six calendar months, even if historical closure settings are much longer.
    for (let n = 0; n < 200 && date <= closure.end_date && date < endExclusive; n++) {
      busy.push({ date, service_id: "", status: "blocked",
        kind: "master_closure", label: "Master business closure" });
      date = addDays(date, 1);
    }
  }
  busy.sort((a,b) => a.date.localeCompare(b.date));
  return { months, busy };
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

      if (request.method === "GET" && path === "/api/business-availability") {
        const row = await env.DB.prepare(
          "SELECT start_date,end_date,public_message FROM business_availability_settings WHERE id=1 LIMIT 1"
        ).first();
        return reply(publicClosure(row, ukDate()), 200, allowedOrigin);
      }
      if (request.method === "GET" && path === "/api/availability") {
        return reply(await publicAvailability(env, new URL(request.url)), 200, allowedOrigin);
      }
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
