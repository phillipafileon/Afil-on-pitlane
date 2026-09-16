const fs = require('fs');
const path = 'server_v3.js';
let s = fs.readFileSync(path, 'utf8');

function replaceOnce(from, to, label) {
  if (s.includes(to)) return;
  if (!s.includes(from)) throw new Error(`Cutoff correction patch: missing ${label}`);
  s = s.replace(from, to);
}

replaceOnce(
  "  vehicle_hire_day: { payment_cutoff:'11:30', checkout_start_cutoff:'10:59', label:'BMW E46 arrive-and-drive' },",
  "  vehicle_hire_day: { payment_cutoff:'11:30', checkout_start_cutoff:'11:30', label:'BMW E46 arrive-and-drive' },",
  'E46 morning cutoff'
);
replaceOnce(
  "  pre_track_inspection: { payment_cutoff:'24:00', checkout_start_cutoff:'23:29', label:'Pre-track inspection' },",
  "  pre_track_inspection: { payment_cutoff:'22:00', checkout_start_cutoff:'22:00', label:'Pre-track inspection' },",
  'inspection late-evening cutoff'
);
replaceOnce(
  "  default: { payment_cutoff:'20:00', checkout_start_cutoff:'19:29', label:'Track-day service' }",
  "  default: { payment_cutoff:'20:00', checkout_start_cutoff:'20:00', label:'Track-day service' }",
  'track service cutoff'
);

replaceOnce(
  "detail:'For tomorrow's '+policy.label+', secure checkout must be started before '+policy.checkout_start_cutoff+' and payment completed before '+(policy.payment_cutoff === '24:00' ? 'midnight' : policy.payment_cutoff)+'. Choose a later date.'",
  "detail:'For next-day '+policy.label+', secure checkout must be started before '+policy.checkout_start_cutoff+' and payment completed before '+(policy.payment_cutoff === '24:00' ? 'midnight' : policy.payment_cutoff)+'. Choose a later date.'",
  'generated cutoff message syntax'
);

replaceOnce(
  "expires_at:Math.floor(new Date(b.hold_expires_at).getTime()/1000),",
  "expires_at:Math.floor(Math.max(new Date(b.hold_expires_at).getTime(),Date.now()+31*60000)/1000),",
  'Stripe minimum checkout expiry'
);

fs.writeFileSync(path, s);
console.log('Corrected next-day cutoffs: E46 11:30am, track services 20:00, inspection 22:00.');
