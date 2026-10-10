#!/usr/bin/env bash
# Non-mutating checks against a staging API. Does NOT verify checkout, bookings or database parity.
set -euo pipefail
url="${1:?Pass the Render staging URL, e.g. https://example.onrender.com}"
url="${url%/}"
echo "Checking staging health: $url/health"
curl --fail-with-body --silent --show-error --connect-timeout 15 --max-time 110 \
  --header "Accept: application/json" "$url/health"
echo
echo "Health endpoint returned successfully. Complete the full manual checklist in migration/README.md."
