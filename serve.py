#!/usr/bin/env python3
from __future__ import annotations

import argparse
import mimetypes
import os
import socket
import sys
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Optional, Tuple


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


def _encoding_and_inner_path(path: str) -> Tuple[Optional[str], str]:
    lower = path.lower()
    if lower.endswith(".br"):
        return "br", path[:-3]
    if lower.endswith(".gz"):
        return "gzip", path[:-3]
    return None, path


def _should_send_content_encoding(file_path: Path, encoding: Optional[str], inner_path: str) -> bool:
    """
    有些游戏资源“文件名带 .br”，但内容并没有 brotli 压缩。
    如果误发 `Content-Encoding: br`，Chrome 会报 ERR_CONTENT_DECODING_FAILED。
    """
    if not encoding:
        return False

    try:
        head = file_path.read_bytes()[:32]
    except OSError:
        # 读不到就保守点：仍然发送 encoding。
        return True

    inner_lower = inner_path.lower()
    # Unity WebGL 常见的“未压缩”签名
    if inner_lower.endswith(".wasm") and head.startswith(b"\x00asm"):
        return False
    if inner_lower.endswith(".data") and head.startswith(b"UnityWebData1.0\0"):
        return False
    if inner_lower.endswith(".js") and (
        head.startswith(b"function")
        or head.startswith(b"(")
        or head.startswith(b"/*")
        or head.startswith(b"//")
    ):
        return False

    return True


class UnityWebGLHandler(SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args) -> None:  # noqa: A002
        sys.stdout.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), format % args))

    def guess_type(self, path: str) -> str:
        _, inner = _encoding_and_inner_path(path)

        inner_lower = inner.lower()
        if inner_lower.endswith(".wasm"):
            return "application/wasm"
        if inner_lower.endswith(".js"):
            return "application/javascript"
        if inner_lower.endswith(".data"):
            return "application/octet-stream"

        t, _ = mimetypes.guess_type(inner)
        return t or "application/octet-stream"

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def send_head(self):
        path = self.translate_path(self.path)
        path_obj = Path(path)

        if path_obj.is_dir():
            parts = self.path.split("?", 1)
            p = parts[0]
            if not p.endswith("/"):
                self.send_response(301)
                self.send_header("Location", p + "/" + ("?" + parts[1] if len(parts) > 1 else ""))
                self.end_headers()
                return None
            for index in ("index.html", "index.htm"):
                index_path = path_obj / index
                if index_path.is_file():
                    path_obj = index_path
                    break
            else:
                return super().send_head()

        try:
            f = path_obj.open("rb")
        except OSError:
            self.send_error(404, "File not found")
            return None

        encoding, inner = _encoding_and_inner_path(str(path_obj))
        ctype = self.guess_type(inner)
        send_encoding = _should_send_content_encoding(path_obj, encoding, inner)

        try:
            fs = os.fstat(f.fileno())
            self.send_response(200)
            self.send_header("Content-type", ctype)
            if send_encoding and encoding:
                self.send_header("Content-Encoding", encoding)
            self.send_header("Content-Length", str(fs.st_size))
            self.send_header("Last-Modified", self.date_time_string(fs.st_mtime))
            self.end_headers()
            return f
        except Exception:
            f.close()
            raise


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="happy-glass 本地服务器（Unity WebGL 友好）")
    parser.add_argument("--host", default="127.0.0.1", help="监听地址（默认 127.0.0.1）")
    parser.add_argument("--port", type=int, default=8000, help="端口（默认 8000；占用会自动换一个）")
    parser.add_argument(
        "--dir",
        default=str(Path(__file__).resolve().parent),
        help="站点根目录（默认是 happy-glass/ 目录）",
    )
    parser.add_argument("--no-open", action="store_true", help="不自动打开浏览器")
    args = parser.parse_args(argv)

    root = Path(args.dir).resolve()
    if not root.exists():
        print(f"目录不存在: {root}", file=sys.stderr)
        return 2

    os.chdir(root)

    port = _pick_port(args.host, args.port)
    httpd = ThreadingHTTPServer((args.host, port), UnityWebGLHandler)

    url = f"http://{args.host}:{port}/happy-glass/index.html"
    print(f"Serving: {root}")
    print(f"URL: {url}")
    print("按 Ctrl+C 退出")

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

