#!/usr/bin/env python3
"""Prepare a copy of a Cloudflare Pages ZIP for a new API origin. Does not deploy."""
import argparse
from pathlib import Path
from urllib.parse import urlparse
from zipfile import ZipFile

OLD = b"https://afileon-live-api-production.up.railway.app"
ALLOWED = (".html", ".js", ".json", ".webmanifest")
EXPECTED_FILES = {
    "booking-success.html",
    "shop-success.html",
    "admin.html",
    "damage-security.html",
    "assets/gift-voucher-success.js",
    "assets/priority-recovery.js",
    "assets/live-booking.js",
    "assets/business-availability.js",
    "assets/dynamic-pricing.js",
    "assets/shop.js",
    "assets/gift-vouchers.js",
    "assets/seasonal.js",
    "_headers",
}

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("source_zip", type=Path)
    p.add_argument("new_api_origin", help="New HTTPS origin; no trailing path e.g. https://staging.example.com")
    p.add_argument("--output", type=Path, required=True)
    a = p.parse_args()
    url = urlparse(a.new_api_origin)
    if url.scheme != "https" or not url.hostname or url.path not in ("", "/") or url.query or url.fragment or url.username or url.password:
        p.error("new_api_origin must be a bare HTTPS origin with no username/path/query/fragment")
    new = (url.scheme + "://" + url.netloc).encode("ascii")
    if new == OLD:
        p.error("The new API origin is the same as the old Railway origin")
    if a.source_zip.resolve() == a.output.resolve():
        p.error("Never overwrite the original backup ZIP")
    if a.output.exists():
        p.error("Output already exists; refusing to overwrite")
    matches = {}
    with ZipFile(a.source_zip, "r") as original:
        for info in original.infolist():
            if info.is_dir():
                continue
            data = original.read(info)
            if info.filename.endswith(ALLOWED):
                count = data.count(OLD)
                if count:
                    matches[info.filename] = count
            elif OLD in data:
                p.error(f"Railway URL found in non-text asset {info.filename}; manual review required")
        if set(matches) != EXPECTED_FILES:
            p.error(f"Backup differs from audited 15 October version; investigate before replacement. "
                    f"Missing={sorted(EXPECTED_FILES-set(matches))}, extra={sorted(set(matches)-EXPECTED_FILES)}")
        a.output.parent.mkdir(parents=True, exist_ok=True)
        with ZipFile(a.output, "w") as patched:
            for info in original.infolist():
                data = original.read(info)
                if info.filename in matches:
                    data = data.replace(OLD, new)
                patched.writestr(info, data)
    with ZipFile(a.output, "r") as patched:
        remaining = [i.filename for i in patched.infolist() if not i.is_dir() and OLD in patched.read(i)]
    if remaining:
        raise SystemExit(f"ERROR: old origin remains in {remaining}")
    print(f"New un-deployed backup created at {a.output}")
    print(f"Replaced old API origin in {len(matches)} files, {sum(matches.values())} references.")
    print("Next step: validate and deploy through Cloudflare after database and API testing.")

if __name__ == "__main__":
    main()
