const fs = require('fs');
const path = 'server_v3.js';
let s = fs.readFileSync(path, 'utf8');

function replaceOnce(from, to, label) {
  if (!s.includes(from)) throw new Error(`Booking pricing patch: missing ${label}`);
  s = s.replace(from, to);
}

replaceOnce(
"    payment: 'full',\n    kentOnly: true,\n    addressRequired: true,",
"    payment: 'full',\n    kentOnly: true,\n    travelMode: 'postcode',\n    travelRatePencePerMile: 35,\n    addressRequired: true,",
'pre-track travel settings');

replaceOnce(
"    payment: 'e46_rule',\n    licenceRequired: true,\n    bookable: E46_BOOKING_LIVE,",
"    payment: 'e46_rule',\n    kentOnly: true,\n    travelMode: 'venue',\n    travelRatePencePerMile: 55,\n    licenceRequired: true,\n    bookable: E46_BOOKING_LIVE,",
'E46 travel settings');

replaceOnce(
"    payment: 'full',\n    bookable: true,\n    description: 'Dedicated trackside support",
"    payment: 'full',\n    kentOnly: true,\n    travelMode: 'venue',\n    travelRatePencePerMile: 35,\n    bookable: true,\n    description: 'Dedicated trackside support",
'track support travel settings');

replaceOnce(
"    payment: 'quote',\n    bookable: true,\n    description: 'Race-day paddock support",
"    payment: 'quote',\n    kentOnly: true,\n    travelMode: 'venue',\n    travelRatePencePerMile: 35,\n    bookable: true,\n    description: 'Race-day paddock support",
'race support travel settings');

replaceOnce(
"    payment: 'quote',\n    addressRequired: true,\n    bookable: true,\n    description: 'Trailer transport",
"    payment: 'quote',\n    kentOnly: true,\n    travelMode: 'postcode',\n    travelRatePencePerMile: 55,\n    addressRequired: true,\n    bookable: true,\n    description: 'Trailer transport",
'vehicle transport travel settings');

replaceOnce(
"    payment: 'quote',\n    bookable: true,\n    description: 'Combined vehicle, transport and support package.",
"    payment: 'quote',\n    kentOnly: true,\n    travelMode: 'venue',\n    travelRatePencePerMile: 55,\n    bookable: true,\n    description: 'Combined vehicle, transport and support package.",
'full package travel settings');

replaceOnce(
"const KENT_DISTRICTS = new Set([\n  'Ashford','Canterbury','Dartford','Dover','Folkestone and Hythe','Gravesham',\n  'Maidstone','Medway','Sevenoaks','Swale','Thanet','Tonbridge and Malling','Tunbridge Wells'\n]);",
"const KENT_DISTRICTS = new Set([\n  'Ashford','Canterbury','Dartford','Dover','Folkestone and Hythe','Gravesham',\n  'Maidstone','Medway','Sevenoaks','Swale','Thanet','Tonbridge and Malling','Tunbridge Wells'\n]);\n\nconst OPERATIONS_BASE = { name: 'Gravesend', lat: 51.4413, lon: 0.3697 };\nconst KENT_VENUES = {\n  brands_hatch: { id:'brands_hatch', name:'Brands Hatch', postcode:'TN15 6FS', roundTripMiles:19 },\n  lydden_hill: { id:'lydden_hill', name:'Lydden Hill', postcode:'CT4 6ET', roundTripMiles:94 }\n};\n\nfunction haversineMiles(lat1, lon1, lat2, lon2) {\n  const toRad = d => d * Math.PI / 180;\n  const R = 3958.8;\n  const p1 = toRad(lat1), p2 = toRad(lat2);\n  const dp = toRad(lat2-lat1), dl = toRad(lon2-lon1);\n  const a = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;\n  return 2 * R * Math.asin(Math.sqrt(a));\n}\nfunction roundTravelPence(value) { return value <= 0 ? 0 : Math.ceil(value / 500) * 500; }\nfunction travelFromMiles(service, roundTripMiles, label, postcode = null) {\n  const rate = Number(service?.travelRatePencePerMile || 35);\n  const miles = Math.max(0, Math.round(Number(roundTripMiles || 0)));\n  const surcharge = roundTravelPence(miles * rate);\n  return { ok:true, label, postcode, round_trip_miles:miles, rate_pence_per_mile:rate, surcharge };\n}\nasync function calculateTravel(service, b = {}) {\n  if (!service?.travelMode) return { ok:true, label:'No travel charge', round_trip_miles:0, rate_pence_per_mile:0, surcharge:0 };\n  if (service.travelMode === 'venue') {\n    const venueId = clean(b.venue_id, 60);\n    if (KENT_VENUES[venueId]) {\n      const v = KENT_VENUES[venueId];\n      return { ...travelFromMiles(service, v.roundTripMiles, v.name, v.postcode), venue_id:v.id };\n    }\n    if (venueId !== 'other_kent') return { ok:false, reason:'venue_required', detail:'Choose Brands Hatch, Lydden Hill or another Kent venue.' };\n    const pc = clean(b.venue_postcode || b.postcode, 20);\n    const k = await validateKentPostcode(pc);\n    if (!k.ok) return { ok:false, reason:k.reason, detail:'This service is currently limited to Kent venues.' };\n    const roadOneWay = haversineMiles(OPERATIONS_BASE.lat, OPERATIONS_BASE.lon, Number(k.latitude), Number(k.longitude)) * 1.25;\n    return { ...travelFromMiles(service, roadOneWay * 2, `Other Kent venue (${k.postcode})`, k.postcode), venue_id:'other_kent' };\n  }\n  const k = await validateKentPostcode(b.postcode);\n  if (!k.ok) return { ok:false, reason:k.reason, detail:'This service is currently available only at addresses in Kent.' };\n  const roadOneWay = haversineMiles(OPERATIONS_BASE.lat, OPERATIONS_BASE.lon, Number(k.latitude), Number(k.longitude)) * 1.25;\n  return travelFromMiles(service, roadOneWay * 2, k.district || k.postcode, k.postcode);\n}",
'Kent travel helpers');

