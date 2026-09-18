# Afiléon Pitlane Android

Afiléon Pitlane is the Android track-day companion for Afiléon Motorsport.

## Current public release

The version currently published for customers is **v0.2** (`versionCode 2`).

Public APK:
`dist/Afileon-Pitlane.apk`

Automatic update manifest:
`dist/pitlane-update.json`

APK SHA-256:
`3b6612c3f8a72cb64a4d6d7a6c546db5698157803ec0d9a210a84b39bf649da2`

Signing-certificate SHA-256:
`3ecf73f03717fdbe6e7adae2f959541526c18b5d736c385d2b3a1261d51655af`

The CI workflow verifies the expected signing-certificate fingerprint before it will publish an APK, and the update manifest includes both the APK checksum and signer fingerprint.

## Signing status

Pitlane is currently distributed directly from Afiléon Motorsport rather than Google Play. The public v0.2 build uses a **pinned, long-lived Pitlane update identity** so direct-download upgrades retain a stable signer.

The current CI keystore still uses Android debug-keystore conventions internally. Treat this as the direct-download/test-release signing identity, not Google Play production signing. A future Play-store release should migrate to a separately protected production signing key and Play App Signing without changing the public documentation until that migration is actually complete.

## Development notes

Files such as `README-v0.4.3-customer-first.md` describe later development/UI work in the repository. They **do not mean v0.4.3 is the currently published APK** unless `dist/PUBLIC_RELEASE_VERSION.txt` and `dist/pitlane-update.json` also say so.
