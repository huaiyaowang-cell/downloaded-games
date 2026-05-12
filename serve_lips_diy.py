#!/usr/bin/env python3
"""本地启动 lips-diy-master：普通静态文件服务（非 Unity 专用）。"""
from __future__ import annotations

import argparse
import os
import socket
import sys
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Optional


def _pick_port(host: str, preferred: int) -> int:
    if preferred == 0:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind((host, 0))
            return int(s.getsockname()[1])

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind((host, preferred))
            return preferred
        except OSError:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s2:
                s2.bind((host, 0))
                return int(s2.getsockname()[1])


class QuietLogHandler(SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args) -> None:  # noqa: A002
        sys.stdout.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), format % args))


def main(argv: Optional[list[str]] = None) -> int:
    repo_root = Path(__file__).resolve().parent
    default_site = repo_root / "lips-diy-master"

    parser = argparse.ArgumentParser(description="lips-diy-master 本地静态站点")
    parser.add_argument("--host", default="127.0.0.1", help="监听地址（默认 127.0.0.1）")
    parser.add_argument("--port", type=int, default=8000, help="端口（默认 8000；占用则自动换端口）")
    parser.add_argument(
        "--dir",
        default=str(default_site),
        help=f"站点根目录（默认 {default_site.name}/）",
    )
    parser.add_argument("--no-open", action="store_true", help="不自动打开浏览器")
    args = parser.parse_args(argv)

    root = Path(args.dir).resolve()
    if not root.is_dir():
        print(f"目录不存在或不是文件夹: {root}", file=sys.stderr)
        return 2

    os.chdir(root)

    port = _pick_port(args.host, args.port)
    httpd = ThreadingHTTPServer((args.host, port), QuietLogHandler)

    url = f"http://{args.host}:{port}/"
    print(f"Serving: {root}", flush=True)
    print(f"URL: {url}", flush=True)
    print("Press Ctrl+C to quit", flush=True)

    if not args.no_open:
        threading.Timer(0.35, lambda: webbrowser.open(url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
