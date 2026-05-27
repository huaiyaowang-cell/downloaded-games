from __future__ import annotations

import argparse
import contextlib
import mimetypes
import os
import socket
import sys
import threading
import time
import urllib.request
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent
DEFAULT_GAME_DIR = REPO_ROOT / "count-control-legends"


def _pick_free_port(host: str) -> int:
    with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
        s.bind((host, 0))
        return int(s.getsockname()[1])


def _unityweb_content_type(path: str) -> str | None:
    p = path.lower()
    if p.endswith(".wasm.unityweb"):
        return "application/wasm"
    if p.endswith(".framework.js.unityweb"):
        return "application/javascript"
    if p.endswith(".data.unityweb"):
        return "application/octet-stream"
    if p.endswith(".unityweb"):
        return "application/octet-stream"
    return None


class _UnityWebGLHandler(SimpleHTTPRequestHandler):
    # Unity WebGL 有些浏览器会对 wasm 的 MIME 很挑剔；这里显式给出常见映射。
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".wasm": "application/wasm",
        ".js": "application/javascript",
        ".json": "application/json",
        ".data": "application/octet-stream",
    }

    def guess_type(self, path: str) -> str:
        forced = _unityweb_content_type(path)
        if forced:
            return forced

        guessed, _enc = mimetypes.guess_type(path)
        return guessed or "application/octet-stream"

    def end_headers(self) -> None:
        # 避免缓存导致更新后仍然读旧资源（对本地调试更友好）
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, format: str, *args) -> None:
        # 保持输出简洁（需要可自行注释掉这段）
        sys.stdout.write("%s - - [%s] %s\n" % (self.client_address[0], self.log_date_time_string(), format % args))


def _smoke_check(url: str, timeout_s: float = 5.0) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "local-launcher"})
    # 一些 Windows 环境会设置 HTTP(S)_PROXY，导致 localhost 请求被代理劫持成 502。
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(req, timeout=timeout_s) as resp:
        if resp.status != 200:
            raise RuntimeError(f"HTTP {resp.status} for {url}")
        _ = resp.read(256)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Count Control Legends 本地启动器（Unity WebGL 静态站）",
    )
    parser.add_argument("--dir", default=str(DEFAULT_GAME_DIR), help="游戏目录（默认: count-control-legends）")
    parser.add_argument("--host", default="127.0.0.1", help="监听地址（默认: 127.0.0.1）")
    parser.add_argument("--port", type=int, default=0, help="监听端口（默认: 自动选择空闲端口）")
    parser.add_argument("--no-browser", action="store_true", help="不自动打开浏览器")
    parser.add_argument(
        "--entry",
        default="index.html",
        help="入口页面（默认: index.html；通常会 iframe 到 game.html）",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="启动后做一次 HTTP 自检并退出（用于脚本/CI）",
    )
    args = parser.parse_args(argv)

    game_dir = Path(args.dir).resolve()
    if not game_dir.exists() or not (game_dir / args.entry).exists():
        print(f"找不到游戏目录或入口文件: dir={game_dir} entry={args.entry}", file=sys.stderr)
        return 2

    os.chdir(game_dir)

    port = int(args.port) if int(args.port) != 0 else _pick_free_port(args.host)
    url = f"http://{args.host}:{port}/{args.entry}"

    httpd = ThreadingHTTPServer((args.host, port), _UnityWebGLHandler)

    def _serve() -> None:
        with contextlib.suppress(KeyboardInterrupt):
            httpd.serve_forever(poll_interval=0.25)

    t = threading.Thread(target=_serve, daemon=True)
    t.start()

    # 等服务器起来（避免浏览器打开过早）
    for _ in range(50):
        try:
            _smoke_check(url, timeout_s=0.5)
            break
        except Exception:
            time.sleep(0.05)

    if args.check:
        try:
            _smoke_check(url, timeout_s=5.0)
        finally:
            httpd.shutdown()
        print(f"OK: {url}")
        return 0

    print(f"本地服务器已启动: {url}")
    print("按 Ctrl+C 退出。")

    if not args.no_browser:
        with contextlib.suppress(Exception):
            webbrowser.open(url, new=2)

    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        pass
    finally:
        httpd.shutdown()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

