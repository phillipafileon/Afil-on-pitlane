const fs = require('fs');
const path = 'server_v3.js';
let s = fs.readFileSync(path, 'utf8');
function replaceOnce(from,to,label){ if(!s.includes(from)) throw new Error(`Quote travel patch: missing ${label}`); s=s.replace(from,to); }

replaceOnce(
"  if (b.requested_date && daysUntil(b.requested_date) < 1) return res.status(400).json({ error:'same_day_unavailable', detail:'Same-day bookings are not available. Please choose tomorrow or a later date.' });\n  const id = token('qt');\n  await pool.query(`INSERT INTO quote_requests(public_id,service_id,variant_id,requested_date,customer_name,customer_email,customer_phone,service_address,postcode,vehicle_details,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [id,service.id,clean(b.variant_id,60)||null,b.requested_date||null,clean(b.customer_name,120),clean(b.customer_email,200),clean(b.customer_phone,60),clean(b.service_address,500),clean(b.postcode,20),clean(b.vehicle_details,500),clean(b.notes,1500)]);\n  res.status(201).json({ quote_id: id, status: 'received' });",
"  if (b.requested_date && daysUntil(b.requested_date) < 1) return res.status(400).json({ error:'same_day_unavailable', detail:'Same-day bookings are not available. Please choose tomorrow or a later date.' });\n  if (service.addressRequired && (!clean(b.service_address) || !clean(b.postcode))) return res.status(400).json({ error:'service_address_required' });\n  let quoteTravel = { ok:true, label:'No travel charge', round_trip_miles:0, rate_pence_per_mile:0, surcharge:0 };\n  if (service.travelMode) {\n    quoteTravel = await calculateTravel(service, b);\n    if (!quoteTravel.ok) return res.status(400).json({ error:quoteTravel.reason || 'travel_unavailable', detail:quoteTravel.detail || 'Travel could not be calculated.' });\n  }\n  const venueText = service.travelMode === 'venue' ? `Venue: ${quoteTravel.label}. ` : '';\n  const travelText = service.travelMode ? `Travel from Gravesend: ${quoteTravel.round_trip_miles} mile return estimate, ${Math.round(quoteTravel.surcharge/100)} GBP travel component. ` : '';\n  const quoteNotes = clean(`${venueText}${travelText}${clean(b.notes,1200)}`,1500);\n  const id = token('qt');\n  await pool.query(`INSERT INTO quote_requests(public_id,service_id,variant_id,requested_date,customer_name,customer_email,customer_phone,service_address,postcode,vehicle_details,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [id,service.id,clean(b.variant_id,60)||null,b.requested_date||null,clean(b.customer_name,120),clean(b.customer_email,200),clean(b.customer_phone,60),clean(b.service_address,500),clean(b.postcode,20),clean(b.vehicle_details,500),quoteNotes]);\n  res.status(201).json({ quote_id: id, status: 'received', travel: quoteTravel });",
'quote endpoint travel');

replaceOnce(
"  const plan = paymentPlan(service, variant, b.booking_date, travel.surcharge);\n  if (plan.kind === 'quote') return res.status(400).json({ error: 'quote_required' });",
"  const plan = paymentPlan(service, variant, b.booking_date, travel.surcharge);\n  if (plan.kind === 'quote') return res.status(400).json({ error: 'quote_required' });\n  const venueText = service.travelMode === 'venue' ? `Venue: ${travel.label}. ` : '';\n  const travelText = service.travelMode ? `Travel from Gravesend: ${travel.round_trip_miles} mile return estimate, ${Math.round(travel.surcharge/100)} GBP travel charge. ` : '';\n  const bookingNotes = clean(`${venueText}${travelText}${clean(b.notes,800)}`,1000);",
'booking notes construction');

replaceOnce(
"clean(b.vehicle_details,500),clean(b.notes,1000),expires,plan.total,plan.now,plan.balance,notice,due,plan.balance?'scheduled':null",
"clean(b.vehicle_details,500),bookingNotes,expires,plan.total,plan.now,plan.balance,notice,due,plan.balance?'scheduled':null",
'booking notes storage');

fs.writeFileSync(path,s);
console.log('Applied travel details to quote and booking records.');
