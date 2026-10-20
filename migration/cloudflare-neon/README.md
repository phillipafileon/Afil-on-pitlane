# Cloudflare Workers + Neon — migration staging

Created 16 October 2026. This branch is **not** deployed. It does not change the production website, Stripe webhooks, scheduled reminders or Railway services.

The production Afiléon Motorsport API is an Express application built from `live-services/Dockerfile` with many source-transformation steps, including transaction-based booking safeguards, Printful image generation and timed reminders. A full migration requires keeping all these features working.

## Migration checkpoints

1. Locate and verify the actual PostgreSQL data export. The earlier draft PR #29 contains backup and restore *scripts*, not the backup itself. Website ZIP files are not database records.
2. Create Neon staging and restore the backup to a new empty database; compare booking, shop, payment, voucher, calendar and gallery records.
3. Prepare and test the patched Express build under Cloudflare Workers Node compatibility and an appropriate PostgreSQL connection strategy. Verify that Node file-writing during boot, `sharp`, timers and advisory locks do not break.
4. Transfer environment secrets privately through provider settings rather than source code.
5. Confirm complete compatibility for Stripe, Printful, email, bookings, admin, manual cash jobs and Android app endpoints in isolation.
6. Change customer-facing API origins and webhook destinations only after tests and final database reconciliation.
7. Enable exactly one reminder scheduler after cutover; preserve rollback.

## Source documentation

- [Express on Cloudflare Workers](https://developers.cloudflare.com/workers/tutorials/deploy-an-express-app/)
- [Neon database connectivity](https://developers.cloudflare.com/workers/databases/third-party-integrations/neon/)
- [Cloudflare cron](https://developers.cloudflare.com/workers/configuration/cron-triggers/)

**Current status:** staging configuration files, planning and compatibility assessment only; the replacement API has not been deployed and is not production-ready.