replaceOnce(
"    return { ok, reason: ok ? null : 'outside_kent', district, county, postcode: x.postcode || postcode };",
"    return { ok, reason: ok ? null : 'outside_kent', district, county, postcode: x.postcode || postcode, latitude: x.latitude, longitude: x.longitude };",
'postcode coordinates');

replaceOnce(
"function paymentPlan(service, variant, date) {\n  const total = variant?.price;",
"function paymentPlan(service, variant, date, travelSurcharge = 0) {\n  const total = variant?.price == null ? null : Number(variant.price) + Math.max(0, Number(travelSurcharge || 0));",
'payment plan travel surcharge');

replaceOnce(
"r.json({ services: SERVICES.map(publicService), season: rows[0] || null, rolling_months: 6, currency: 'GBP', licence_email: LICENCE_EMAIL, terms_version: '2026-09-15', cancellation_note:",
"r.json({ services: SERVICES.map(publicService), venues: Object.values(KENT_VENUES), operations_base: OPERATIONS_BASE.name, min_lead_days: 1, season: rows[0] || null, rolling_months: 6, currency: 'GBP', licence_email: LICENCE_EMAIL, terms_version: '2026-09-16-v3', cancellation_note:",
'config travel metadata');

replaceOnce(
"app.get('/api/services', (_q, r) => r.json({ services: SERVICES.map(publicService) }));",
"app.get('/api/services', (_q, r) => r.json({ services: SERVICES.map(publicService), venues: Object.values(KENT_VENUES), operations_base: OPERATIONS_BASE.name }));\napp.post('/api/travel-estimate', async (req, res) => {\n  const b = req.body || {};\n  const service = SERVICE_MAP.get(b.service_id);\n  if (!service) return res.status(400).json({ error:'unknown_service' });\n  const travel = await calculateTravel(service, b);\n  if (!travel.ok) return res.status(400).json({ error:travel.reason || 'travel_unavailable', detail:travel.detail || 'Travel could not be calculated.' });\n  res.json({ ...travel, operations_base: OPERATIONS_BASE.name });\n});",
'travel estimate endpoint');

replaceOnce(
"  if (b.requested_date && !isDate(b.requested_date)) return res.status(400).json({ error: 'invalid_date' });",
"  if (b.requested_date && !isDate(b.requested_date)) return res.status(400).json({ error: 'invalid_date' });\n  if (b.requested_date && daysUntil(b.requested_date) < 1) return res.status(400).json({ error:'same_day_unavailable', detail:'Same-day bookings are not available. Please choose tomorrow or a later date.' });",
'quote same-day guard');

replaceOnce(
"  const du = daysUntil(b.booking_date);\n  if (du < 0 || du >= 184) return res.status(400).json({ error: 'date_outside_booking_window' });",
"  const du = daysUntil(b.booking_date);\n  if (du < 1 || du >= 184) return res.status(400).json({ error: du < 1 ? 'same_day_unavailable' : 'date_outside_booking_window', detail: du < 1 ? 'Same-day bookings are not available. Please choose tomorrow or a later date.' : undefined });",
'booking same-day guard');

replaceOnce(
"  if (service.hardstandingRequired && b.safe_work_area_confirmed !== true) return res.status(400).json({ error: 'safe_work_area_confirmation_required', detail: 'Please confirm the vehicle will be on safe, level, off-road hardstanding with enough room to jack the vehicle and remove wheels.' });\n  if (service.kentOnly) {\n    const k = await validateKentPostcode(b.postcode);\n    if (!k.ok) return res.status(400).json({ error: k.reason, detail: 'This mobile inspection is currently available only at addresses in Kent.' });\n  }\n  const plan = paymentPlan(service, variant, b.booking_date);",
"  if (service.hardstandingRequired && b.safe_work_area_confirmed !== true) return res.status(400).json({ error: 'safe_work_area_confirmation_required', detail: 'Please confirm the vehicle will be on safe, level, off-road hardstanding with enough room to jack the vehicle and remove wheels.' });\n  let travel = { ok:true, label:'No travel charge', round_trip_miles:0, rate_pence_per_mile:0, surcharge:0 };\n  if (service.travelMode) {\n    travel = await calculateTravel(service, b);\n    if (!travel.ok) return res.status(400).json({ error: travel.reason || 'travel_unavailable', detail: travel.detail || 'Travel could not be calculated.' });\n  } else if (service.kentOnly) {\n    const k = await validateKentPostcode(b.postcode);\n    if (!k.ok) return res.status(400).json({ error: k.reason, detail: 'This service is currently available only in Kent.' });\n  }\n  const plan = paymentPlan(service, variant, b.booking_date, travel.surcharge);",
'travel validation and pricing in booking hold');

replaceOnce(
"res.status(201).json({ booking_id:id, hold_expires_at:expires, service:publicService(service), variant, payment_plan:plan, checkout_available:true, licence_email:service.licenceRequired?LICENCE_EMAIL:null });",
"res.status(201).json({ booking_id:id, hold_expires_at:expires, service:publicService(service), variant, travel, payment_plan:plan, checkout_available:true, licence_email:service.licenceRequired?LICENCE_EMAIL:null });",
'booking response travel details');

fs.writeFileSync(path, s);
console.log('Applied Kent travel pricing, venue selection and no-same-day booking patch.');
