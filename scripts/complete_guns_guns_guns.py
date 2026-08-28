#!/usr/bin/env python3
"""Complete incomplete Cocos Creator download for guns-guns-guns from Poki CDN."""

from __future__ import annotations

import concurrent.futures
import json
import re
import shutil
import threading
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "games" / "guns-guns-guns"
BASE = (
    "https://8440add7-d2ba-4096-a958-6c6bfe720434.gdn.poki.com/"
    "446b41d6-0865-4045-864c-f9e9a6712ab8"
)
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36"
)
REF = "https://poki.com/"

BUNDLES = [
    "internal",
    "main",
    "sounds",
    "weapon-specials",
    "kaijus",
    "mansion-bundle",
    "socle-bundle",
    "true-back",
    "world-three-bundle",
    "world-two-bundle",
]

BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="
QE = [-1] * 128
for _i, _c in enumerate(BASE64):
    QE[ord(_c)] = _i
NM = list("0123456789abcdef")
_RM = ["", "", "", ""]
TMPL = _RM + _RM + ["-"] + _RM + ["-"] + _RM + ["-"] + _RM + ["-"] + _RM + _RM + _RM
OM = [i for i, x in enumerate(TMPL) if x != "-"]

lock = threading.Lock()
stats = {"ok": 0, "skip": 0, "fail": 0, "bytes": 0}
failed: list[str] = []


def decode_uuid(t: str) -> str:
    e = t.split("@", 1)[0]
    if len(e) != 22:
        return t
    sm = list(TMPL)
    sm[0] = t[0]
    sm[1] = t[1]
    i = 2
    n = 2
    while i < 22:
        r = QE[ord(t[i])]
        s = QE[ord(t[i + 1])]
        sm[OM[n]] = NM[r >> 2]
        n += 1
        sm[OM[n]] = NM[((3 & r) << 2) | (s >> 4)]
        n += 1
        sm[OM[n]] = NM[15 & s]
        n += 1
        i += 2
    return t.replace(e, "".join(sm), 1)


def is_cf_block(data: bytes) -> bool:
    head = data[:240].lower()
    return b"attention required" in head or b"just a moment" in head or b"cloudflare" in head[:80]


