// CI-only helper — embeds the current SQL in a generated, local test harness.
// Never output customer data, tokens, production secrets or a live D1 endpoint.
import {readFileSync,writeFileSync} from "node:fs";
const sql=readFileSync(new URL("../booking/atomic-booking-hold-full.sql",import.meta.url),"utf8");
if(!sql.includes("RETURNING public_id")||!sql.includes("WHERE NOT EXISTS"))
 throw Error("Unexpected SQL hold contract");
writeFileSync(new URL("../tests/_generated-hold-sql.mjs",import.meta.url),
 "export const HOLD_SQL="+JSON.stringify(sql)+";\n");
console.log("Generated local Wrangler booking SQL module");
