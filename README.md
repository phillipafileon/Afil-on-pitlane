# Afiléon Pitlane Android

Afiléon Pitlane Android test build. The current Android shell packages the Pitlane v6.1 offline-first application inside the APK and exposes Android location permission to the GPS logger.

## Installable APK
GitHub Actions builds `Afileon-Pitlane.apk` after each push to `main`. Open the latest workflow run and download the `Afileon-Pitlane-APK` artifact.

## Important
This is an early test build. It uses Android's debug signing identity and is intended for development/testing, not Google Play production release. A production signing key must be configured before public distribution so upgrades retain a stable signing identity.
