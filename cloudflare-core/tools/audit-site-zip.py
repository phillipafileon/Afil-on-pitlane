#!/usr/bin/env python3
"""Read-only, stdlib-only audit of a Cloudflare Pages ZIP against the staging Worker.

Usage: python3 audit-site-zip.py WEBSITE.zip [--worker cloudflare-core/dashboard-staging-worker.js]
Never uploads the ZIP, executes site scripts, or changes Cloudflare resources.
"""
import argparse
import json
import re
import sys
from pathlib import Path
from zipfile import BadZipFile, ZipFile

RENDER_ORIGIN = "https://afileon-api-migration-staging.onrender.com"
PUBLIC_PATHS = (
    "/api/config", "/api/availability", "/api/business-availability",
    "/api/bookings/hold", "/api/travel-estimate", "/api/quotes",
    "/api/shop/products", "/api/shop/checkout", "/api/season",
)
PRIVATE_PATHS = (
    "/api/admin/auth/login", "/api/admin/workshop/sync",
    "/api/admin/summary", "/api/admin/booking-record/",
)


def audit(zip_path, worker_source):
    with ZipFile(zip_path) as z:
        names = set(z.namelist())
        required_files = {"index.html", "assets/live-booking.js", "admin.html", "spark-contract.json"}
        missing_files = sorted(required_files - names)
        scanned = {}
        for name in sorted(names):
            if name.endswith((".html", ".js", ".json")) and not name.endswith("/"):
                scanned[name] = z.read(name).decode("utf-8", errors="replace")
    render_files = sorted(name for name, content in scanned.items() if RENDER_ORIGIN in content)
    render_occurrences = sum(content.count(RENDER_ORIGIN) for content in scanned.values())
    worker_routes = set(re.findall(r"""path\s*===\s*["'](/api/[a-z0-9/-]+)["']""", worker_source))
    client_paths = set()
    for content in scanned.values():
        client_paths.update(re.findall(r"/api/[a-z0-9/-]+", content))
    expected = PUBLIC_PATHS + PRIVATE_PATHS
    routes = {path: {"client_references": sum(path in s for s in scanned.values()),
                     "staging_worker_implements": path in worker_routes}
              for path in expected}
    return {
        "zip_name": Path(zip_path).name,
        "files_total": len(names),
        "text_files_scanned": len(scanned),
        "required_site_files_missing": missing_files,
        "render_origin_file_count": len(render_files),
        "render_origin_occurrences": render_occurrences,
        "render_origin_files": render_files,
        "worker_read_routes": sorted(worker_routes),
        "sample_client_routes": sorted(client_paths)[:120],
        "critical_route_matrix": routes,
        "safe_to_replace_render_backend": False,
        "reason": "The ZIP points at Render and the staging Worker has no booking/payment/admin write routes."
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("zip", type=Path)
    parser.add_argument("--worker", type=Path,
                        default=Path(__file__).resolve().parents[1] / "dashboard-staging-worker.js")
    args = parser.parse_args()
    try:
        result = audit(args.zip, args.worker.read_text(encoding="utf-8"))
    except (OSError, BadZipFile, ValueError) as exc:
        parser.error(str(exc))
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 1 if result["required_site_files_missing"] else 0


if __name__ == "__main__":
    sys.exit(main())
