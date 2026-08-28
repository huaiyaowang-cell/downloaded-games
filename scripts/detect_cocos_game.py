#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
detect_cocos_game.py — Detect Cocos Creator games on Poki CDN or in a local directory.

Usage
-----
  # Local directory (downloaded game)
  python3 detect_cocos_game.py /path/to/game-dir

  # Poki CDN URL (game entry URL or just the https://<host>.gdn.poki.com/<version>/ prefix)
  python3 detect_cocos_game.py https://<host-uuid>.gdn.poki.com/<version-uuid>/

  # Poki game slug (resolved via poki.com -> games.poki.com -> CDN URL)
  python3 detect_cocos_game.py --slug merge-arena

  # Verbose JSON report
  python3 detect_cocos_game.py --json /path/to/game-dir

  # Quiet (only console summary)
  python3 detect_cocos_game.py --quiet /path/to/game-dir

What it detects
---------------
  - Whether the target is a Cocos Creator game (3.x or 2.x)
  - Engine version (e.g. 3.8.8)
  - Platform (web-mobile / web-desktop)
  - Design resolution
  - Physics engine (cannon / ammo / builtin / physx)
  - Bundle list (projectBundles)
  - Launch scene
  - Per-bundle uuids/types/packs/deps (when local)
  - Short-UUID decoding rules (verifies `decodeUuid` is present in `cocos-js/cc.js`)

Output
------
  - Console summary (always)
  - JSON report to stdout with --json, or to a file with --out
