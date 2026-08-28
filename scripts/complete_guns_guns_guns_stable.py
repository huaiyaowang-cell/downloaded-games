#!/usr/bin/env python3
"""Stable completion for guns-guns-guns: low concurrency + retry, skip aggressive fill probing.

Reuses logic from scripts/complete_guns_guns_guns.py but runs only the high-confidence
candidates (config-derived paths + scraped references). The aggressive "fill" phase
(~5000 guesses × 5 extensions) is skipped — those are mostly 404 and trigger CDN SSL
throttling that pollutes real downloads.
"""

from __future__ import annotations

import concurrent.futures
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

# Reuse the well-tested logic from the existing script
sys.path.insert(0, str(Path(__file__).resolve().parent))
import complete_guns_guns_guns as base  # noqa: E402

OUT = base.OUT
MAX_WORKERS = 4            # low concurrency to avoid SSL EOF throttling
MAX_RETRIES = 3
RETRY_BACKOFF = 2.0        # seconds, doubles each retry


def download_with_retry(rel: str) -> bool:
    """Download with retry on transient errors (SSL EOF, 5xx, conn reset).

    Bug 1 fix: skip check is done only once before the retry loop (not on
    every iteration), so stats["skip"] isn't double-counted when SSL EOF
    triggers a retry. Idempotent existence check is delegated to base.download,
    which is the single source of truth for skip accounting.
    """
    for attempt in range(MAX_RETRIES + 1):
        # Reset any prior failure record for this rel
        base.failed[:] = [f for f in base.failed if not f.startswith(rel + " ")]
        ok = base.download(rel, overwrite=False)
        if ok:
            return True

        # Inspect last failure for this rel
        last = next((f for f in base.failed if f.startswith(rel + " ")), "")
        transient = any(s in last for s in (
            "SSL", "UNEXPECTED_EOF", "ConnectionResetError",
            "URLError", "timeout", "HTTP 5", "HTTP 429",
        ))
        if not transient or attempt == MAX_RETRIES:
            return False

        # Backoff and retry
        time.sleep(RETRY_BACKOFF * (2 ** attempt))
    return False


def collect_core_paths() -> list[str]:
    """High-confidence paths: config-derived + scraped references (no fill probing)."""
    paths: list[str] = []
    for b in base.BUNDLES:
        cfg_path = OUT / "assets" / b / "config.json"
        if not cfg_path.exists():
            continue
        cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
        paths.extend(base.collect_bundle_paths(b, cfg))

    # Dedupe
    seen: set[str] = set()
    uniq: list[str] = []
    for p in paths:
        if p not in seen:
            seen.add(p)
            uniq.append(p)

    # Add scraped paths (from already-downloaded configs/packs)
    scraped: list[str] = []
    for b in base.BUNDLES:
        scraped.extend(base.scrape_native_from_files(b))
    for p in scraped:
        if p not in seen:
            seen.add(p)
            uniq.append(p)

    return uniq


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    # Bug 3 fix: reset shared state on every run so stats don't accumulate
    # across multiple invocations of this script.
    base.stats = {"ok": 0, "skip": 0, "fail": 0, "bytes": 0}
    base.failed = []

    # 1) Entry files
    print("=== Phase 1: entry files ===", flush=True)
    entry = [
        "index.html", "index.js", "application.js", "sitelock.js", "style.css",
        "src/polyfills.bundle.js", "src/system.bundle.js", "src/import-map.json",
        "src/settings.json", "src/chunks/bundle.js", "src/effect.bin", "cocos-js/cc.js",
    ]
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        list(ex.map(download_with_retry, entry))

    # 2) Bundle configs
    print("\n=== Phase 2: bundle configs/index.js ===", flush=True)
    bundle_meta: list[str] = []
    for b in base.BUNDLES:
        bundle_meta.extend([f"assets/{b}/config.json", f"assets/{b}/index.js"])
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        list(ex.map(download_with_retry, bundle_meta))

    # 3) Core asset paths (config-derived + scraped)
    print("\n=== Phase 3: core asset paths (config-derived + scraped) ===", flush=True)
    core = collect_core_paths()
    print(f"  {len(core)} paths to fetch", flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futures = {ex.submit(download_with_retry, p): p for p in core}
        done = 0
        for fut in concurrent.futures.as_completed(futures):
            done += 1
            if done % 50 == 0:
                print(f"  progress: {done}/{len(core)}  stats={base.stats}", flush=True)

    # 4) Patch index.html + update manifest
    base.patch_index_html()
    present: list[str] = []
    for p in OUT.rglob("*"):
        if p.is_file() and p.name != "assets-manifest.json":
            present.append(str(p.relative_to(OUT)).replace("\\", "/"))
    base.update_manifest(present)

    # Summary
    print("\n=== DONE ===", flush=True)
    print(f"stats: {base.stats}", flush=True)
    print(f"total failures: {len(base.failed)}", flush=True)
    # Bucket failures
    from collections import Counter
    buckets: Counter[str] = Counter()
    for f in base.failed:
        if "HTTP 404" in f:
            buckets["404"] += 1
        elif "SSL" in f or "UNEXPECTED_EOF" in f:
            buckets["ssl_eof"] += 1
        elif "HTTP 403" in f:
            buckets["403"] += 1
        elif "timeout" in f:
            buckets["timeout"] += 1
        else:
            buckets["other"] += 1
    print(f"failure breakdown: {dict(buckets)}", flush=True)
    # Show a few non-404 failures
    other = [f for f in base.failed if "HTTP 404" not in f][:10]
    if other:
        print("non-404 failures (sample):", flush=True)
        for f in other:
            print(f"  {f}", flush=True)
    print(f"\nopen: http://127.0.0.1:8089/games/guns-guns-guns/index.html", flush=True)


if __name__ == "__main__":
    main()