def download(rel: str, overwrite: bool = False) -> bool:
    dest = OUT / rel
    if dest.exists() and dest.stat().st_size > 0 and not overwrite:
        with lock:
            stats["skip"] += 1
        return True
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(
        f"{BASE}/{rel}",
        headers={"User-Agent": UA, "Referer": REF, "Accept": "*/*"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read()
            code = resp.status
    except urllib.error.HTTPError as e:
        with lock:
            stats["fail"] += 1
            failed.append(f"{rel} HTTP {e.code}")
        return False
    except Exception as e:  # noqa: BLE001
        with lock:
            stats["fail"] += 1
            failed.append(f"{rel} {e}")
        return False
    if code != 200 or not data or is_cf_block(data):
        with lock:
            stats["fail"] += 1
        failed.append(f"{rel} bad response")
        return False
    # Bug 4 fix: wrap write_bytes in try so disk errors don't abort the whole batch
    try:
        dest.write_bytes(data)
    except OSError as e:  # noqa: BLE001
        with lock:
            stats["fail"] += 1
        failed.append(f"{rel} write error: {e}")
        return False
    with lock:
        stats["ok"] += 1
        stats["bytes"] += len(data)
    return True


def try_download_first(rels: list[str]) -> str | None:
    for rel in rels:
        if download(rel):
            return rel
    return None


def packed_indices(cfg: dict) -> set[int]:
    out: set[int] = set()
    for idxs in (cfg.get("packs") or {}).values():
        out.update(int(i) for i in idxs)
    return out


def extension_map_index(cfg: dict) -> dict[int, str]:
    mapping: dict[int, str] = {}
    for ext, idxs in (cfg.get("extensionMap") or {}).items():
        for i in idxs:
            mapping[int(i)] = ext
    return mapping


def collect_bundle_paths(bundle: str, cfg: dict) -> list[str]:
    paths: list[str] = []
    import_base = cfg.get("importBase") or "import"
    native_base = cfg.get("nativeBase") or "native"
    uuids = cfg.get("uuids") or []
    packs = cfg.get("packs") or {}
    packed = packed_indices(cfg)
    ext_map = extension_map_index(cfg)
    versions = cfg.get("versions") or {}
    ver_import = versions.get("import") or []
    ver_native = versions.get("native") or []

    # version arrays are [index, hash, index, hash, ...]
    import_ver = {int(ver_import[i]): str(ver_import[i + 1]) for i in range(0, len(ver_import), 2)}
    native_ver = {int(ver_native[i]): str(ver_native[i + 1]) for i in range(0, len(ver_native), 2)}

    for pack_id in packs:
        ver = f".{import_ver[uuids.index(pack_id)]}" if pack_id in uuids and uuids.index(pack_id) in import_ver else ""
        # pack id itself may appear in uuids; version keyed by uuid index
        idx = None
        try:
            idx = uuids.index(pack_id)
        except ValueError:
            idx = None
        if idx is not None and idx in import_ver:
            ver = f".{import_ver[idx]}"
        else:
            ver = ""
        paths.append(f"assets/{bundle}/{import_base}/{pack_id[:2]}/{pack_id}{ver}.json")

    for i, uuid in enumerate(uuids):
        # skip pack ids (short non-22-char roots without @)
        root = uuid.split("@", 1)[0]
        if len(root) != 22 and i in packed:
            continue
        decoded = decode_uuid(uuid)
        folder = decoded[:2]
        ver = f".{import_ver[i]}" if i in import_ver else ""

        if i in ext_map:
            ext = ext_map[i]
            # CDN for this game uses .bin for .cconb content
            candidates = []
            if ext == ".cconb":
                candidates = [
                    f"assets/{bundle}/{import_base}/{folder}/{decoded}{ver}.bin",
                    f"assets/{bundle}/{import_base}/{folder}/{decoded}{ver}.cconb",
                ]
            else:
                candidates = [f"assets/{bundle}/{import_base}/{folder}/{decoded}{ver}{ext}"]
            # store as special marker handled later
            for c in candidates:
                paths.append(c)
            continue

        if i in packed:
            # included in pack json; still may need native later
            pass
        else:
            paths.append(f"assets/{bundle}/{import_base}/{folder}/{decoded}{ver}.json")

        # native version entries imply native files exist; extension unknown -> probe later
        if i in native_ver:
            nver = f".{native_ver[i]}"
            # common native extensions
            for ext in (".png", ".jpg", ".jpeg", ".webp", ".mp3", ".ogg", ".bin", ".cconb", ".pac", ".pvr", ".pkm", ".astc"):
                paths.append(f"assets/{bundle}/{native_base}/{folder}/{decoded}{nver}{ext}")

    return paths


NATIVE_URL_RE = re.compile(
    r"(?:native|import)/[0-9a-fA-F]{2}/[0-9a-fA-F@.\-]+(?:\.[A-Za-z0-9]+)+"
)
UUID_FILE_RE = re.compile(
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?:@[0-9a-fA-F]+)?"
)


def scrape_native_from_files(bundle: str) -> list[str]:
    """After packs/import downloaded, scrape referenced native/import paths."""
    found: set[str] = set()
    base = OUT / "assets" / bundle
    if not base.exists():
        return []
    for path in base.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() not in {".json", ".js", ".bin", ".cconb", ".txt"}:
            continue
        try:
            text = path.read_text(errors="ignore")
        except Exception:
            continue
        for m in NATIVE_URL_RE.findall(text):
            found.add(f"assets/{bundle}/{m}")
        # _native fields often just filename/ext like ".png" with uuid elsewhere; skip
    return sorted(found)


def patch_index_html() -> None:
    html_path = OUT / "index.html"
    html = html_path.read_text(encoding="utf-8")
    # Bug 5 fix: don't depend on a single fragile ROOT path. Try multiple stub
    # locations so the script still works if ROOT/poki-sdk-stub.js is missing
    # (e.g. fresh clone, different machine, etc.).
    script_dir = Path(__file__).resolve().parent
    stub_candidates = [
        script_dir / "poki-sdk-stub.js",  # alongside this script (most stable)
        ROOT / "poki-sdk-stub.js",        # legacy location
        OUT / "poki-sdk-stub.js",         # already in game dir from prior runs
    ]
    stub_src = next(
        (p for p in stub_candidates if p.exists() and p.stat().st_size > 0), None
    )
    if stub_src:
        shutil.copy2(stub_src, OUT / "poki-sdk-stub.js")
    else:
        # No stub found anywhere — index.html will 404 on ./poki-sdk-stub.js.
        # Print a clear warning instead of silently producing a broken game.
        print(f"WARN: poki-sdk-stub.js not found in any of: {[str(p) for p in stub_candidates]}")
    html = html.replace(
        '<script src="//game-cdn.poki.com/scripts/v2/poki-sdk.js"></script>',
        '<script src="./poki-sdk-stub.js"></script>',
    )
    html = html.replace(
        '<script src="https://game-cdn.poki.com/scripts/v2/poki-sdk.js"></script>',
        '<script src="./poki-sdk-stub.js"></script>',
    )
    html_path.write_text(html, encoding="utf-8")


def update_manifest(extra_files: list[str]) -> None:
    manifest_path = OUT / "assets-manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    else:
        manifest = {
            "manifestVersion": 1,
            "gameName": "guns-guns-guns",
            "files": [],
        }
    existing = {f.get("localPath") for f in manifest.get("files") or []}
    for rel in extra_files:
        if rel in existing:
            # Bug 2 fix: preserve original entry (don't overwrite requestType).
            # The original manifest entries from the download-poki-game /
            # fix_game_resources extensions carry useful metadata
            # (requestType = "complete-script" / "404-fix" / "XHR" / "Image" / etc.)
            # that we want to keep for traceability.
            continue
        manifest.setdefault("files", []).append(
            {
                "type": "asset",
                "sourceUrl": f"{BASE}/{rel}",
                "localPath": rel,
                "status": "ok",
                "requestType": "complete-script",
                # Bug 2 fix: tag entries added by this script so we can tell
                # them apart from extension-captured ones.
                "completedBy": "complete_guns_guns_guns.py",
            }
        )
        existing.add(rel)
    manifest["engine"] = "cocos"
    manifest["status"] = "completed"
    manifest["gameUrl"] = f"{BASE}/index.html"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    entry = [
        "index.html",
        "index.js",
        "application.js",
        "sitelock.js",
        "style.css",
        "src/polyfills.bundle.js",
        "src/system.bundle.js",
        "src/import-map.json",
        "src/settings.json",
        "src/chunks/bundle.js",
        "src/effect.bin",
        "cocos-js/cc.js",
    ]
    print("Downloading entry files...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
        list(ex.map(download, entry))

    print("Downloading bundle configs/index.js...")
    bundle_meta = []
    for b in BUNDLES:
        bundle_meta.extend([f"assets/{b}/config.json", f"assets/{b}/index.js"])
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
        list(ex.map(download, bundle_meta))

    # Collect asset paths from configs
    candidates: list[str] = []
    for b in BUNDLES:
        cfg_path = OUT / "assets" / b / "config.json"
        if not cfg_path.exists():
            print(f"WARN missing config for {b}")
            continue
        cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
        candidates.extend(collect_bundle_paths(b, cfg))

    # Dedup while preserving order
    seen: set[str] = set()
    uniq: list[str] = []
    for c in candidates:
        if c not in seen:
            seen.add(c)
            uniq.append(c)

    print(f"Downloading {len(uniq)} candidate asset paths...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as ex:
        list(ex.map(download, uniq))

    # Probe natives for uuids that likely have natives: scan sounds-like by trying
    # based on already-known extensions from partial download + config paths.
    print("Scraping downloaded configs/packs for more paths...")
    more: list[str] = []
    for b in BUNDLES:
        more.extend(scrape_native_from_files(b))

    # Also: for each uuid not only in packs, probe native with common exts if import exists
    # Build smarter native list from config: AudioClip / ImageAsset paths etc.
    for b in BUNDLES:
        cfg_path = OUT / "assets" / b / "config.json"
        if not cfg_path.exists():
            continue
        cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
        uuids = cfg.get("uuids") or []
        types = cfg.get("types") or []
        paths_map = cfg.get("paths") or {}
        # paths: index -> [dbPath, typeIndex, ...]
        type_native_guess = {
            "cc.AudioClip": [".mp3", ".ogg", ".m4a", ".wav"],
            "cc.ImageAsset": [".png", ".jpg", ".jpeg", ".webp", ".bmp"],
            "cc.Texture2D": [".png", ".jpg", ".jpeg", ".webp"],
            "cc.BitmapFont": [".fnt", ".png"],
            "cc.ParticleAsset": [".plist"],
            "cc.TextAsset": [".txt"],
            "cc.JsonAsset": [".json"],
            "cc.Asset": [".bin", ".json", ".png", ".mp3"],
        }
        for idx_str, info in paths_map.items():
            try:
                idx = int(idx_str)
            except ValueError:
                continue
            if not isinstance(info, list) or len(info) < 2:
                continue
            type_idx = info[1]
            if not isinstance(type_idx, int) or type_idx >= len(types):
                continue
            tname = types[type_idx]
            exts = type_native_guess.get(tname)
            if not exts:
                continue
            decoded = decode_uuid(uuids[idx])
            folder = decoded[:2]
            for ext in exts:
                more.append(f"assets/{b}/native/{folder}/{decoded}{ext}")

    # Dedup more
    more_uniq = []
    more_seen = set(seen)
    for m in more:
        if m not in more_seen:
            more_seen.add(m)
            more_uniq.append(m)
    print(f"Downloading {len(more_uniq)} scraped/probed paths...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as ex:
        list(ex.map(download, more_uniq))

    # For extensionMap .cconb that failed as both, already recorded in failed
    # Download pack-referenced individuals that are .cconb outside packs (already handled)

    # Aggressive: for every decoded uuid in every bundle, if no local import/native yet,
    # try native common extensions (bounded).
    print("Filling likely missing native files...")
    fill: list[str] = []
    for b in BUNDLES:
        cfg_path = OUT / "assets" / b / "config.json"
        if not cfg_path.exists():
            continue
        cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
        for uuid in cfg.get("uuids") or []:
            root = uuid.split("@", 1)[0]
            if len(root) != 22:
                continue
            decoded = decode_uuid(uuid)
            folder = decoded[:2]
            # if any native already present for this uuid, skip probing
            native_dir = OUT / "assets" / b / "native" / folder
            if native_dir.exists() and any(native_dir.glob(f"{decoded}*")):
                continue
            # only probe @-less primary assets and known texture suffixes lightly
            if "@" in decoded and not decoded.endswith(("@6c48a", "@f9941", "@a56c8")):
                # still try a few common
                pass
            for ext in (".png", ".jpg", ".mp3", ".ogg", ".webp"):
                fill.append(f"assets/{b}/native/{folder}/{decoded}{ext}")

    # Limit fill size: prefer primary uuids without @ first
    fill_primary = [p for p in fill if "@" not in Path(p).name]
    fill_rest = [p for p in fill if "@" in Path(p).name]
    fill_list = fill_primary + fill_rest
    # Avoid insane request volume: cap
    fill_list = [p for p in fill_list if p not in more_seen][:5000]
    print(f"Probing up to {len(fill_list)} native candidates...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as ex:
        list(ex.map(download, fill_list))

    patch_index_html()

    # Collect successfully present files for manifest update
    present = []
    for p in OUT.rglob("*"):
        if p.is_file() and p.name != "assets-manifest.json":
            present.append(str(p.relative_to(OUT)).replace("\\", "/"))
    update_manifest(present)

    print("\n=== DONE ===")
    print(stats)
    print(f"failed: {len(failed)}")
    # show non-404 interesting failures
    interesting = [f for f in failed if "HTTP 404" not in f][:30]
    if interesting:
        print("interesting failures:")
        for f in interesting:
            print(" ", f)
    print(f"index.html exists: {(OUT / 'index.html').exists()}")
    print(f"poki-sdk-stub.js exists: {(OUT / 'poki-sdk-stub.js').exists()}")
    print(f"open: http://127.0.0.1:8089/games/guns-guns-guns/index.html")


if __name__ == "__main__":
    main()
