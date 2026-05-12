#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
为每个游戏生成离线包（zip），可选上传到 GCS。

功能：
1) 读取现有配置，识别要处理的游戏目录（与上传脚本一致）
2) 为每个游戏构建离线包目录结构：zip 内以 rabigame.fun/ 为根，即 rabigame.fun/<BUCKET_TARGET>/<game_name>/...；
   --dev 时为 rabigame.fun/<BUCKET_TARGET>/dev/<game_name>/...（dev 为单独一级）
3) 生成 zip，命名为：<game_name>-<fingerprint>.zip
4) 保存到：a-offline-game-zip/<game_name>/（--dev 时为 a-offline-game-zip-dev/<game_name>/）
5) 可上传到 CDN 对应 bucket，并打印 CDN 地址 + Storage 源地址
   浏览器入口仍为 https://rabigame.fun/<BUCKET_TARGET>/(dev/)<game>/（与直传一致；zip 内多一层 rabigame.fun 目录名便于本地解压对齐）
   对象键前缀：a-offline-game-zip/ 或 a-offline-game-zip/dev/
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import tempfile
import time
from datetime import datetime
from pathlib import Path
from typing import Any
from zipfile import ZIP_DEFLATED, ZipFile

from google.cloud.storage import Blob, Client
from google.oauth2.service_account import Credentials

from upload_root_folders_to_bucket import _discover_root_folders, _load_config

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
OFFLINE_ZIP_DIR = PROJECT_ROOT / "a-offline-game-zip"
OFFLINE_ZIP_DIR_DEV = PROJECT_ROOT / "a-offline-game-zip-dev"
CDN_BASE_URL = "https://rabigame.fun"
STORAGE_BASE_URL = "https://storage.googleapis.com/rabigame"
DEFAULT_UPLOAD_TIMEOUT_SEC = 900
DEFAULT_UPLOAD_RETRIES = 4
DEFAULT_CHUNK_SIZE_MB = 8


def _compute_dir_fingerprint(game_root: Path) -> str:
    sha = hashlib.sha256()
    all_files: list[Path] = []
    for p in game_root.rglob("*"):
        if p.is_file():
            all_files.append(p)
    for p in sorted(all_files, key=lambda x: x.relative_to(game_root).as_posix()):
        rel = p.relative_to(game_root).as_posix()
        sha.update(rel.encode("utf-8"))
        sha.update(b"\0")
        sha.update(p.read_bytes())
        sha.update(b"\0")
    return sha.hexdigest()[:10]


def _build_one_zip(
    game_root: Path,
    bucket_target_base: str,
    dev_target: bool,
    offline_zip_dir: Path,
    remote_prefix: str,
) -> dict[str, Any]:
    game_name = game_root.name
    fingerprint = _compute_dir_fingerprint(game_root)
    zip_name = f"{game_name}-{fingerprint}.zip"
    output_dir = offline_zip_dir / game_name
    output_dir.mkdir(parents=True, exist_ok=True)
    zip_path = output_dir / zip_name

    with tempfile.TemporaryDirectory(prefix=f"offline-{game_name}-") as tmp:
        temp_root = Path(tmp)
        # zip 内路径以 rabigame.fun/ 为根，与 CDN 主机名对应；其下与桶内前缀一致（含 dev 一级）
        staged_game_dir = temp_root / "rabigame.fun" / bucket_target_base
        if dev_target:
            staged_game_dir = staged_game_dir / "dev"
        staged_game_dir = staged_game_dir / game_name
        staged_game_dir.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(game_root, staged_game_dir, dirs_exist_ok=True)

        with ZipFile(zip_path, "w", compression=ZIP_DEFLATED) as zf:
            for p in sorted(temp_root.rglob("*")):
                if not p.is_file():
                    continue
                arc_name = p.relative_to(temp_root).as_posix()
                zf.write(p, arc_name)

    rp = f"{remote_prefix.strip('/')}/{game_name}/{zip_name}"
    return {
        "game_name": game_name,
        "zip_name": zip_name,
        "zip_path": zip_path,
        "fingerprint": fingerprint,
        "remote_path": rp,
    }


