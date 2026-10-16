# No-customer-record migration option (16 October 2026)

The owner has confirmed **there are no existing customer records** that need transferring. This allows an empty Neon PostgreSQL database as the new live application database **provided that** existing operational settings are separately checked or deliberately recreated. The project must not pretend the original Railway database has been copied.

## Confirmed staging

- Render API: `https://afileon-api-migration-staging.onrender.com`, free-tier Docker web service in Frankfurt, deployment reported live.
- Neon PostgreSQL 18: project `divine-art-98410128`, database `afileon_staging`, Frankfurt. Application migration has created more than 20 tables; main customer tables `bookings`, `orders`, `gift_vouchers`, `shop_products` each confirmed empty.
- The live Stripe account is accessible through ChatGPT Stripe integration, but the Render API health says `stripe: false`; connecting Stripe to ChatGPT **does not install a secret key or webhook signing secret into Render**.
- Render staging shop says `printful_connected: false`, `checkout_live: false`, and catalogue is empty. Admin password and email transport remain to be reconfigured and verified.
- A prepared **race-team-first** website ZIP, derived from `AFILEON_MOTORSPORT_v6_30_3_RACE_TEAM_FIRST_SERVICES_CLEAR_2026-10-15.zip`, has been saved to the user's Library under `/Afileon Motorsport/AFILEON_MOTORSPORT_RACE_TEAM_FIRST_RENDER_NEON_STAGING_PREPARED_2026-10-16.zip`. It replaces 18 stale API URL occurrences across 13 files, including 6 in Cloudflare `_headers`. The ZIP is not yet published and the old ZIP is preserved.

## Important distinctions

**No customer records ≠ no operational data.** The Railway database may also contain manual blackout dates, admin availability rules, priority recovery settings, product and pricing customizations, vouchers or coupons, and audit records. If those exist and matter, they must be reconstructed separately. Never say those have been transferred.

**Do not activate real checkout or emails before configuration.** Re-enter Stripe API secret + correct webhook signing secret, Printful API/store credentials, SMTP2GO API key, and admin login username/password hash securely into Render's environment. Do not put these in GitHub or chat. Test signature validation and non-destructive checkout in Stripe test mode first; the live Stripe MCP connection does not expose those credentials.

**Do not deploy the prepared ZIP to production prematurely.** The static Pages frontend will call Render staging immediately, even when Stripe and Printful are disabled, and Render free web services can sleep/cold-start. Test all end-to-end features and decide explicitly whether this is acceptable for live payment webhooks.

To finish on user's behalf, first arrange authorized access to their Cloudflare Pages account for a browser-assisted deployment, or ask user to upload the prepared ZIP manually. Then verify live website paths, Stripe/Printful endpoints, Android client API origin, admin login, email, quote requests, booking flow, and cron handoff. Existing Railway data/volume remain untouched.
