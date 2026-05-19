#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
上传 UPLOAD_PRE_PATH 目录下的游戏文件夹到 GCS bucket（默认 games/）。

配置优先级:
1) 环境变量
2) conf.rabigame.yaml

必填配置:
- BUCKET: bucket 名称
- GC_KEY: GCP service account（支持 dict / JSON 字符串 / JSON 文件路径）

可选配置:
- BUCKET_TARGET: 桶内前缀路径，默认 r_game
- UPLOAD_PRE_PATH: 游戏根目录名（相对项目根），默认 games；设为 games-test 时 include 列表相对 games-test/
- UPLOAD_INCLUDE_FOLDERS: 仅上传这些游戏目录（列表，相对 UPLOAD_PRE_PATH）
  - 支持两种写法：
    1) 写目录名或相对路径（如 happy-glass、admob_ads/Mob_Blocky_Puzzle）
    2) 写“配置文件路径/文件夹路径”
       - 配置文件：每行一个目录名（也支持 JSON 数组形式）
       - 文件夹：若以 ./、../、~ 或绝对路径提供，会枚举其下子目录；否则按 UPLOAD_PRE_PATH 下具体目录处理
- UPLOAD_EXCLUDE_FOLDERS: 排除 UPLOAD_PRE_PATH 下的目录名（列表）
- UPLOAD_INCLUDE_FILES: 仅上传匹配文件名（glob 列表）
- UPLOAD_EXCLUDE_FILES: 排除匹配文件名（glob 列表）
- OFFLINE_INCLUDE_FOLDERS: 离线包专用游戏目录（列表，相对 UPLOAD_PRE_PATH；为空时回退 UPLOAD_INCLUDE_FOLDERS）
- BUCKET_CDN_MAP: bucket 名称 → CDN 域名（如 rabigame-puzzlegame: puzzle.rabigame.fun），用于游戏入口与离线包路径
"""

from __future__ import annotations

from collections import defaultdict
import fnmatch
import json
import mimetypes
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import yaml
from google.cloud.storage import Blob, Client
from google.oauth2.service_account import Credentials

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
CONF_PATH = PROJECT_ROOT / "conf.rabigame.yaml"

FAILED_LOG_FILENAME = "bucket-upload-failed-manifest.json"
DEFAULT_CDN_HOST = "rabigame.fun"
DEFAULT_UPLOAD_PRE_PATH = "games"

# 由 apply_upload_pre_path() 根据 conf 中的 UPLOAD_PRE_PATH 更新
GAMES_ROOT = PROJECT_ROOT / DEFAULT_UPLOAD_PRE_PATH


def normalize_upload_pre_path(raw: Any) -> str:
    pre = str(raw or DEFAULT_UPLOAD_PRE_PATH).strip().replace("\\", "/").strip("/")
    return pre or DEFAULT_UPLOAD_PRE_PATH


def resolve_games_root(upload_pre_path: str | None = None) -> Path:
    return (PROJECT_ROOT / normalize_upload_pre_path(upload_pre_path)).resolve()


def apply_upload_pre_path(upload_pre_path: str | None = None) -> Path:
    """根据 UPLOAD_PRE_PATH 设置模块级 GAMES_ROOT（上传/离线包脚本共用）。"""
    global GAMES_ROOT
    GAMES_ROOT = resolve_games_root(upload_pre_path)
    return GAMES_ROOT


def _load_yaml_config() -> dict[str, Any]:
    if not CONF_PATH.exists():
        return {}
    with open(CONF_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _parse_gc_key(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw

    if isinstance(raw, str):
        raw = raw.strip()
        if not raw:
            raise ValueError("GC_KEY 为空字符串")

        if raw.startswith("{"):
            return json.loads(raw)

        possible_file = Path(raw)
        if possible_file.exists() and possible_file.is_file():
            with open(possible_file, "r", encoding="utf-8") as f:
                return json.load(f)

    raise ValueError("GC_KEY 格式不正确，需为 JSON 对象、JSON 字符串或 JSON 文件路径")


def _parse_bucket_cdn_map(raw: Any) -> dict[str, str]:
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return {str(k).strip(): str(v).strip() for k, v in raw.items() if str(k).strip()}
    if isinstance(raw, str):
        text = raw.strip()
        if not text:
            return {}
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            try:
                import ast

                parsed = ast.literal_eval(text)
            except (SyntaxError, ValueError):
                return {}
        if isinstance(parsed, dict):
            return {str(k).strip(): str(v).strip() for k, v in parsed.items() if str(k).strip()}
    return {}


def _normalize_cdn_host(host: str) -> str:
    h = (host or "").strip().rstrip("/")
    if h.startswith("https://"):
        h = h[len("https://") :]
    elif h.startswith("http://"):
        h = h[len("http://") :]
    return h or DEFAULT_CDN_HOST


def resolve_cdn_host(
    bucket_name: str,
    bucket_cdn_map: dict[str, str] | None = None,
    *,
    default_host: str = DEFAULT_CDN_HOST,
) -> str:
    key = (bucket_name or "").strip()
    mapping = bucket_cdn_map or {}
    host = mapping.get(key) or default_host
    return _normalize_cdn_host(host)


def resolve_cdn_base_url(
    bucket_name: str,
    bucket_cdn_map: dict[str, str] | None = None,
    *,
    default_host: str = DEFAULT_CDN_HOST,
) -> str:
    return f"https://{resolve_cdn_host(bucket_name, bucket_cdn_map, default_host=default_host)}"


def resolve_storage_base_url(bucket_name: str) -> str:
    name = (bucket_name or "").strip()
    if not name:
        return "https://storage.googleapis.com"
    return f"https://storage.googleapis.com/{name}"


def _config_value(key: str, file_cfg: dict[str, Any], default: Any = None) -> Any:
    env_val = os.getenv(key)
    if env_val is not None and env_val != "":
        if isinstance(default, list):
            try:
                parsed = json.loads(env_val)
                if isinstance(parsed, list):
                    return parsed
            except json.JSONDecodeError:
                return [v.strip() for v in env_val.split(",") if v.strip()]
        return env_val

    if key in file_cfg and file_cfg[key] is not None:
        return file_cfg[key]
    return default


def _match_file(filename: str, include: list[str], exclude: list[str]) -> bool:
    if exclude and any(fnmatch.fnmatch(filename, pat) for pat in exclude):
        return False
    if not include:
        return True
    return any(fnmatch.fnmatch(filename, pat) for pat in include)


def _content_type(file_path: Path) -> str:
    suffixes = [s.lower() for s in file_path.suffixes]
    if suffixes and suffixes[-1] in (".br", ".gz"):
        return _content_type(file_path.with_suffix(""))

    guessed, _ = mimetypes.guess_type(str(file_path))
    ext = file_path.suffix.lower()
    if ext == ".js" or guessed in ("text/javascript", "application/x-javascript"):
        return "application/javascript"
    if guessed:
        return guessed

    fallback = {
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".json": "application/json",
        ".wasm": "application/wasm",
        ".data": "application/octet-stream",
    }
    return fallback.get(ext, "application/octet-stream")


def _content_encoding(file_path: Path) -> str | None:
    ext = file_path.suffix.lower()
    if ext == ".gz":
        return "gzip"
    return None


def _normalize_to_project_root_path(raw: str) -> Path:
    """
    把配置里的路径解析成 PROJECT_ROOT 内的 Path。
    - 相对路径：视为相对 PROJECT_ROOT
    - 绝对路径/~/：解析为绝对路径
    """
    raw = (raw or "").strip()
    raw = os.path.expanduser(raw)
    p = Path(raw)
    if not p.is_absolute():
        p = PROJECT_ROOT / p
    return p


def _resolve_games_path(raw: str) -> Path:
    """
    将配置项解析为 UPLOAD_PRE_PATH 下的路径。
    - 默认：相对 UPLOAD_PRE_PATH（如 happy-glass、admob_ads/Mob_Blocky_Puzzle）
    - 显式 {UPLOAD_PRE_PATH}/ 前缀：相对项目根
    - ./ ../ ~ 或绝对路径：按路径字面解析（须在 UPLOAD_PRE_PATH 内才参与上传）
    """
    raw_item = (raw or "").strip()
    if not raw_item:
        return GAMES_ROOT

    expanded = os.path.expanduser(raw_item)
    normalized = raw_item.replace("\\", "/")
    pre_name = GAMES_ROOT.name

    if normalized == pre_name or normalized.startswith(pre_name + "/"):
        return _normalize_to_project_root_path(normalized)

    # 兼容仍写 games/ 或 games-test/ 等完整前缀
    if "/" in normalized and not normalized.startswith(("./", "../")):
        first_seg = normalized.split("/", 1)[0]
        candidate = PROJECT_ROOT / first_seg
        if candidate.is_dir() and first_seg != pre_name:
            try:
                candidate.resolve().relative_to(PROJECT_ROOT.resolve())
                return _normalize_to_project_root_path(normalized)
            except ValueError:
                pass

    is_container_path = (
        raw_item.startswith("./")
        or raw_item.startswith("../")
        or raw_item.startswith("~")
        or Path(expanded).is_absolute()
    )
    if is_container_path:
        return Path(expanded).resolve()

    return (GAMES_ROOT / normalized).resolve()


def _is_under_games(path: Path) -> bool:
    try:
        path.resolve().relative_to(GAMES_ROOT.resolve())
        return True
    except ValueError:
        return False


def _games_relative_key(path: Path) -> str:
    return path.resolve().relative_to(GAMES_ROOT.resolve()).as_posix()


def _read_folder_names_from_file(list_file: Path) -> list[str]:
    """
    配置文件支持两种格式：
    - JSON 数组：["dir1","dir2"]
    - 文本：每行一个目录名（允许 # 注释、允许 "- xxx"）
    """
    content = list_file.read_text(encoding="utf-8").strip()
    if not content:
        return []

    if content.startswith("["):
        parsed = json.loads(content)
        if isinstance(parsed, list):
            return [str(x).strip() for x in parsed if str(x).strip()]

    out: list[str] = []
    for line in content.splitlines():
        s = line.strip()
        if not s:
            continue
        if s.startswith("#"):
            continue
        # 兼容 YAML 列表项 "- xxx"
        if s.startswith("- "):
            s = s[2:].strip()
        s = s.strip("\"' ")
        if s:
            out.append(s)
    return out


def _expand_include_item_to_root_paths(item: str) -> list[Path]:
    """
    将 UPLOAD_INCLUDE_FOLDERS / OFFLINE_INCLUDE_FOLDERS 的单个元素展开为游戏根目录集合。
    item 可以是：
    - games 下的目录名或相对路径（如 happy-glass、admob_ads/Mob_Blocky_Puzzle）
    - 配置文件路径：文件中列出 games 下的目录名
    - 容器路径（./、../、~、绝对路径）：枚举其下子目录
    """
    raw_item = (item or "").strip()
    p = _resolve_games_path(item)

    is_container_path = (
        raw_item.startswith("./")
        or raw_item.startswith("../")
        or raw_item.startswith("~")
        or Path(os.path.expanduser(raw_item)).is_absolute()
    )
    if p.exists() and p.is_dir():
        if not is_container_path:
            return [p] if _is_under_games(p) else []

        out: list[Path] = []
        for child in sorted(p.iterdir(), key=lambda x: x.name.lower()):
            if child.is_dir() and not child.name.startswith(".") and _is_under_games(child):
                out.append(child)
        return out

    if p.exists() and p.is_file():
        names = _read_folder_names_from_file(p)
        out: list[Path] = []
        for name in names:
            rp = _resolve_games_path(name)
            if rp.exists() and rp.is_dir() and _is_under_games(rp):
                out.append(rp)
            else:
                print(f"⚠️ 跳过不存在目录（{GAMES_ROOT.name}/）: {name}")
        return out

    if p.exists() and p.is_dir() and _is_under_games(p):
        return [p]
    print(f"⚠️ 跳过不存在目录/文件（{GAMES_ROOT.name}/）: {item}")
    return []


def _discover_root_folders(include_folders: list[str], exclude_folders: list[str]) -> list[Path]:
    if not GAMES_ROOT.is_dir():
        print(f"⚠️ 游戏目录不存在: {GAMES_ROOT}")
        return []

    if include_folders:
        out_set: dict[str, Path] = {}
        for item in include_folders:
            for p in _expand_include_item_to_root_paths(item):
                if not _is_under_games(p):
                    print(f"⚠️ 跳过不在 {GAMES_ROOT.name}/ 内的路径: {p}")
                    continue
                rel_key = _games_relative_key(p)
                top_name = rel_key.split("/", 1)[0]
                if top_name in exclude_folders or p.name in exclude_folders:
                    continue
                if p.is_dir() and not p.name.startswith("."):
                    out_set[rel_key] = p
        return [out_set[k] for k in sorted(out_set.keys(), key=lambda x: x.lower())]

    folders: list[Path] = []
    for item in sorted(GAMES_ROOT.iterdir(), key=lambda p: p.name.lower()):
        if not item.is_dir():
            continue
        if item.name.startswith("."):
            continue
        if item.name in exclude_folders:
            continue
        folders.append(item)
    return folders


def _collect_files(
    roots: list[Path], bucket_target: str, include_files: list[str], exclude_files: list[str]
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for root in roots:
        root_key = _games_relative_key(root)
        for cur_dir, _subdirs, files in os.walk(root):
            cur = Path(cur_dir)
            for fn in files:
                if not _match_file(fn, include_files, exclude_files):
                    continue
                local_path = cur / fn
                rel = local_path.relative_to(GAMES_ROOT)
                remote = f"{bucket_target.rstrip('/')}/{rel.as_posix()}"
                out.append(
                    {
                        "local_path": local_path,
                        "remote_path": remote,
                        "relative_path": rel.as_posix(),
                        "root_key": root_key,
                    }
                )
    return out


def _upload_one(bucket, local_path: Path, remote_path: str) -> str | None:
    try:
        blob = Blob(remote_path, bucket)
        if local_path.suffix.lower() == ".html":
            blob.cache_control = "public, max-age=360"
        else:
            blob.cache_control = "public, max-age=31536000, immutable"
        blob.content_type = _content_type(local_path)
        content_encoding = _content_encoding(local_path)
        if content_encoding:
            blob.content_encoding = content_encoding
        with open(local_path, "rb") as f:
            blob.upload_from_file(f)
        return blob.public_url or f"gs://{bucket.name}/{remote_path}"
    except Exception as e:
        print(f"    ❌ {e}")
        return None


def _load_failed_manifest_for_root(root: Path) -> dict[str, Any] | None:
    log_path = root / ".output" / FAILED_LOG_FILENAME
    if not log_path.exists():
        return None
    with open(log_path, "r", encoding="utf-8") as f:
        return json.load(f)


def _write_failed_manifest_for_root(
    root: Path,
    bucket_name: str,
    bucket_target: str,
    failed_files: list[dict[str, Any]],
) -> None:
    log_path = root / ".output" / FAILED_LOG_FILENAME
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with open(log_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "bucket": bucket_name,
                "bucket_target": bucket_target,
                "upload_time": datetime.now().isoformat(),
                "failed": len(failed_files),
                "files": failed_files,
            },
            f,
            indent=2,
            ensure_ascii=False,
        )


def _load_config() -> dict[str, Any]:
    file_cfg = _load_yaml_config()
    bucket = _config_value("BUCKET", file_cfg)
    gc_key_raw = _config_value("GC_KEY", file_cfg)
    if not bucket:
        raise ValueError("缺少 BUCKET（环境变量或 conf.rabigame.yaml）")
    if gc_key_raw is None:
        raise ValueError("缺少 GC_KEY（环境变量或 conf.rabigame.yaml）")

    upload_pre_path = normalize_upload_pre_path(
        _config_value("UPLOAD_PRE_PATH", file_cfg, DEFAULT_UPLOAD_PRE_PATH)
    )
    apply_upload_pre_path(upload_pre_path)

    cfg = {
        "UPLOAD_PRE_PATH": upload_pre_path,
        "GAMES_ROOT": str(GAMES_ROOT),
        "BUCKET_TARGET": _config_value("BUCKET_TARGET", file_cfg, "r_game"),
        "UPLOAD_INCLUDE_FOLDERS": _config_value("UPLOAD_INCLUDE_FOLDERS", file_cfg, []),
        "UPLOAD_EXCLUDE_FOLDERS": _config_value(
            "UPLOAD_EXCLUDE_FOLDERS",
            file_cfg,
            [
                "a-offline-game-zip",
                "a-offline-game-zip-dev",
            ],
        ),
        "UPLOAD_INCLUDE_FILES": _config_value("UPLOAD_INCLUDE_FILES", file_cfg, []),
        "UPLOAD_EXCLUDE_FILES": _config_value("UPLOAD_EXCLUDE_FILES", file_cfg, []),
        "OFFLINE_INCLUDE_FOLDERS": _config_value("OFFLINE_INCLUDE_FOLDERS", file_cfg, []),
        "BUCKET_CDN_MAP": _parse_bucket_cdn_map(
            _config_value("BUCKET_CDN_MAP", file_cfg, {})
        ),
    }
    cfg["BUCKET"] = bucket
    cfg["GC_KEY"] = _parse_gc_key(gc_key_raw)
    return cfg


def main(dry_run: bool = False, retry_failed: bool = False, dev_target: bool = False) -> None:
    print("=" * 56)
    header = "上传游戏目录到 GCS Bucket"
    tags: list[str] = []
    if dry_run:
        tags.append("dry-run")
    if retry_failed:
        tags.append("retry-failed")
    if dev_target:
        tags.append("dev")
    print(header + (f" [{', '.join(tags)}]" if tags else ""))
    print("=" * 56)

    cfg = _load_config()
    bucket_name = cfg["BUCKET"]
    bucket_cdn_map = cfg.get("BUCKET_CDN_MAP") or {}
    cdn_base_url = resolve_cdn_base_url(bucket_name, bucket_cdn_map)
    cdn_host = resolve_cdn_host(bucket_name, bucket_cdn_map)
    bucket_target = (cfg["BUCKET_TARGET"] or "r_game").strip().strip("/") or "r_game"
    if dev_target:
        bucket_target = f"{bucket_target}/dev"
    include_folders = cfg["UPLOAD_INCLUDE_FOLDERS"] or []
    exclude_folders = cfg["UPLOAD_EXCLUDE_FOLDERS"] or []
    include_files = cfg["UPLOAD_INCLUDE_FILES"] or []
    exclude_files = cfg["UPLOAD_EXCLUDE_FILES"] or []

    roots = _discover_root_folders(include_folders, exclude_folders)
    if not roots:
        print("⚠️ 没有可上传的一级目录")
        return

    print(f"📋 项目目录: {PROJECT_ROOT}")
    print(f"📋 UPLOAD_PRE_PATH: {cfg.get('UPLOAD_PRE_PATH', DEFAULT_UPLOAD_PRE_PATH)}")
    print(f"📋 游戏目录: {GAMES_ROOT}")
    print(f"📋 Bucket: {bucket_name}")
    print(f"📋 CDN 域名: {cdn_host} ({cdn_base_url})")
    print(f"📋 桶内目标前缀: {bucket_target}/")
    print(f"📋 本次上传目录: {[_games_relative_key(p) for p in roots]}")
    if include_files:
        print(f"📋 文件白名单: {include_files}")
    if exclude_files:
        print(f"📋 文件黑名单: {exclude_files}")
    if retry_failed:
        print(f"📋 重试模式：从每个根目录的失败日志中读取待上传文件")

    creds = Credentials.from_service_account_info(
        cfg["GC_KEY"],
        scopes=["https://www.googleapis.com/auth/devstorage.read_write"],
    )
    client = Client(credentials=creds)
    bucket = client.bucket(bucket_name)

    files: list[dict[str, Any]]
    roots_with_existing_logs: set[str] = set()

    if retry_failed:
        files = []
        for root in roots:
            manifest = _load_failed_manifest_for_root(root)
            if not manifest:
                continue
            root_key = _games_relative_key(root)
            roots_with_existing_logs.add(root_key)
            for item in manifest.get("files", []) or []:
                rel_path = item.get("relative_path")
                remote_path = item.get("remote_path")
                if not rel_path or not remote_path:
                    continue
                local_path = GAMES_ROOT / rel_path
                if not local_path.exists():
                    legacy_path = PROJECT_ROOT / rel_path
                    if legacy_path.exists():
                        local_path = legacy_path
                    else:
                        print(f"⚠️ 跳过不存在文件（来自失败日志）: {rel_path}")
                        continue
                files.append(
                    {
                        "local_path": local_path,
                        "remote_path": remote_path,
                        "relative_path": rel_path,
                        "root_key": root_key,
                    }
                )
    else:
        files = _collect_files(roots, bucket_target, include_files, exclude_files)

    if not files:
        print("⚠️ 没有匹配到文件" if not retry_failed else "⚠️ 没有可重试的失败文件")
        return

    print(f"\n🔍 共 {len(files)} 个文件待上传")

    if dry_run:
        for i, item in enumerate(files[:80], 1):
            print(f"  {i}. {item['remote_path']}")
        if len(files) > 80:
            print(f"  ... 及另外 {len(files) - 80} 个文件")
        print("\n[dry-run] 未执行上传")
        return

    success = 0
    failed = 0
    uploaded: list[dict[str, Any]] = []
    failed_by_root: dict[str, list[dict[str, Any]]] = defaultdict(list)
    entry_urls: set[str] = set()

    for idx, item in enumerate(files, 1):
        rp = item["remote_path"]
        lp = item["local_path"]
        root_key = item.get("root_key") or ""
        print(f"[{idx}/{len(files)}] {rp} ... ", end="", flush=True)
        url = _upload_one(bucket, lp, rp)
        if url:
            print("✅")
            success += 1
            uploaded.append({"path": rp, "url": url})
            if rp.endswith("/index.html"):
                entry_urls.add(f"{cdn_base_url.rstrip('/')}/{rp.lstrip('/')}")
        else:
            print("❌")
            failed += 1
            if not root_key:
                rel_path = item.get("relative_path") or (
                    lp.relative_to(GAMES_ROOT).as_posix()
                    if _is_under_games(lp)
                    else lp.relative_to(PROJECT_ROOT).as_posix()
                )
                root_key = rel_path.split("/", 1)[0]
            failed_by_root[root_key].append(
                {
                    "relative_path": item.get("relative_path")
                    or (
                        lp.relative_to(GAMES_ROOT).as_posix()
                        if _is_under_games(lp)
                        else lp.relative_to(PROJECT_ROOT).as_posix()
                    ),
                    "remote_path": rp,
                }
            )

    manifest_path = PROJECT_ROOT / ".output" / "bucket-upload-manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "bucket": bucket_name,
                "bucket_target": bucket_target,
                "upload_time": datetime.now().isoformat(),
                "success": success,
                "failed": failed,
                "files": uploaded,
            },
            f,
            indent=2,
            ensure_ascii=False,
        )

    # 每个一级目录单独写入失败日志（覆盖写）
    if retry_failed:
        for root in roots:
            root_key = _games_relative_key(root)
            if root_key not in roots_with_existing_logs:
                continue
            failed_files = failed_by_root.get(root_key, [])
            _write_failed_manifest_for_root(root, bucket_name, bucket_target, failed_files)
    else:
        for root_dir in roots:
            log_path = root_dir / ".output" / FAILED_LOG_FILENAME
            root_key = _games_relative_key(root_dir)
            failed_files = failed_by_root.get(root_key, [])
            # 如果本次有失败则写入；如果上次有失败日志但这次全成功则覆盖清空
            if failed_files or log_path.exists():
                _write_failed_manifest_for_root(root_dir, bucket_name, bucket_target, failed_files)

    print("\n" + "=" * 56)
    print(f"✅ 成功: {success}")
    if failed:
        print(f"❌ 失败: {failed}")
    if entry_urls:
        print("🎮 游戏入口地址:")
        for u in sorted(entry_urls):
            print(f"  - {u}")
    print(f"📄 上传清单: {manifest_path}")
    print("=" * 56)


if __name__ == "__main__":
    is_dry_run = "--dry-run" in sys.argv
    is_retry_failed = "--retry-failed" in sys.argv
    is_dev_target = "--dev" in sys.argv
    try:
        main(dry_run=is_dry_run, retry_failed=is_retry_failed, dev_target=is_dev_target)
    except KeyboardInterrupt:
        print("\n⚠️ 用户中断")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ {e}")
        sys.exit(1)
