# SPARK Balanced integration (development branch)

This branch adds an **offline deterministic command controller** and a protected Pitlane entry point. This is not yet a local generative AI or offline speech recognition.

## Permissions
- Default autonomy: Balanced, saved privately on the phone.
- Pitlane allows only view navigation, session *preparation* and local notes.
- SPARK and Pitlane must be signed with the **same pre-existing Pitlane certificate**. Android signature permission blocks third-party callers.
- It does not start GPS timing, alter lap history, or read/copy customer information.
- Booking actions are **proposals**, not updates. See the separate Cloudflare site preview ZIP that adds the authenticated `admin.html#spark=...` review bridge.
- The website always requires its existing admin session and an explicit confirm for calendar blocks or booking notes.
- No deletion, checkout, Stripe, refund, or cancellation commands.
- SPARK's text commands and notes work offline; built-in text-to-speech only if an offline English voice is installed. No microphone speech recognition yet.

## Build safety
The existing `:app` Pitlane app signing certificate and `main` distribution are unchanged. The `:spark` module uses the same signing config and must be built with the stable, certificate-verified keystore. Do not publish an APK produced with a newly generated/different keystore: it will not receive Android's signature-level permission.
The existing workflow will still publish only Pitlane's APK when on main. Build/test both APKs from this feature branch before any merge.

## Prototype commands
- `open pitlane`; `open garage`; `track mode`
- `prepare Brands Hatch|Indy` (does not start timing)
- `note Check Porsche 924 rear brakes` (locally stored Pitlane notes)
- `dashboard` / `bookings` (secure admin login)
- `booking REF` (opens customer booking record)
- `block 2026-11-01 Racing` (queues an approval request)
- `job note REF Customer requested update` (queues an approval request)

### Test before enabling on the production website
1. Build SPARK and Pitlane with identical **verified existing** signing certificate.
2. Install both on a test phone; validate offline Pitlane navigation and note persistence.
3. Open Cloudflare website ZIP as **preview**; authenticate in admin and test valid/invalid proposal links.
4. Verify service-specific availability behaviour with a test day before using live admin endpoints.
5. Confirm confirmation prompts and refusal of unknown operations; verify blocked third-party APK signatures.
