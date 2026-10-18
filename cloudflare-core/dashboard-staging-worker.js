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


/* Compiled from the 2026-10-18 Render Docker patch chain. E46 launch deliberately
   disabled in staging (source E46_BOOKING_LIVE is an environment variable).
   These are only BASE prices; D1 override rows take precedence.
   Do not treat this catalogue as an authorisation to enable booking writes. */
const COMPILED_SERVICES = Object.freeze([{"id":"pre_track_inspection","name":"Comprehensive Pre-Track-Day Inspection","colour":"#8b5cf6","duration":"full_day","variants":[{"id":"standard","label":"Inspection","price":12000}],"payment":"full","kentOnly":true,"travelMode":"postcode","travelRatePencePerMile":35,"addressRequired":true,"hardstandingRequired":true,"bookable":true,"description":"Mobile pre-track readiness inspection in Kent. Includes underbody access where safe, wheel-off visual checks, brakes, tyres, steering/suspension observations and fluid-level checks. Customer supplies any fluids, parts or consumables required unless agreed otherwise."},{"id":"vehicle_hire_day","name":"BMW E46 Arrive & Drive — Full Day + Trackside Support","colour":"#22d3ee","duration":"full_day","variants":[{"id":"full_day","label":"Full day","price":70000}],"payment":"e46_rule","kentOnly":true,"travelMode":"venue","travelRatePencePerMile":55,"licenceRequired":true,"bookable":false,"description":"Full-day BMW E46 arrive-and-drive package with Afiléon Motorsport present trackside throughout the day. Includes the E46, transport to the selected standard Kent circuit, vehicle preparation and active trackside monitoring/support. One full tank of fuel is included. Circuit entry and additional fuel are excluded unless specifically stated. Afiléon Motorsport may pause or withdraw the vehicle from use for safety, mechanical concerns, circuit instructions or unreasonable abuse."},{"id":"track_day_support","name":"Track-Day & Race-Day Support","colour":"#f59e0b","duration":"full_day","variants":[{"id":"half_day","label":"Half day","price":30000},{"id":"full_day","label":"Full day","price":50000}],"payment":"full","kentOnly":true,"travelMode":"venue","travelRatePencePerMile":55,"bookable":true,"description":"Dedicated track-day or race-day support for your own car, including paddock attendance, routine checks, tyre-pressure adjustments, wheel changes, minor adjustments and basic fault finding. Half-day and full-day options are available. Parts, tyres, fluids, fuel, major repairs and fabrication are extra. Half-day bookings still reserve the calendar day because of travel and setup."},{"id":"vehicle_transport","name":"Vehicle Transport","colour":"#3b82f6","duration":"full_day","variants":[{"id":"quote","label":"Quote required","price":null}],"payment":"quote","kentOnly":true,"travelMode":"postcode","travelRatePencePerMile":55,"addressRequired":true,"bookable":true,"description":"Trailer transport for suitable vehicles. Price is quoted from collection point, destination, vehicle details and timing."}]);
const COMPILED_VENUES = Object.freeze([
  {id:"brands_hatch",name:"Brands Hatch",postcode:"TN15 6FS",roundTripMiles:19},
  {id:"lydden_hill",name:"Lydden Hill",postcode:"CT4 6ET",roundTripMiles:94}
]);
async function compiledServiceCatalogue(env) {
  const [priceRows, travelRows] = await Promise.all([
    env.DB.prepare("SELECT service_id,variant_id,price_pence FROM service_price_overrides").all(),
    env.DB.prepare("SELECT service_id,rate_pence_per_mile FROM travel_price_overrides").all()
  ]);
  const prices = new Map((priceRows.results || []).map(r => [
    String(r.service_id)+":"+String(r.variant_id), Number(r.price_pence)
  ]));
  const rates = new Map((travelRows.results || []).map(r => [
    String(r.service_id), Number(r.rate_pence_per_mile)
  ]));
  return COMPILED_SERVICES.map(s => ({
    ...s,
    // Explicitly fail closed for E46 hire until payment/security/admin parity.
    bookable: s.id === "vehicle_hire_day" ? false : s.bookable,
    variants: s.variants.map(v => ({
      ...v,
      price: prices.has(s.id+":"+v.id) && v.price !== null
        ? prices.get(s.id+":"+v.id) : v.price
    })),
    ...(s.travelMode && rates.has(s.id)
      ? {travelRatePencePerMile:rates.get(s.id)} : {})
  }));
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

      if (request.method === "GET" && path === "/api/services") {
        const services = await compiledServiceCatalogue(env);
        return reply({
          services,
          venues: COMPILED_VENUES,
          operations_base: "Gravesend"
        }, 200, allowedOrigin);
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
