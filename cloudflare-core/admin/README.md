# Owner-only admin authentication staging gate

Extracted from the compiled Render patch order: `runtime_admin_ops_patch.cjs` adds hashed `adms_` bearer sessions; `runtime_admin_password_login_patch.cjs` replaces email OTP with a password login using salted Node scrypt, enforces a ten-minute per-device login cooldown, and persists sessions in `admin_sessions`.

The initial Cloudflare `admin/owner-session.mjs` is deliberately **read-only** and **not imported by the Worker**:
- Accepts a cryptographically strong `Bearer adms_...` token only, SHA-256 hashes it as the existing backend does, checks `admin_sessions` in D1 for validity and non-revocation, and requires an exact owner identity configured from Cloudflare encrypted/environment settings.
- Explicitly denies absent/bad credentials, revoked/expired tokens, wrong user, unauthorised web origins, missing configuration and database errors.
- Refuses legacy shared `x-admin-token` fallback; no customer Pitlane route, cookie-authentication bypass or administrator-write endpoint is enabled.
- Native app clients may have no Origin header; bearer authentication is still required. Configure exact authorised HTTPS origins before enabling any browser-based admin UI.
- Does NOT yet support logging in, secret/password hashing, cooldown tables, logout, admin audit, staff role separation, SPARK tools, workshop forms, D1 real-session integration or multi-device security.
- Existing production sessions SHOULD NOT be exported as live bearer tokens or shared publicly. Prefer explicit reauthentication after the future cutover.
