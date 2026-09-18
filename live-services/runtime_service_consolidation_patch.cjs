const fs = require('fs');
const path = 'server_v3.js';
let s = fs.readFileSync(path, 'utf8');

function replaceRange(startMarker, endMarker, replacement, label) {
  const a = s.indexOf(startMarker);
  const b = s.indexOf(endMarker, a + startMarker.length);
  if (a < 0 || b < 0) throw new Error(`Service consolidation patch: missing ${label}`);
  s = s.slice(0, a) + replacement + s.slice(b);
}
function replaceOnce(from, to, label) {
  if (s.includes(to)) return;
  if (!s.includes(from)) throw new Error(`Service consolidation patch: missing ${label}`);
  s = s.replace(from, to);
}

const e46 = `  {
    id: 'vehicle_hire_day',
    name: 'BMW E46 Arrive & Drive — Full Day + Trackside Support',
    colour: '#22d3ee',
    duration: 'full_day',
    variants: [{ id: 'full_day', label: 'Full day', price: 70000 }],
    payment: 'e46_rule',
    kentOnly: true,
    travelMode: 'venue',
    travelRatePencePerMile: 55,
    licenceRequired: true,
    bookable: E46_BOOKING_LIVE,
    description: 'Full-day BMW E46 arrive-and-drive package with Afiléon Motorsport present trackside throughout the day. Includes the E46, transport to the selected standard Kent circuit, vehicle preparation and active trackside monitoring/support. One full tank of fuel is included. Circuit entry and additional fuel are excluded unless specifically stated. Afiléon Motorsport may pause or withdraw the vehicle from use for safety, mechanical concerns, circuit instructions or unreasonable abuse.'
  },\n`;

const support = `  {
    id: 'track_day_support',
    name: 'Track-Day & Race-Day Support',
    colour: '#f59e0b',
    duration: 'full_day',
    variants: [
      { id: 'half_day', label: 'Half day', price: 30000 },
      { id: 'full_day', label: 'Full day', price: 50000 }
    ],
    payment: 'full',
    kentOnly: true,
    travelMode: 'venue',
    travelRatePencePerMile: 55,
    bookable: true,
    description: 'Dedicated track-day or race-day support for your own car, including paddock attendance, routine checks, tyre-pressure adjustments, wheel changes, minor adjustments and basic fault finding. Half-day and full-day options are available. Parts, tyres, fluids, fuel, major repairs and fabrication are extra. Half-day bookings still reserve the calendar day because of travel and setup.'
  },\n`;

replaceRange("  {\n    id: 'vehicle_hire_day',", "  {\n    id: 'track_day_support',", e46, 'E46 service block');
replaceRange("  {\n    id: 'track_day_support',", "  {\n    id: 'race_day_support',", support, 'track support service block');
replaceRange("  {\n    id: 'race_day_support',", "  {\n    id: 'vehicle_transport',", '', 'separate race support service block');
replaceRange("  {\n    id: 'full_package',", "\n];", '', 'duplicate full package service block');

if (s.includes("const TERMS_VERSION = '2026-09-16-v3';")) {
  s = s.replace("const TERMS_VERSION = '2026-09-16-v3';", "const TERMS_VERSION = '2026-09-16-v4';");
}

replaceOnce(
  "  if (!service || service.payment !== 'quote') return res.status(400).json({ error: 'quote_not_required' });",
  "  const manualVenueQuote = !!service && ['vehicle_hire_day','track_day_support'].includes(service.id) && clean(b.venue_id,60) === 'quote';\n  if (!service || (service.payment !== 'quote' && !manualVenueQuote)) return res.status(400).json({ error: 'quote_not_required' });",
  'quote eligibility'
);

replaceOnce(
  "  let quoteTravel = { ok:true, label:'No travel charge', round_trip_miles:0, rate_pence_per_mile:0, surcharge:0 };\n  if (service.travelMode) {\n    quoteTravel = await calculateTravel(service, b);\n    if (!quoteTravel.ok) return res.status(400).json({ error:quoteTravel.reason || 'travel_unavailable', detail:quoteTravel.detail || 'Travel could not be calculated.' });\n  }\n  const venueText = service.travelMode === 'venue' ? `Venue: ${quoteTravel.label}. ` : '';\n  const travelText = service.travelMode ? `Travel from Gravesend: ${quoteTravel.round_trip_miles} mile return estimate, ${Math.round(quoteTravel.surcharge/100)} GBP travel component. ` : '';\n  const quoteNotes = clean(`${venueText}${travelText}${clean(b.notes,1200)}`,1500);",
  "  let quoteTravel = { ok:true, label:'No travel charge', round_trip_miles:0, rate_pence_per_mile:0, surcharge:0 };\n  if (service.travelMode && !manualVenueQuote) {\n    quoteTravel = await calculateTravel(service, b);\n    if (!quoteTravel.ok) return res.status(400).json({ error:quoteTravel.reason || 'travel_unavailable', detail:quoteTravel.detail || 'Travel could not be calculated.' });\n  }\n  const requestedVenue = manualVenueQuote ? clean(b.service_address || b.venue_name || 'Other / outside Kent venue',300) : '';\n  const requestedPostcode = manualVenueQuote ? clean(b.postcode || b.venue_postcode,20) : '';\n  const venueText = manualVenueQuote ? `Requested venue: ${requestedVenue}${requestedPostcode ? ' ('+requestedPostcode+')' : ''}. ` : (service.travelMode === 'venue' ? `Venue: ${quoteTravel.label}. ` : '');\n  const travelText = service.travelMode && !manualVenueQuote ? `Travel from Gravesend: ${quoteTravel.round_trip_miles} mile return estimate, ${Math.round(quoteTravel.surcharge/100)} GBP travel component. ` : '';\n  const quoteNotes = clean(`${venueText}${travelText}${clean(b.notes,1200)}`,1500);",
  'manual venue quote handling'
);

fs.writeFileSync(path, s);
console.log('Consolidated E46 full supported arrive-and-drive and combined track/race support packages.');