"""
from __future__ import annotations

import argparse
import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
REFERER = "https://poki.com/"
_SSL = ssl.create_default_context()

# -----------------------------------------------------------------------------
# HTTP helpers
# -----------------------------------------------------------------------------

def _fetch(url: str, timeout: int = 30) -> Tuple[int, bytes]:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": REFERER})
    try:
        with urllib.request.urlopen(req, context=_SSL, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, b""
    except Exception:
        return -1, b""


def _fetch_text(url: str, timeout: int = 30) -> Tuple[int, str]:
    status, data = _fetch(url, timeout=timeout)
    return status, data.decode("utf-8", errors="replace") if data else ""


# -----------------------------------------------------------------------------
# Poki slug → CDN URL resolver
# -----------------------------------------------------------------------------

# Regex for the actual game CDN URL inside the games.poki.com iframe wrapper.
_GAME_URI_RE = re.compile(
    r'"gameUri"\s*:\s*"([^"]+)"', re.MULTILINE
)
# Regex for the games.poki.com iframe wrapper URL inside the Poki page HTML.
_POKI_GAME_ID_RE = re.compile(
    r'"pokifordevs_game_id"\s*:\s*"([a-f0-9-]{36})"'
)
_POKI_CONTENT_ID_RE = re.compile(
    r'"id"\s*:\s*(\d+)\s*,\s*"developer"'
)


def resolve_poki_slug(slug: str) -> Optional[str]:
    """Resolve a Poki slug like ``merge-arena`` to the gdn.poki.com game URL.

    Returns ``https://<host>.gdn.poki.com/<version>/`` (no trailing index.html)
    or ``None`` if resolution failed.
    """
    status, html = _fetch_text(f"https://poki.com/en/g/{slug}")
    if status != 200 or not html:
        return None
    gid_m = _POKI_GAME_ID_RE.search(html)
    cid_m = _POKI_CONTENT_ID_RE.search(html)
    if not gid_m or not cid_m:
        return None
    game_id = gid_m.group(1)
    content_id = cid_m.group(1)
    # Fetch the games.poki.com iframe wrapper to get the actual gameUri.
    status, wrapper = _fetch_text(
        f"https://games.poki.com/{content_id}/{game_id}/"
    )
    if status != 200 or not wrapper:
        return None
    uri_m = _GAME_URI_RE.search(wrapper)
    if not uri_m:
        return None
    # gameUri is JSON-encoded: \u002F -> /
    game_uri = uri_m.group(1).replace("\\u002F", "/")
    # Strip query string and trailing index.html
    game_uri = game_uri.split("?", 1)[0]
    if game_uri.endswith("/index.html"):
        game_uri = game_uri[: -len("/index.html")]
    if not game_uri.endswith("/"):
        game_uri += "/"
    return game_uri


# -----------------------------------------------------------------------------
# Pattern detection
# -----------------------------------------------------------------------------

# Title pattern: "Cocos Creator | <GameName>"
_COCCOS_TITLE_RE = re.compile(
    r"<title>\s*Cocos Creator\s*\|\s*[^<]+</title>", re.IGNORECASE
)
# Title pattern for unrendered templates: "Cocos Creator | <%=project%>"
_COCCOS_TEMPLATE_TITLE_RE = re.compile(
    r"<title>\s*Cocos Creator\s*\|\s*<%=\s*\w+\s*%>\s*</title>", re.IGNORECASE
)
# System.import call (Cocos 3.x)
_SYSTEM_IMPORT_RE = re.compile(r"System\.import\(['\"]\.\/[^'\"]+['\"]\)")
# cc.game.run / cc.game.init (Cocos 2.x and 3.x)
_CC_GAME_RE = re.compile(r"cc\.game\.(run|init)\b")
# window._CCSettings (Cocos 2.x signature)
_CC_SETTINGS_2X_RE = re.compile(r"window\._CCSettings\s*=\s*\{")
# Script src with hashed or unhashed names (Cocos 3.x). The ``\.js`` suffix is
# optional because some custom build templates inline the loader and reference
# the bundles without an extension (e.g. ``_get_path("src/polyfills.bundle")``).
_POLYFILLS_RE = re.compile(r"src/[\"']?polyfills\.bundle(?:\.[a-f0-9]{4,8})?(?:\.js)?\b")
_SYSTEM_BUNDLE_RE = re.compile(r"src/[\"']?system\.bundle(?:\.[a-f0-9]{4,8})?(?:\.js)?\b")
_IMPORT_MAP_RE = re.compile(r"src/[\"']?import-map(?:\.[a-f0-9]{4,8})?\.json\b")
# cocos-js/cc.js reference (Cocos 3.x). Allows hashed variants and any suffix.
_CC_JS_REF_RE = re.compile(r"cocos-js/cc(?:\.[a-f0-9]{4,8})?\.js\b")
# import-map content pointing to cc module
_IMPORT_MAP_CC_RE = re.compile(r'"imports"\s*:\s*\{[^}]*"cc"\s*:\s*"[^"]+"')
# System.import call (Cocos 3.x) — be permissive about the argument form.
_SYSTEM_IMPORT_RE = re.compile(r"System\.import\s*\(")
# settings.json with CocosEngine field
_COCOS_ENGINE_FIELD_RE = re.compile(r'"CocosEngine"\s*:\s*"([^"]+)"')
# Scirra Construct generator marker (negative signal)
_SCIRRA_RE = re.compile(
    r'<meta\s+name="generator"\s+content="Scirra Construct"', re.IGNORECASE
)
# decodeUuid function in cc.js (Cocos 3.x engine). The function is usually
# minified to a short name like ``am``, so we look for the characteristic
# ``.split("@")`` + 22-char-length check pattern.
_DECODE_UUID_RE = re.compile(
    r'function\s+\w+\s*\([^)]*\)\s*\{[^}]*\.split\(\s*[\'"]@[\'"]\s*\)[^}]*\}'
)


def _all_scripts_html(html: str) -> List[str]:
    """Return list of ``src`` attributes from ``<script src="...">`` tags."""
    return re.findall(r'<script[^>]*\bsrc="([^"]+)"', html)


def _looks_like_cocos_html(html: str) -> Tuple[bool, Dict[str, Any]]:
    """Inspect ``index.html`` content and return (is_cocos, evidence_dict)."""
    evidence: Dict[str, Any] = {
        "title_cocos": bool(_COCCOS_TITLE_RE.search(html) or _COCCOS_TEMPLATE_TITLE_RE.search(html)),
        "system_import": bool(_SYSTEM_IMPORT_RE.search(html)),
        "cc_game": bool(_CC_GAME_RE.search(html)),
        "polyfills_bundle": bool(_POLYFILLS_RE.search(html)),
        "system_bundle": bool(_SYSTEM_BUNDLE_RE.search(html)),
        "import_map": bool(_IMPORT_MAP_RE.search(html)),
        "cc_js_ref": bool(_CC_JS_REF_RE.search(html) or "cocos-js/cc" in html),
        "scirra_marker": bool(_SCIRRA_RE.search(html)),
        "_cc_settings_2x": bool(_CC_SETTINGS_2X_RE.search(html)),
    }
    # Negative signal: Scirra Construct
    if evidence["scirra_marker"]:
        return False, evidence
    # Strong positive: title pattern
    if evidence["title_cocos"]:
        return True, evidence
    # Strong positive: polyfills + system + import-map (Cocos 3.x)
    if (
        evidence["polyfills_bundle"]
        and evidence["system_bundle"]
        and evidence["import_map"]
    ):
        return True, evidence
    # Strong positive: _CCSettings (Cocos 2.x)
    if evidence["_cc_settings_2x"]:
        return True, evidence
    # Strong positive: cc.game.run / cc.game.init with system.import
    if evidence["cc_game"] and evidence["system_import"]:
        return True, evidence
    # Moderate: cc.game.run alone (Cocos 2.x main.js)
    if evidence["cc_game"]:
        return True, evidence
    return False, evidence


# -----------------------------------------------------------------------------
# Local directory scanner
# -----------------------------------------------------------------------------

def _scan_local_directory(root: str) -> Dict[str, Any]:
    """Scan a local game directory for Cocos Creator markers."""
    report: Dict[str, Any] = {
        "input_type": "directory",
        "input": root,
        "is_cocos": False,
        "engine_major": None,  # "2.x" or "3.x"
        "engine_version": None,
        "platform": None,
        "design_resolution": None,
        "physics": None,
        "bundles": [],
        "launch_scene": None,
        "evidence": {},
        "files": {},
        "errors": [],
    }

    if not os.path.isdir(root):
        report["errors"].append(f"not a directory: {root}")
        return report

    # ---- index.html ----
    idx_path = os.path.join(root, "index.html")
    idx_html = ""
    if os.path.isfile(idx_path):
        with open(idx_path, "r", encoding="utf-8", errors="replace") as f:
            idx_html = f.read()
        report["files"]["index.html"] = {
            "size": os.path.getsize(idx_path),
            "scripts": _all_scripts_html(idx_html),
        }
        is_cocos, ev = _looks_like_cocos_html(idx_html)
        report["evidence"].update(ev)
        report["is_cocos"] = is_cocos or report["is_cocos"]

    # ---- src/settings.json (Cocos 3.x) ----
    settings_path = os.path.join(root, "src", "settings.json")
    settings_data: Optional[Dict[str, Any]] = None
    if os.path.isfile(settings_path):
        try:
            with open(settings_path, "r", encoding="utf-8") as f:
                settings_data = json.load(f)
            report["files"]["src/settings.json"] = {"size": os.path.getsize(settings_path)}
            report["engine_version"] = settings_data.get("CocosEngine")
            report["engine_major"] = "3.x"
            report["platform"] = settings_data.get("engine", {}).get("platform")
            report["design_resolution"] = settings_data.get("screen", {}).get("designResolution")
            report["launch_scene"] = settings_data.get("launch", {}).get("launchScene")
            physics = settings_data.get("physics")
            if isinstance(physics, dict):
                report["physics"] = physics.get("physicsEngine")
            elif isinstance(physics, str):
                report["physics"] = physics
            report["bundles"] = settings_data.get("assets", {}).get("projectBundles", []) or []
            report["evidence"]["settings_json"] = True
            report["evidence"]["CocosEngine_field"] = bool(report["engine_version"])
            report["is_cocos"] = True
        except Exception as e:
            report["errors"].append(f"settings.json parse error: {e}")
    else:
        # ---- src/settings.<hash>.js (Cocos 2.x) ----
        src_dir = os.path.join(root, "src")
        if os.path.isdir(src_dir):
            for name in os.listdir(src_dir):
                m = re.match(r"settings(?:\.([a-f0-9]{4,8}))?\.js$", name)
                if m:
                    s_path = os.path.join(src_dir, name)
                    try:
                        with open(s_path, "r", encoding="utf-8", errors="replace") as f:
                            s_content = f.read()
                        if _CC_SETTINGS_2X_RE.search(s_content):
                            report["files"][f"src/{name}"] = {"size": os.path.getsize(s_path)}
                            report["engine_major"] = "2.x"
                            report["evidence"]["settings_2x"] = True
                            report["is_cocos"] = True
                            # Try to extract platform
                            m_platform = re.search(r'platform\s*:\s*"([^"]+)"', s_content)
                            if m_platform:
                                report["platform"] = m_platform.group(1)
                    except Exception as e:
                        report["errors"].append(f"settings.js read error: {e}")
                    break

    # ---- cocos-js/cc.js (Cocos 3.x) ----
    cc_dir = os.path.join(root, "cocos-js")
    ccjs_path: Optional[str] = None
    if os.path.isdir(cc_dir):
        for name in os.listdir(cc_dir):
            if re.match(r"cc(?:\.[a-f0-9]{4,8})?\.js$", name):
                ccjs_path = os.path.join(cc_dir, name)
                break
    if ccjs_path and os.path.isfile(ccjs_path):
        cc_size = os.path.getsize(ccjs_path)
        report["files"]["cocos-js/cc.js"] = {"size": cc_size, "name": os.path.basename(ccjs_path)}
        # Only read if not huge (skip 5MB+)
        if cc_size < 8_000_000:
            with open(ccjs_path, "r", encoding="utf-8", errors="replace") as f:
                cc_content = f.read()
            has_decode = "decodeUuid" in cc_content or bool(_DECODE_UUID_RE.search(cc_content))
            report["evidence"]["ccjs_decodeUuid"] = has_decode
            report["evidence"]["ccjs_present"] = True
            report["is_cocos"] = True
            if report["engine_major"] is None:
                report["engine_major"] = "3.x"

    # ---- src/cc.js (Cocos 2.x) ----
    if ccjs_path is None:
        cc2_path = os.path.join(root, "src", "cc.js")
        if os.path.isfile(cc2_path):
            report["files"]["src/cc.js"] = {"size": os.path.getsize(cc2_path)}
            report["evidence"]["ccjs_present"] = True
            report["is_cocos"] = True
            if report["engine_major"] is None:
                report["engine_major"] = "2.x"

    # ---- src/chunks/bundle.js (Cocos 3.x) ----
    chunks_path = os.path.join(root, "src", "chunks", "bundle.js")
    if os.path.isfile(chunks_path):
        report["files"]["src/chunks/bundle.js"] = {"size": os.path.getsize(chunks_path)}
        report["evidence"]["chunks_bundle"] = True

    # ---- assets/ bundle structure (Cocos 3.x) ----
    assets_dir = os.path.join(root, "assets")
    if os.path.isdir(assets_dir):
        bundle_reports = []
        for entry in sorted(os.listdir(assets_dir)):
            bdir = os.path.join(assets_dir, entry)
            if not os.path.isdir(bdir):
                continue
            cfg_path = os.path.join(bdir, "config.json")
            idx_b_path = os.path.join(bdir, "index.js")
            imp_dir = os.path.join(bdir, "import")
            nat_dir = os.path.join(bdir, "native")
            if os.path.isfile(cfg_path):
                try:
                    with open(cfg_path, "r", encoding="utf-8") as f:
                        cfg = json.load(f)
                    bundle_reports.append({
                        "name": cfg.get("name", entry),
                        "deps": cfg.get("deps", []),
                        "uuids_count": len(cfg.get("uuids", [])),
                        "types_count": len(cfg.get("types", [])),
                        "paths_count": len(cfg.get("paths", [])),
                        "packs_count": len(cfg.get("packs", [])),
                        "scenes_count": len(cfg.get("scenes", [])),
                        "has_import": os.path.isdir(imp_dir),
                        "has_native": os.path.isdir(nat_dir),
                        "has_index_js": os.path.isfile(idx_b_path),
                    })
                except Exception as e:
                    report["errors"].append(f"bundle {entry} config.json parse: {e}")
        if bundle_reports:
            report["evidence"]["bundle_structure"] = True
            report["bundles_detail"] = bundle_reports
            if not report["bundles"]:
                report["bundles"] = [b["name"] for b in bundle_reports]
            if report["engine_major"] is None:
                report["engine_major"] = "3.x"
            report["is_cocos"] = True

    # ---- main.js (Cocos 2.x bootstrap) ----
    main_path = os.path.join(root, "main.js")
    if os.path.isfile(main_path):
        try:
            with open(main_path, "r", encoding="utf-8", errors="replace") as f:
                main_content = f.read()
            if _CC_GAME_RE.search(main_content):
                report["files"]["main.js"] = {"size": os.path.getsize(main_path)}
                report["evidence"]["main_js_cc_game"] = True
                report["is_cocos"] = True
                if report["engine_major"] is None:
                    report["engine_major"] = "2.x"
        except Exception as e:
            report["errors"].append(f"main.js read: {e}")

    # ---- Final sanity: if nothing positive, mark not cocos ----
    if not report["evidence"].get("title_cocos") and not any(
        report["evidence"].get(k)
        for k in (
            "settings_json", "settings_2x", "ccjs_present",
            "bundle_structure", "main_js_cc_game",
            "polyfills_bundle", "system_bundle", "import_map",
        )
    ):
        report["is_cocos"] = False

    return report


# -----------------------------------------------------------------------------
# URL scanner
# -----------------------------------------------------------------------------

def _normalize_url(url: str) -> str:
    """Normalize user-provided URL to a base URL ending with ``/``."""
    url = url.rstrip("?#")
    # strip trailing /index.html
    if url.endswith("/index.html"):
        url = url[: -len("/index.html")]
    if not url.endswith("/"):
        url += "/"
    return url


def _scan_url(base_url: str) -> Dict[str, Any]:
    """Scan a remote game URL for Cocos Creator markers."""
    base_url = _normalize_url(base_url)
    report: Dict[str, Any] = {
        "input_type": "url",
        "input": base_url,
        "is_cocos": False,
        "engine_major": None,
        "engine_version": None,
        "platform": None,
        "design_resolution": None,
        "physics": None,
        "bundles": [],
        "launch_scene": None,
        "evidence": {},
        "files": {},
        "errors": [],
    }

    # ---- index.html ----
    status, idx_html = _fetch_text(f"{base_url}index.html")
    if status != 200 or not idx_html:
        report["errors"].append(f"index.html fetch failed: HTTP {status}")
        return report
    report["files"]["index.html"] = {"size": len(idx_html), "status": status}

    is_cocos, ev = _looks_like_cocos_html(idx_html)
    report["evidence"].update(ev)
    report["is_cocos"] = is_cocos

    # Extract script srcs so we can find hashed filenames.
    script_srcs = _all_scripts_html(idx_html)
    report["files"]["index.html"]["scripts"] = script_srcs

    # ---- Try standard (unhashed) paths first ----
    candidates: List[Tuple[str, str]] = [
        ("src/settings.json", "settings_json"),
        ("cocos-js/cc.js", "ccjs_present"),
        ("src/chunks/bundle.js", "chunks_bundle"),
        ("src/import-map.json", "import_map_content"),
        ("src/polyfills.bundle.js", "polyfills_content"),
        ("src/system.bundle.js", "system_content"),
        ("main.js", "main_js"),
        ("src/cc.js", "ccjs_2x_present"),
    ]

    # Then scan script srcs from index.html for hashed variants.
    for src in script_srcs:
        # Skip poki-sdk external
        if "poki-sdk" in src or src.startswith("http://") or src.startswith("https://"):
            continue
        # Strip leading ./ ./
        rel = src.lstrip("./")
        # Identify by stem
        if re.match(r"src/polyfills\.bundle(?:\.[a-f0-9]+)?\.js$", rel):
            candidates.append((rel, "polyfills_content"))
        elif re.match(r"src/system\.bundle(?:\.[a-f0-9]+)?\.js$", rel):
            candidates.append((rel, "system_content"))
        elif re.match(r"src/import-map(?:\.[a-f0-9]+)?\.json$", rel):
            candidates.append((rel, "import_map_content"))
        elif re.match(r"src/settings(?:\.[a-f0-9]+)?\.js$", rel):
            candidates.append((rel, "settings_2x"))
        elif re.match(r"src/settings(?:\.[a-f0-9]+)?\.json$", rel):
            candidates.append((rel, "settings_json"))
        elif re.match(r"cocos-js/cc(?:\.[a-f0-9]+)?\.js$", rel):
            candidates.append((rel, "ccjs_present"))
        elif re.match(r"main(?:\.[a-f0-9]+)?\.js$", rel):
            candidates.append((rel, "main_js"))
        elif re.match(r"index(?:\.[a-f0-9]+)?\.js$", rel):
            candidates.append((rel, "entry_index_js"))

    # Also try to follow import-map content for cocos-js/cc.<hash>.js
    # (do this after initial fetch)

    seen_paths: set = set()
    import_map_cc_ref: Optional[str] = None

    for rel, evidence_key in candidates:
        if rel in seen_paths:
            continue
        seen_paths.add(rel)
        url = f"{base_url}{rel}"
        status, content = _fetch_text(url)
        if status != 200 or not content:
            continue
        report["files"][rel] = {"size": len(content), "status": status}

        # settings.json (Cocos 3.x)
        if evidence_key == "settings_json":
            try:
                s = json.loads(content)
                report["engine_version"] = s.get("CocosEngine")
                report["engine_major"] = "3.x"
                report["platform"] = s.get("engine", {}).get("platform")
                report["design_resolution"] = s.get("screen", {}).get("designResolution")
                report["launch_scene"] = s.get("launch", {}).get("launchScene")
                physics = s.get("physics")
                if isinstance(physics, dict):
                    report["physics"] = physics.get("physicsEngine")
                elif isinstance(physics, str):
                    report["physics"] = physics
                report["bundles"] = s.get("assets", {}).get("projectBundles", []) or []
                report["evidence"]["settings_json"] = True
                report["evidence"]["CocosEngine_field"] = bool(report["engine_version"])
                report["is_cocos"] = True
            except Exception as e:
                report["errors"].append(f"settings.json parse: {e}")

        # settings.<hash>.js (Cocos 2.x)
        elif evidence_key == "settings_2x":
            if _CC_SETTINGS_2X_RE.search(content):
                report["engine_major"] = "2.x"
                report["evidence"]["settings_2x"] = True
                report["is_cocos"] = True
                m_platform = re.search(r'platform\s*:\s*"([^"]+)"', content)
                if m_platform:
                    report["platform"] = m_platform.group(1)

        # cocos-js/cc.js (Cocos 3.x)
        elif evidence_key == "ccjs_present":
            has_decode = "decodeUuid" in content or bool(_DECODE_UUID_RE.search(content))
            report["evidence"]["ccjs_present"] = True
            report["evidence"]["ccjs_decodeUuid"] = has_decode
            report["is_cocos"] = True
            if report["engine_major"] is None:
                report["engine_major"] = "3.x"

        # src/cc.js (Cocos 2.x)
        elif evidence_key == "ccjs_2x_present":
            report["evidence"]["ccjs_present"] = True
            report["is_cocos"] = True
            if report["engine_major"] is None:
                report["engine_major"] = "2.x"

        # chunks/bundle.js
        elif evidence_key == "chunks_bundle":
            report["evidence"]["chunks_bundle"] = True

        # import-map.json (Cocos 3.x) — extract cocos-js/cc.<hash>.js reference
        elif evidence_key == "import_map_content":
            report["evidence"]["import_map_content"] = True
            m = re.search(r'"cc"\s*:\s*"([^"]+)"', content)
            if m:
                ref = m.group(1).replace("\\u002F", "/").lstrip("./")
                import_map_cc_ref = ref

        # main.js (Cocos 2.x)
        elif evidence_key == "main_js":
            if _CC_GAME_RE.search(content):
                report["evidence"]["main_js_cc_game"] = True
                report["is_cocos"] = True
                if report["engine_major"] is None:
                    report["engine_major"] = "2.x"

        # polyfills.bundle.js
        elif evidence_key == "polyfills_content":
            report["evidence"]["polyfills_content"] = True

        # system.bundle.js
        elif evidence_key == "system_content":
            report["evidence"]["system_content"] = True

    # ---- Follow import-map cc reference if present ----
    if import_map_cc_ref and not any(
        report["files"].get(k) for k in ("cocos-js/cc.js",)
    ):
        url = f"{base_url}{import_map_cc_ref}"
        status, content = _fetch_text(url)
        if status == 200 and content:
            report["files"][import_map_cc_ref] = {"size": len(content), "status": status}
            has_decode = "decodeUuid" in content or bool(_DECODE_UUID_RE.search(content))
            report["evidence"]["ccjs_present"] = True
            report["evidence"]["ccjs_decodeUuid"] = has_decode
            report["is_cocos"] = True
            if report["engine_major"] is None:
                report["engine_major"] = "3.x"

    # ---- Try one bundle's config.json to verify bundle structure ----
    if report["is_cocos"] and report["engine_major"] == "3.x":
        # Try common bundle names
        for bname in ("main", "internal", "resources"):
            cfg_url = f"{base_url}assets/{bname}/config.json"
            status, content = _fetch_text(cfg_url)
            if status == 200 and content:
                try:
                    cfg = json.loads(content)
                    report.setdefault("bundles_detail", []).append({
                        "name": cfg.get("name", bname),
                        "deps": cfg.get("deps", []),
                        "uuids_count": len(cfg.get("uuids", [])),
                        "types_count": len(cfg.get("types", [])),
                        "paths_count": len(cfg.get("paths", [])),
                        "packs_count": len(cfg.get("packs", [])),
                        "scenes_count": len(cfg.get("scenes", [])),
                    })
                    report["evidence"]["bundle_structure"] = True
                except Exception:
                    pass
                break

    # ---- Final sanity ----
    if not any(
        report["evidence"].get(k)
        for k in (
            "title_cocos", "settings_json", "settings_2x",
            "ccjs_present", "bundle_structure", "main_js_cc_game",
            "polyfills_bundle", "system_bundle", "import_map",
            "polyfills_content", "system_content", "import_map_content",
        )
    ):
        report["is_cocos"] = False

    # Infer engine_major from HTML evidence when we couldn't read settings files.
    if report["is_cocos"] and report["engine_major"] is None:
        if (
            report["evidence"].get("polyfills_bundle")
            or report["evidence"].get("system_bundle")
            or report["evidence"].get("import_map")
            or report["evidence"].get("cc_js_ref")
            or report["evidence"].get("import_map_content")
        ):
            report["engine_major"] = "3.x"
        elif report["evidence"].get("main_js_cc_game"):
            report["engine_major"] = "2.x"

    return report


# -----------------------------------------------------------------------------
# Console summary
# -----------------------------------------------------------------------------

def _console_summary(report: Dict[str, Any]) -> str:
    lines: List[str] = []
    lines.append("=" * 70)
    lines.append(f"Input: {report['input']}  ({report['input_type']})")
    lines.append("=" * 70)
    lines.append(f"Is Cocos Creator: {report['is_cocos']}")
    if report["is_cocos"]:
        lines.append(f"  Engine major : {report.get('engine_major')}")
        lines.append(f"  Engine version: {report.get('engine_version')}")
        lines.append(f"  Platform     : {report.get('platform')}")
        lines.append(f"  Design res   : {report.get('design_resolution')}")
        lines.append(f"  Physics      : {report.get('physics')}")
        lines.append(f"  Launch scene : {report.get('launch_scene')}")
        bundles = report.get("bundles") or []
        if bundles:
            lines.append(f"  Bundles ({len(bundles)}): {', '.join(map(str, bundles))}")
        if report.get("bundles_detail"):
            lines.append("  Bundle details:")
            for b in report["bundles_detail"]:
                lines.append(
                    f"    - {b['name']:<24}  uuids={b['uuids_count']:<4} "
                    f"types={b['types_count']:<3} paths={b['paths_count']:<4} "
                    f"packs={b['packs_count']:<3} scenes={b['scenes_count']}"
                )
    ev = report.get("evidence", {})
    if ev:
        positive = [k for k, v in ev.items() if v and k != "scirra_marker"]
        negative = [k for k, v in ev.items() if not v]
        lines.append("")
        lines.append(f"Evidence (positive): {', '.join(positive) or '(none)'}")
        lines.append(f"Evidence (negative): {', '.join(negative) or '(none)'}")
    if report.get("errors"):
        lines.append("")
        lines.append("Errors:")
        for e in report["errors"]:
            lines.append(f"  - {e}")
    return "\n".join(lines)


# -----------------------------------------------------------------------------
# CLI
# -----------------------------------------------------------------------------

def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(
        description="Detect Cocos Creator games on Poki CDN or in a local directory.",
        usage=(
            "python3 detect_cocos_game.py [--json] [--out FILE] [--slug SLUG | "
            "URL | DIR]"
        ),
    )
    p.add_argument(
        "target",
        nargs="?",
        help=(
            "Local directory, Poki CDN URL "
            "(https://<host>.gdn.poki.com/<version>/), or game entry URL."
        ),
    )
    p.add_argument(
        "--slug",
        help="Poki game slug (e.g. merge-arena). Resolves the CDN URL automatically.",
    )
    p.add_argument(
        "--json",
        action="store_true",
        help="Print the JSON report to stdout (in addition to the console summary).",
    )
    p.add_argument(
        "--out",
        help="Write the JSON report to this file.",
    )
    p.add_argument(
        "--quiet",
        action="store_true",
        help="Only print the console summary (no JSON).",
    )
    args = p.parse_args(argv)

    if not args.target and not args.slug:
        p.error("Provide a target (URL or directory) or --slug.")

    # Resolve target
    if args.slug:
        sys.stderr.write(f"Resolving Poki slug '{args.slug}'...\n")
        base_url = resolve_poki_slug(args.slug)
        if not base_url:
            sys.stderr.write(f"ERROR: could not resolve slug '{args.slug}'\n")
            return 2
        sys.stderr.write(f"Resolved to: {base_url}\n")
        target = base_url
        target_is_url = True
    elif args.target.startswith("http://") or args.target.startswith("https://"):
        target = args.target
        target_is_url = True
    else:
        target = os.path.abspath(args.target)
        target_is_url = False

    # Run scan
    if target_is_url:
        report = _scan_url(target)
    else:
        report = _scan_local_directory(target)

    # Output
    if not args.quiet or args.json or args.out:
        # Console summary (skip if --quiet without --json)
        pass
    if not args.quiet:
        print(_console_summary(report))
        print()

    if args.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        sys.stderr.write(f"Report written to {args.out}\n")

    return 0 if report["is_cocos"] else 1


if __name__ == "__main__":
    sys.exit(main())