def _upload_one_zip(
    bucket,
    zip_path: Path,
    remote_path: str,
    timeout_sec: int,
    retries: int,
    chunk_size_mb: int,
) -> str | None:
    blob = Blob(remote_path, bucket)
    blob.cache_control = "public, max-age=31536000, immutable"
    blob.content_type = "application/zip"
    # 分片可恢复上传，降低大文件单次写超时概率
    blob.chunk_size = max(1, chunk_size_mb) * 1024 * 1024

    attempts = max(1, retries)
    for attempt in range(1, attempts + 1):
        try:
            with open(zip_path, "rb") as f:
                blob.upload_from_file(f, timeout=timeout_sec)
            return blob.public_url or f"gs://{bucket.name}/{remote_path}"
        except Exception as e:
            if attempt >= attempts:
                print(f"    ❌ 上传失败（已重试 {attempts} 次）: {e}")
                return None
            backoff = min(2 ** attempt, 10)
            print(f"    ⚠️ 第 {attempt}/{attempts} 次失败: {e}，{backoff}s 后重试...")
            time.sleep(backoff)
    return None


def _collect_latest_zips_by_game(offline_zip_dir: Path, remote_prefix: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    if not offline_zip_dir.exists():
        return out

    for game_dir in sorted(offline_zip_dir.iterdir(), key=lambda p: p.name.lower()):
        if not game_dir.is_dir():
            continue
        zips = sorted(
            [p for p in game_dir.iterdir() if p.is_file() and p.suffix.lower() == ".zip"],
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        if not zips:
            continue
        zip_path = zips[0]
        rp = f"{remote_prefix.strip('/')}/{game_dir.name}/{zip_path.name}"
        out.append(
            {
                "game_name": game_dir.name,
                "zip_name": zip_path.name,
                "zip_path": zip_path,
                "fingerprint": "",
                "remote_path": rp,
            }
        )
    return out


def main(build: bool, upload: bool, dev_target: bool = False) -> None:
    cfg = _load_config()
    bucket_name = cfg["BUCKET"]
    bucket_target_base = (cfg["BUCKET_TARGET"] or "r_game").strip().strip("/") or "r_game"
    bucket_target = f"{bucket_target_base}/dev" if dev_target else bucket_target_base
    offline_zip_dir = OFFLINE_ZIP_DIR_DEV if dev_target else OFFLINE_ZIP_DIR
    remote_prefix = "a-offline-game-zip/dev" if dev_target else "a-offline-game-zip"
    offline_include_folders = cfg.get("OFFLINE_INCLUDE_FOLDERS") or []
    include_folders = offline_include_folders or (cfg["UPLOAD_INCLUDE_FOLDERS"] or [])
    exclude_folders = cfg["UPLOAD_EXCLUDE_FOLDERS"] or []
    offline_timeout_sec = int(cfg.get("OFFLINE_UPLOAD_TIMEOUT_SEC") or DEFAULT_UPLOAD_TIMEOUT_SEC)
    offline_retries = int(cfg.get("OFFLINE_UPLOAD_RETRIES") or DEFAULT_UPLOAD_RETRIES)
    offline_chunk_size_mb = int(cfg.get("OFFLINE_UPLOAD_CHUNK_SIZE_MB") or DEFAULT_CHUNK_SIZE_MB)

    roots = _discover_root_folders(include_folders, exclude_folders)
    if not roots:
        print("⚠️ 没有可处理的游戏目录")
        return

    print("=" * 64)
    title = "离线包生成/上传"
    if dev_target:
        title += " [dev]"
    print(title)
    print("=" * 64)
    print(f"📋 项目目录: {PROJECT_ROOT}")
    print(f"📋 游戏目录: {[p.name for p in roots]}")
    print(f"📋 离线包输出目录: {offline_zip_dir}")
    print(f"📋 离线包 zip 对象键前缀: {remote_prefix}/")
    print(f"📋 zip 内路径前缀: rabigame.fun/{bucket_target}/<game_name>/")
    print(f"📋 对应 CDN 入口: {CDN_BASE_URL.rstrip('/')}/{bucket_target}/<game_name>/index.html")
    if offline_include_folders:
        print("📋 游戏来源: OFFLINE_INCLUDE_FOLDERS")
    else:
        print("📋 游戏来源: UPLOAD_INCLUDE_FOLDERS（OFFLINE_INCLUDE_FOLDERS 未配置）")

    zip_items: list[dict[str, Any]]
    if build:
        zip_items = []
        print("\n🧱 开始生成离线包...")
        for root in roots:
            item = _build_one_zip(root, bucket_target_base, dev_target, offline_zip_dir, remote_prefix)
            zip_items.append(item)
            print(f"  ✅ {item['game_name']}: {item['zip_path']}")
    else:
        print("\n📦 仅上传模式：读取现有离线包（每个游戏取最新一个 zip）")
        zip_items = _collect_latest_zips_by_game(offline_zip_dir, remote_prefix)
        allowed_games = {p.name for p in roots}
        zip_items = [x for x in zip_items if x["game_name"] in allowed_games]
        if not zip_items:
            print("⚠️ 没有可上传的离线包，请先执行生成命令")
            return
        for item in zip_items:
            print(f"  - {item['game_name']}: {item['zip_path']}")

    uploaded_results: list[dict[str, str]] = []
    if upload:
        print("\n☁️ 开始上传离线包...")
        print(
            f"📋 上传参数: timeout={offline_timeout_sec}s, retries={offline_retries}, chunk={offline_chunk_size_mb}MB"
        )
        creds = Credentials.from_service_account_info(
            cfg["GC_KEY"],
            scopes=["https://www.googleapis.com/auth/devstorage.read_write"],
        )
        client = Client(credentials=creds)
        bucket = client.bucket(bucket_name)

        for idx, item in enumerate(zip_items, 1):
            rp = item["remote_path"]
            lp = item["zip_path"]
            size_mb = lp.stat().st_size / (1024 * 1024)
            print(f"[{idx}/{len(zip_items)}] {rp} ({size_mb:.2f} MB) ... ", end="", flush=True)
            url = _upload_one_zip(
                bucket,
                lp,
                rp,
                timeout_sec=offline_timeout_sec,
                retries=offline_retries,
                chunk_size_mb=offline_chunk_size_mb,
            )
            if not url:
                print("❌")
                continue
            print("✅")
            cdn_url = f"{CDN_BASE_URL.rstrip('/')}/{rp.lstrip('/')}"
            storage_url = f"{STORAGE_BASE_URL.rstrip('/')}/{rp.lstrip('/')}"
            game_entry_url = (
                f"{CDN_BASE_URL.rstrip('/')}/{bucket_target.strip('/')}/{item['game_name']}/index.html"
            )
            uploaded_results.append(
                {
                    "game_name": item["game_name"],
                    "cdn_url": cdn_url,
                    "storage_url": storage_url,
                    "game_entry_url": game_entry_url,
                }
            )

        manifest_name = (
            "offline-zip-upload-manifest-dev.json" if dev_target else "offline-zip-upload-manifest.json"
        )
        manifest_path = PROJECT_ROOT / ".output" / manifest_name
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        with open(manifest_path, "w", encoding="utf-8") as f:
            manifest_body: dict[str, Any] = {
                "bucket": bucket_name,
                "upload_time": datetime.now().isoformat(),
                "count": len(uploaded_results),
                "files": uploaded_results,
            }
            if dev_target:
                manifest_body["dev_target"] = True
            json.dump(
                manifest_body,
                f,
                indent=2,
                ensure_ascii=False,
            )

        print("\n🎯 离线包线上地址:")
        for item in uploaded_results:
            print(f"  - {item['game_name']}")
            print(f"    游戏入口: {item['game_entry_url']}")
            print(f"    CDN:     {item['cdn_url']}")
            print(f"    Storage: {item['storage_url']}")
        print(f"\n📄 上传清单: {manifest_path}")
    else:
        print("\n✅ 离线包已生成（未上传）")

    print("=" * 64)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build/upload offline game zip packages")
    parser.add_argument("--build-only", action="store_true", help="Only build zip packages")
    parser.add_argument("--upload-only", action="store_true", help="Only upload existing zip packages")
    parser.add_argument("--build-upload", action="store_true", help="Build then upload zip packages")
    parser.add_argument(
        "--dev",
        action="store_true",
        help="Dev zip layout: rabigame.fun/<BUCKET_TARGET>/dev/<game>/...; output under a-offline-game-zip-dev; GCS key prefix a-offline-game-zip/dev/",
    )
    args = parser.parse_args()

    build = True
    upload = False
    if args.upload_only:
        build = False
        upload = True
    elif args.build_upload:
        build = True
        upload = True
    elif args.build_only:
        build = True
        upload = False

    main(build=build, upload=upload, dev_target=args.dev)
