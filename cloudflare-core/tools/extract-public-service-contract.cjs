// Staging-only compilation helper. Extracts public service catalogue from the final
// Docker-patched server WITHOUT starting the server, connecting to Neon, or reading secrets.
// Assumption: service literals remain a self-contained array in final server_v3.js.
const fs = require("node:fs");
const vm = require("node:vm");
const server = fs.readFileSync("server_v3.js","utf8");

function variableExpression(name, endMarker) {
  const marker = "const " + name + " = ";
  const start = server.indexOf(marker);
  if (start < 0) throw new Error("Missing "+marker);
  const begin = start + marker.length;
  const end = server.indexOf(endMarker, begin);
  if (end < 0) throw new Error("Missing end marker for "+name);
  return server.slice(begin, end).trim();
}
// E46_BOOKING_LIVE is environment-specific. Fail-closed: false in staging snapshot.
const services = vm.runInNewContext(variableExpression("SERVICES","\n];") + "]", { E46_BOOKING_LIVE: false }, { timeout: 1000 });
if (!Array.isArray(services) || services.length < 2 || services.length > 20)
  throw Error("Unexpected service count");
for (const s of services) {
  if (!s.id || !s.name || !Array.isArray(s.variants) || !["full","e46_rule","quote"].includes(s.payment))
    throw Error("Invalid service record");
  if (typeof s.bookable !== "boolean") throw Error("Missing boolean bookable");
}
const cutoffExpression=variableExpression("BOOKING_CUTOFFS","\n};")+"}";
const cutoffs=vm.runInNewContext("(" + cutoffExpression + ")", {}, { timeout: 1000 });
const slots=vm.runInNewContext(variableExpression("INSPECTION_SLOTS",";"),{}, {timeout:1000});
if(!cutoffs.vehicle_hire_day || !cutoffs.pre_track_inspection || !Array.isArray(slots)) throw Error("Missing cutoff policies");
const output={generated_by:"compiled-docker-patch-chain",staging_hire_enabled:false,services,booking_cutoffs:cutoffs,inspection_slots:slots};
const json=JSON.stringify(output);
if(json.length > 20000)throw Error("Unexpectedly large public catalogue; inspect before exporting");
// This is ONLY a public service catalogue: no prices from private overrides, no customer data.
console.log("AFILEON_PUBLIC_CATALOGUE_BEGIN");
console.log(json);
console.log("AFILEON_PUBLIC_CATALOGUE_END");


function routeSnippet(anchor) {
  const start = server.indexOf(anchor);
  if(start < 0) throw Error("Missing final route "+anchor);
  // Only output the first handler body (the public route; don't expose admin / private data).
  const end=server.indexOf("\n});",start);
  if(end<0 || end-start>7000) throw Error("Unexpected final public handler length: "+anchor);
  const snippet=server.slice(start,end+5);
  console.log("AFILEON_ROUTE_"+(anchor.includes("/api/config")?"CONFIG":"SERVICES")+"_BEGIN");
  console.log(snippet);
  console.log("AFILEON_ROUTE_"+(anchor.includes("/api/config")?"CONFIG":"SERVICES")+"_END");
}
routeSnippet("app.get('/api/config'");
routeSnippet("app.get('/api/services'");
