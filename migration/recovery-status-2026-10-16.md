# Recovery and migration status — 16 October 2026

**Status: migration preparation only; no production cutover or database restoration has occurred.**

## What is verifiable

- Railway project `Afileon Live Services` continues to list 5 services, but the `environment_status` action reports **offline** for **all five**, including `Afileon Live API`, `Postgres`, `Balance Reminder Cron`, and the two Pitlane web deployments.
- The PostgreSQL persistent volume `postgres-volume` remains listed as attached to the `Postgres` service. This **does not prove its content has been exported or is currently accessible**.
- The Railway PostgreSQL service currently has **no external TCP proxy**. A temporary connection or other authorized backup route will be necessary before any `pg_dump` can run.
- The public static website `https://afileonmotorsport.co.uk` loads, while the Railway API health URL was not accessible in an external check. Do not assume bookings, checkout, admin, or reminders are functional.
- Library website backups present: `AFILEON_MOTORSPORT_LIVE_MATCH_v6_30_3_2026-10-15.zip` and `AFILEON_MOTORSPORT_v6_30_3_RACE_TEAM_FIRST_SERVICES_CLEAR_2026-10-15.zip`. Both ZIPs were inspected: they contain static website pages, scripts and assets, **not a database dump** (no PostgreSQL .dump/.backup/.sql or equivalent).
- Twelve files in the live-match backup include the literal origin `https://afileon-live-api-production.up.railway.app`:
  `booking-success.html`, `shop-success.html`, `admin.html`, `damage-security.html`,
  `assets/gift-voucher-success.js`, `assets/priority-recovery.js`, `assets/live-booking.js`,
  `assets/business-availability.js`, `assets/dynamic-pricing.js`, `assets/shop.js`,
  `assets/gift-vouchers.js`, and `assets/seasonal.js`.
  The API origin must be updated consistently in the eventual Cloudflare Pages artifact (and check the Pitlane Android app and Stripe/Printful webhooks separately).

## Blockers and safe next steps

1. The **Render** and **Neon** app integrations are not connected to ChatGPT. The user must authorize/enable them before their accounts can be provisioned or configured on their behalf.
2. Once connected, provision **non-production staging**, securely transfer only required secret values, and deploy the existing Docker API. Never print secrets into issues, PRs, workflow logs or documentation.
3. **Do not assume the static ZIP is a complete backup of customer records.** Recover an actual PostgreSQL dump from the existing Railway volume (or find an independently verified previous SQL dump). If Railway has exhausted credit, restoring access may require action inside the Railway account. Do not delete the volume or issue a destructive redeploy.
4. Confirm archive schema/table counts and date coverage after importing to Neon. Take a final consistent snapshot before a live switch to prevent any missing bookings or payments.
5. Only after validated database parity and functional smoke tests should the hosted website/API configuration and Stripe/Printful callbacks be changed. Coordinate the hourly cron handoff without double-sending email.
6. Avoid treating Render Free as a safe production platform for live payments: it sleeps after inactivity and has other production restrictions.

**Current integrity goal:** preserve the current static website and any Railway PostgreSQL data, then restore a working live backend only after safe destination verification.
