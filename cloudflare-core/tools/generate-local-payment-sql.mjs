// CI-only: package unchanged SQL text into a local Wrangler test module.
import {readFileSync,writeFileSync} from "node:fs";
const sources={
 CLAIM_SQL:"../webhooks/claim-stripe-event.sql",
 APPLY_SQL:"../webhooks/apply-verified-booking-payment.sql",
 COMPLETE_SQL:"../webhooks/complete-verified-booking-payment.sql"
};
const output=Object.entries(sources).map(([name,path])=>{
 const sql=readFileSync(new URL(path,import.meta.url),"utf8");
 if(!sql.includes("RETURNING")|| !sql.includes("?1"))throw Error("Unrecognised SQL: "+name);
 return "export const "+name+" = "+JSON.stringify(sql)+";";
}).join("\n")+"\n";
writeFileSync(new URL("../tests/_generated-payment-sql.mjs",import.meta.url),output);
console.log("Generated CI-only payment SQL module from source files");
