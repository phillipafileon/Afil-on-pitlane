# Afiléon Motorsport — Railway to Render + Neon (staging)

Prepared 10 October 2026. This is a **non-destructive migration plan**. Railway and Cloudflare Pages remain live until a verified cutover. Nothing in this directory should be interpreted as a database export or a completed deployment.

## Existing Railway inventory (production)

- **Afileon Live API** — Node 20/Express + PostgreSQL + Stripe + Printful + email; GitHub `phillipafileon/Afil-on-pitlane`, directory `live-services`, Dockerfile, `npm start`, `/health`.
- **Afileon Pitlane Web** — Node static web server, directory `web`, no public Railway domain.
- **Afileon Pitlane Web Live** — another web deployment of the same GitHub repository, with a Railway-generated domain.
- **Postgres** — PostgreSQL 18 image, 500 MB attached volume at `/var/lib/postgresql/data`; **must transfer actual database records** and verify counts, not merely redeploy the image.
- **Balance Reminder Cron** — hourly `0 * * * *`, POST to `$LIVE_API_URL/api/cron/balances`, header `x-cron-secret: $CRON_SECRET`.

There is also one **staged, not live** Railway change: `PRINTFUL_GALLERY_API_TOKEN`. Verify whether this value should be incorporated into the new service before switching the Printful gallery.

## Target map

| Railway component | Target |
| --- | --- |
| Live API | Render web service, initially **free staging** via root `render.yaml` |
| Postgres | Neon PostgreSQL, new empty project, ideally matching PostgreSQL major version |
| Balance Reminder Cron | GitHub Actions workflow, with explicit enablement **only at cutover** |
| Pitlane Web and Web Live | Existing Cloudflare Pages production website; confirm current Pages deployment contains required functionality before retiring Railway web services |

The two Railway web services must NOT be removed until we verify what, if anything, still calls their Railway URLs. The web branch on GitHub and Cloudflare production may differ.

## Phase 1 — destination accounts and secure credentials

1. Connect **Render** and **Neon** to ChatGPT / authorize the respective accounts. Do not put tokens or passwords in GitHub or chat.
2. Create a Neon database and deploy the Render staging API from `render.yaml` (no domain cutover yet).
3. Copy **all** Railway API variable names and values securely into Render. Critical variables include `DATABASE_URL` (Neon), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PRINTFUL_API_TOKEN`, `PRINTFUL_GALLERY_API_TOKEN`, `PRINTFUL_STORE_ID`, `ADMIN_LOGIN_PASSWORD_HASH`, `ADMIN_TOKEN`, `CRON_SECRET`, `SMTP2GO_API_KEY`, `SITE_URL`, `NODE_ENV`. Also copy feature flags, pricing revisions, booking rules, admin session settings, SMTP settings, and all other currently used Railway variables. Do not accidentally use a Railway private DNS name on Render.
4. For a migration test, avoid sending real booking reminders, charging customers, or duplicating Stripe and Printful webhook events. Do not point production webhooks at staging.
5. Render free containers block outbound SMTP ports 25, 465 and 587. Confirm transactional emails use an HTTPS API such as SMTP2GO, rather than assuming SMTP continues to work.

## Phase 2 — exact database copy

Railway's Postgres service uses a persistent volume; the data is NOT in GitHub. Export using `pg_dump` and restore with `pg_restore` (see `migration/postgres-transfer.sh`). You need a PostgreSQL connection address reachable from the machine running these commands. Railway private hostnames such as `.railway.internal` are **not** externally reachable. Provision a temporary securely controlled TCP endpoint, or execute the export from a service on Railway's private network. Remove temporary access after use.

Keep the dump **off GitHub** and encrypted at rest. The transfer script deliberately refuses to restore into a destination with existing user tables. Match client and database version compatibility, and compare schema/table row counts, especially `bookings`, `orders`, `availability_blocks`, payments, shop products and gift vouchers.

### Consistency at cutover

Staging can be loaded with a snapshot, but records can change while the old website stays open. Before switching, arrange a short controlled write freeze or final incremental catch-up, then take a final backup and restore. Do not lose bookings created between the first copy and cutover. This is crucial for Stripe payments.

## Phase 3 — staging verification

Run `bash migration/verify-api.sh https://<render-staging-host>` then manually verify:

- Database schema, booking counts and latest timestamps match.
- Availability rules, global booking pause and cash/manual booking handling.
- Admin login, sessions, pricing, deposits, outstanding balances and damage preauthorization handling.
- Printful products, real product mockups and image gallery endpoints.
- SMTP2GO transactional email via API; no duplicate reminders.
- Stripe read operations and **test-mode** checkout/refund/webhook flow on an isolated test environment (never replay actual live payment or fulfilment events).
- CORS and production website front-end API URL. Check Cloudflare Pages routes and Android app API endpoints.
- Original GitHub deploy source and any API paths referring to `*.up.railway.app`.

## Phase 4 — controlled cutover (NOT performed)

1. Confirm new service passes staging checks and can accept sustained production traffic. **Render advises its free web service is not appropriate for production**: it sleeps after 15 minutes idle and takes time to wake, which can hurt payment and recovery bookings.
2. Freeze writes briefly, reconcile final database changes and verify the resulting Neon records.
3. Update Cloudflare Pages API route/origin and Stripe/Printful webhook endpoints, preserving old domain responses long enough for retries.
4. Enable `.github/workflows/balance-reminders-migrated.yml` schedule and set secrets `LIVE_API_URL`, `CRON_SECRET`; disable Railway hourly cron so reminders are **not sent twice**.
5. Monitor Stripe and Printful webhooks, booking creation, email delivery and admin; maintain rollback instructions.
6. Only after the observation period should Railway services and its database be retired.

### Notes

- Database migration requires a **real** PostgreSQL data transfer; pointing the new API at the old Railway DB is only temporary staging.
- No real Stripe keys, admin passwords, SMTP credentials, or tokens are committed in this branch.
- Avoid accidentally enabling the new cron until Railway's cron is off.
- A longer-term truly serverless approach on Cloudflare Workers would need a deliberate refactor of the Node/Express and `pg` workload and thorough integration tests.
