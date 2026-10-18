# SPARK Hybrid E2B — setup and safety

This is a DEVELOPMENT integration for SPARK v0.3.0. It does not deploy itself.

## Architecture

SPARK's offline GGUF model, speech, Pitlane and Booking Manager controls remain local. E2B is connected through a separately hosted Node HTTPS gateway. The E2B API key is server-side only, never bundled in the APK or Cloudflare website.

SPARK sends only code explicitly entered with the prefix "E2B python:". No chat histories, repair logs, signatures or booking data are automatically transmitted. Balanced autonomy means the user first agrees to send code, then reviews an expiring, one-use cloud execution proposal.

An approved run starts a fresh E2B sandbox with internet egress disabled, writes the approved Python code, runs the fixed python3 command, returns bounded stdout/stderr and attempts sandbox destruction. No Afiléon website credentials are available to the sandbox.

## Private secrets and gateway deployment

1. Obtain an E2B API key from https://e2b.dev/. E2B is an external paid service; check the current prices and credits.
2. Privately generate a random pairing token: openssl rand -hex 32
3. Compute its SHA-256 hex digest: printf '%s' 'YOUR_RANDOM_TOKEN' | sha256sum
4. On a separate Render Node service, deploy the spark-e2b-gateway folder (root directory). Build command: npm install --omit=dev ; start: npm start. An example render.yaml is included.
5. Add private server environment variables E2B_API_KEY and SPARK_GATEWAY_TOKEN_SHA256 (the 64-character digest). Never put these in the APK, frontend ZIP, a commit, or ChatGPT.
6. Use the HTTPS Render service URL. The raw pairing token is entered once in SPARK; Android Keystore encrypts it.

## Phone pairing

Install SPARK v0.3.0 from the signed Android CI artifact. In SPARK tap E2B CLOUD / SETTINGS, choose Configure secure gateway, supply HTTPS URL and pairing token, and check connection.

Try: E2B python: print(6 * 7)

SPARK shows the code to be sent, then shows it again before a cloud sandbox is created. The gateway enforces the one-use approval even if someone bypasses the phone UI.

## Constraints

- Only manually authorised Python sandbox execution is enabled. Live website code changes, deploys, bookings, payments and cancellations are NOT authorised.
- Approval expires after two minutes. Max 3,000 characters, six executions per hour per service instance, one concurrent execution. E2B creation timeout is 120 seconds; command timeout is 25 seconds.
- Gateway pairing token is NOT the provider API key. Use a random independent token. Requests require HTTPS on Android.
- All offline AI, local commands and signed-app interactions work independently of the gateway. Cloud prompts never auto-run when connectivity returns.
- The gateway protocol tests run against a mock sandbox; they don't prove E2B account connectivity or billable execution.
- APK build success is not physical phone QA. Test before rolling out.
- The older Pitlane bridge should not be installed over any newer Pitlane release; preserve the original signer and production download.

Before public deployment, protect /staff-apps/* with Cloudflare Access or distribute the APKs privately.
