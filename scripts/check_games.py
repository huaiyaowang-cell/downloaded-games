#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
校验已抓取游戏目录的完整性：对比「页面引用的资源」与「磁盘上实际存在的文件」。

只读脚本，不修改任何文件。

检查两类引用：
1) Unity：index.html 里的 window.__CG_UNITY_CONFIG__，按 unity-2020.js 的 toLocal()
   规则把 CDN 绝对地址映射为本地路径（取 /Build/ 之后的部分，剥离 .br/.gz 扩展名）。
   缺 loaderUrl 指向的 loader.js 会导致离线黑屏（createUnityInstance 只由它定义）。
2) 静态引用：index.html 及其 iframe 子页里的 src= / href= 相对路径。
   跳过 http(s):// 绝对地址、data:/blob:/javascript: 伪协议、锚点。

注意：运行时动态拼接 URL 加载的资源（音频、关卡包、AssetBundle、StreamingAssets）
无法被静态检出，本脚本报告 OK 不代表游戏一定能玩到通关。

用法（在 downloaded-games/ 目录下执行）：
    python3 scripts/check_games.py                  # 检查全部游戏
    python3 scripts/check_games.py -g donut-place   # 只查指定游戏（可重复）
    python3 scripts/check_games.py --json           # 机器可读输出
    python3 scripts/check_games.py -v               # 同时列出已通过的引用

退出码：0=全部通过，1=存在缺失，2=用法/环境错误
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.parse
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_GAMES_DIR = PROJECT_ROOT / "games"

UNITY_CONFIG_RE = re.compile(r"__CG_UNITY_CONFIG__\s*=\s*(\{.*?\})\s*;", re.S)
REF_RE = re.compile(r"""(?:src|href)\s*=\s*["']([^"']+)["']""", re.I)
IFRAME_SRC_RE = re.compile(r"""<iframe[^>]*\ssrc\s*=\s*["']([^"']+)["']""", re.I)
HTML_COMMENT_RE = re.compile(r"<!--.*?-->", re.S)

# 缺了会导致游戏起不来 vs 只影响观感（favicon/图标等）
CRITICAL_EXTS = (".js", ".css", ".html", ".htm", ".wasm", ".data", ".json", ".mjs")
MINOR_EXTS = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico")

# Unity 构建文件：缺任何一个离线必然起不来
UNITY_KEYS = ("loaderUrl", "frameworkUrl", "codeUrl", "dataUrl")

SKIP_PREFIXES = ("http://", "https://", "//", "data:", "blob:", "javascript:", "mailto:", "#", "about:")


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return ""


def unity_url_to_local(url: str) -> str:
    """镜像 unity-2020.js 的 toLocal()：取 /Build/ 之后，剥离 .br/.gz。"""
    path = urllib.parse.urlparse(url).path
    marker = "/Build/"
    idx = path.rfind(marker)
    name = path[idx + len(marker):] if idx >= 0 else path.lstrip("/")
    return re.sub(r"\.(br|gz)$", "", name, flags=re.I)


def exists_any(game_dir: Path, rel: str) -> bool:
    """磁盘存在性检查，容忍 URL 百分号编码差异。"""
    for cand in {rel, urllib.parse.unquote(rel)}:
        if not cand:
            continue
        try:
            if (game_dir / cand).exists():
                return True
        except OSError:
            continue
    return False


def classify(ref: str) -> str:
    """判断缺失的严重程度：critical 会让游戏起不来，minor 只影响观感。"""
    low = ref.lower()
    if low.endswith(CRITICAL_EXTS):
        return "critical"
    if low.endswith(MINOR_EXTS):
        return "minor"
    return "critical"


def normalize_ref(ref: str) -> str | None:
    """把 HTML 引用规整成相对路径；不可本地校验的返回 None。"""
    ref = ref.strip()
    if not ref:
        return None
    low = ref.lower()
    if low.startswith(SKIP_PREFIXES):
        return None
    ref = ref.split("?", 1)[0].split("#", 1)[0]
    ref = re.sub(r"^\./+", "", ref).lstrip("/")
    return ref or None


def collect_static_refs(game_dir: Path, html_name: str, seen_pages: set[str]) -> list[tuple[str, str]]:
    """收集单个页面的静态引用，并递归跟进 iframe 子页。返回 [(引用, 来源页)]。"""
    if html_name in seen_pages:
        return []
    seen_pages.add(html_name)

    page = game_dir / html_name
    if not page.exists():
        return []
    # 注释掉的引用不算数（如 <!--<link rel="apple-touch-icon" href=".png">-->）
    html = HTML_COMMENT_RE.sub("", read_text(page))

    refs: list[tuple[str, str]] = []
    for raw in REF_RE.findall(html):
        rel = normalize_ref(raw)
        if rel:
            refs.append((rel, html_name))

    # iframe 子页（Poki 系 index.html → game.html）本身也要继续扫
    for raw in IFRAME_SRC_RE.findall(html):
        sub = normalize_ref(raw)
        if sub and sub.lower().endswith((".html", ".htm")):
            refs.extend(collect_static_refs(game_dir, sub, seen_pages))

    return refs


