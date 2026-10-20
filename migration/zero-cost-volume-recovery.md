# Zero-paid-plan Railway data recovery route — 16 October 2026

**Aim:** recover original PostgreSQL data without paying for Railway hosting, if the account and volume still permit direct CLI downloads. We have **not** completed this export.

## Findings from the connected services

- Railway project: `bab718d9-42c3-452d-9abf-39076dbabca5`.
- PostgreSQL service: `e945e2b6-a395-44f7-8a67-3bb7f9b0f57c`.
- Existing persistent volume: `8230a2a8-ff15-49ba-9c06-f5657c506f45` / `postgres-volume`, mounted at `/var/lib/postgresql/data`.
- All 5 old Railway services are offline, but Railway still lists the volume.
- A new free Neon PostgreSQL 18 database exists under project `divine-art-98410128`.
- Render free staging API exists at `https://afileon-api-migration-staging.onrender.com`.
- Original customer tables on Neon have **not** been imported; the API created an empty schema.

Railway's documentation supports downloading volume files **using Railway CLI**, including directories, independently of a public PostgreSQL TCP endpoint:

https://docs.railway.com/cli/volume#manage-files

This method has not been verified against this account's expired trial status, so **do not assume access or zero network charges without confirming them**. Do not restart/redeploy the old PostgreSQL service without verifying Railway account billing conditions. Railway's trial documentation says account volumes are deleted 30 days after trial credit expiry, making data preservation time-sensitive.

## Minimum access check (read-only)

On a trusted computer where `railway` CLI is installed and signed in using `railway login`, try:

```sh
railway volume list --project bab718d9-42c3-452d-9abf-39076dbabca5 --environment 3521480b-5254-4da1-af87-56b6eb1accf5
railway volume files --volume 8230a2a8-ff15-49ba-9c06-f5657c506f45 list /
```

If the listing succeeds and contains `PG_VERSION`, `base/`, `global/` and `pg_wal/` (or an equivalent PGDATA path), the existing PostgreSQL physical data files may be accessible. If there is an existing SQL/custom archive backup, use that instead.

## Read-only copy to private local storage

Download the whole volume, **not individual PostgreSQL tables**:

```sh
railway volume files --volume 8230a2a8-ff15-49ba-9c06-f5657c506f45 download / ./afileon-railway-pgdata --concurrency 4
```

Some Railway CLI versions require `-p <project-id> -e <environment-id>` at the root command or prior `railway link`; check `railway volume files --help` if the selected project is not resolved.

Treat this as **sensitive customer data**. Do not place the downloaded directory, any database dump, Neon connection string, or Railway access token in GitHub, public attachments, or website files. Store the copy encrypted on a private device.

**WARNING:** A PostgreSQL physical data directory is **not** a logical `pg_dump` archive. It must first be recovered using a compatible PostgreSQL 18 server, and the server should be started from a **copy** of the downloaded directory, never the sole backup. Crash consistency, WAL, extensions, OS and binary compatibility must be checked. The PostgreSQL 18 image was Railway's custom `ghcr.io/railwayapp-templates/postgres-ssl:18`, and a different image may not always open its PGDATA directly.

After a safe read-only recovery snapshot has been secured, work on a second copy and, if possible, start the compatible PG server locally and produce a logical custom-format dump (`pg_dump --format=custom --no-owner --no-acl`). Import that into a **fresh** Neon database, verify every table's row count, then switch Render's `DATABASE_URL` to the recovered database.

## Live cutover must wait for

1. Validated database record counts and important business state.
2. Reentered Stripe/Printful/SMTP/admin secrets via private dashboards (Railway OAuth provides variable **names only**).
3. Tested admin login, booking rules, gift vouchers, shop, Stripe webhook signatures, Printful webhooks and transactional email.
4. Controlled update of the static Cloudflare Pages API origin(s), Android client URLs and webhooks.
5. Reminder cron migration with no duplicate notifications.

## What not to do

- Do not delete or detach the Railway Postgres volume.
- Do not point Cloudflare Pages to the staging API, because existing data is missing.
- Do not activate live charges, webhooks, order fulfilment or customer notifications in staging.
- Do not commit dumps or tokens to this public GitHub repository.
- Do not confuse the 15 October website ZIP archives with database backups; they hold static web files, not PostgreSQL records.

If the volume CLI reports that the account requires payment even to read the files, **stop without upgrading** and assess non-Railway backup sources. Do not authorize a paid plan without an explicit user decision.
