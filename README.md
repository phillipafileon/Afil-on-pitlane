# Afiléon Pitlane Android

Afiléon Pitlane is the Android track-day companion for Afiléon Motorsport.

## Current public release

The version currently published for customers is **v0.2.1** (`versionCode 3`).

Public APK:
`dist/Afileon-Pitlane.apk`

Automatic update manifest:
`dist/pitlane-update.json`

APK SHA-256:
`1ca2ab384bf75fd04c1acd8b84947722e32e24dabf51014f8770b9810ec6d30c`

Signing-certificate SHA-256:
`3ecf73f03717fdbe6e7adae2f959541526c18b5d736c385d2b3a1261d51655af`

The CI workflow verifies the expected signing-certificate fingerprint before it will publish an APK. The update manifest includes both the APK checksum and signer fingerprint.

## Signing and update status

Pitlane v0.2.1 is built as a **signed non-debug release APK** while retaining the same pinned, long-lived Pitlane signing identity used by the earlier direct-download build. This preserves update compatibility.

The app now prefers the stable Afiléon Motorsport website update manifest and website-hosted APK. GitHub remains a fallback source rather than the primary update path.

The current signing certificate is intentionally retained for upgrade compatibility. A future Google Play release can migrate to Play App Signing as a separately planned release process.

## Development notes

Files such as `README-v0.4.3-customer-first.md` describe later development/UI work in the repository. They **do not mean v0.4.3 is the currently published APK** unless `dist/PUBLIC_RELEASE_VERSION.txt` and `dist/pitlane-update.json` also say so.
