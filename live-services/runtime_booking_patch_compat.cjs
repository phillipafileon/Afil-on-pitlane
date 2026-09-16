const fs = require('fs');
const p = 'runtime_booking_pricing_patch.cjs';
let s = fs.readFileSync(p,'utf8');
const old = `function replaceOnce(from, to, label) {\n  if (!s.includes(from)) throw new Error(\`Booking pricing patch: missing \${label}\`);\n  s = s.replace(from, to);\n}`;
const neu = `function replaceOnce(from, to, label) {\n  if (!s.includes(from)) {\n    if (label === 'config travel metadata') {\n      const marker = "r.json({ services: SERVICES.map(publicService),";\n      if (!s.includes(marker)) throw new Error(\`Booking pricing patch: missing \${label}\`);\n      s = s.replace(marker, "r.json({ services: SERVICES.map(publicService), venues: Object.values(KENT_VENUES), operations_base: OPERATIONS_BASE.name, min_lead_days: 1,");\n      return;\n    }\n    throw new Error(\`Booking pricing patch: missing \${label}\`);\n  }\n  s = s.replace(from, to);\n}`;
if(!s.includes(old)) throw new Error('booking patch compatibility marker missing');
s=s.replace(old,neu);
fs.writeFileSync(p,s);
console.log('Made booking config patch compatible with prior runtime rewrites.');