def check_game(game_dir: Path) -> dict:
    name = game_dir.name
    result: dict = {
        "game": name,
        "type": "unknown",
        "missing": [],
        "checked": 0,
        "notes": [],
    }

    index = game_dir / "index.html"
    if not index.exists():
        result["type"] = "no-index"
        result["notes"].append("目录下没有 index.html")
        return result

    seen: set[str] = set()
    checked: set[str] = set()

    # 1) Unity 构建文件：入口页及其 iframe 子页都可能存在 __CG_UNITY_CONFIG__
    #    （父页+iframe 结构的游戏，配置常写在子页 game.html 里，入口页只有广告）。
    _cfg_pages = [index.name]
    _cfg_seen = {index.name}
    _cfg_stack = [index.name]
    while _cfg_stack:
        _nm = _cfg_stack.pop()
        _pg = game_dir / _nm
        if not _pg.exists():
            continue
        for _raw in IFRAME_SRC_RE.findall(HTML_COMMENT_RE.sub("", read_text(_pg))):
            _sub = normalize_ref(_raw)
            if _sub and _sub.lower().endswith((".html", ".htm")) and _sub not in _cfg_seen:
                _cfg_seen.add(_sub)
                _cfg_pages.append(_sub)
                _cfg_stack.append(_sub)

    m = None
    for _pg_name in _cfg_pages:
        _pg_path = game_dir / _pg_name
        if _pg_path.exists():
            _m = UNITY_CONFIG_RE.search(read_text(_pg_path))
            if _m:
                m = _m
                break
    if m:
        result["type"] = "unity"
        try:
            cfg = json.loads(m.group(1))
        except json.JSONDecodeError as e:
            result["notes"].append(f"__CG_UNITY_CONFIG__ 解析失败: {e}")
            cfg = {}
        for key in UNITY_KEYS:
            url = cfg.get(key)
            if not url:
                result["notes"].append(f"{key} 未配置")
                continue
            rel = unity_url_to_local(url)
            checked.add(rel)
            if not exists_any(game_dir, rel):
                # Unity 构建文件缺任何一个都必然黑屏，无视扩展名一律 critical
                result["missing"].append({
                    "ref": rel,
                    "from": f"__CG_UNITY_CONFIG__.{key}",
                    "severity": "critical",
                })
    else:
        result["type"] = "html5"

    # 2) 静态引用（两类都要查）
    for rel, src_page in collect_static_refs(game_dir, "index.html", seen):
        if rel in checked:
            continue
        checked.add(rel)
        if not exists_any(game_dir, rel):
            result["missing"].append({"ref": rel, "from": src_page, "severity": classify(rel)})

    result["checked"] = len(checked)
    if result["checked"] == 0:
        result["notes"].append("未解析出任何本地引用，可能是全动态加载")
    return result


def main() -> int:
    ap = argparse.ArgumentParser(description="校验已抓取游戏目录的完整性（只读）")
    ap.add_argument("-g", "--game", action="append", default=[], help="只检查指定游戏目录名，可重复")
    ap.add_argument("--games-dir", default=str(DEFAULT_GAMES_DIR), help=f"游戏根目录，默认 {DEFAULT_GAMES_DIR}")
    ap.add_argument("--json", action="store_true", help="输出 JSON")
    ap.add_argument("-v", "--verbose", action="store_true", help="同时显示通过的游戏的检查数量明细")
    args = ap.parse_args()

    games_dir = Path(args.games_dir).expanduser().resolve()
    if not games_dir.is_dir():
        print(f"游戏目录不存在: {games_dir}", file=sys.stderr)
        return 2

    if args.game:
        targets = [games_dir / g for g in args.game]
        for t in targets:
            if not t.is_dir():
                print(f"游戏目录不存在: {t}", file=sys.stderr)
                return 2
    else:
        targets = sorted(
            d for d in games_dir.iterdir()
            if d.is_dir() and not d.name.startswith(("a-offline", ".", "__pycache__"))
        )

    results = [check_game(d) for d in targets]

    def crit(r: dict) -> list:
        return [m for m in r["missing"] if m["severity"] == "critical"]

    if args.json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
        return 1 if any(crit(r) for r in results) else 0

    width = max((len(r["game"]) for r in results), default=10)
    broken = 0
    degraded = 0
    for r in results:
        criticals = crit(r)
        minors = [m for m in r["missing"] if m["severity"] == "minor"]
        if criticals:
            broken += 1
            print(f"✗ {r['game']:<{width}}  [{r['type']}] 缺 {len(criticals)} 项关键文件")
        elif minors:
            degraded += 1
            print(f"! {r['game']:<{width}}  [{r['type']}] 缺 {len(minors)} 项次要资源（不影响运行）")
        elif r["type"] == "no-index":
            print(f"- {r['game']:<{width}}  [跳过] 无 index.html")
        else:
            line = f"✓ {r['game']:<{width}}  [{r['type']}]"
            if args.verbose:
                line += f" 已核对 {r['checked']} 项引用"
            print(line)
        for item in criticals:
            print(f"      [关键] {item['ref']}   ← {item['from']}")
        for item in minors:
            print(f"      [次要] {item['ref']}   ← {item['from']}")
        for note in r["notes"]:
            if r["type"] != "no-index":
                print(f"      注意: {note}")

    total = sum(1 for r in results if r["type"] != "no-index")
    print(f"\n共 {total} 个游戏：{broken} 个缺关键文件，{degraded} 个仅缺次要资源。")
    print("注意：运行时动态加载的资源（音频/关卡包/StreamingAssets）不在检查范围内，")
    print("      本脚本通过不代表游戏一定能玩到通关。")
    return 1 if broken else 0


if __name__ == "__main__":
    sys.exit(main())
