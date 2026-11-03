"""
Native PC Desktop Launcher for filing-diff (Windows / macOS / Linux).

Launches the filing-diff interface inside a standalone native OS desktop window
using `pywebview` (WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux)
without opening an external web browser.

Usage:
    python -m src.desktop

Build standalone PC executable (.exe / .app):
    pyinstaller --noconfirm --onedir --windowed --name "FilingDiff" src/desktop.py
"""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
from pathlib import Path


def find_free_port(default_port: int = 8501) -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        if s.connect_ex(("127.0.0.1", default_port)) != 0:
            return default_port
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def wait_for_server(host: str, port: int, timeout_sec: float = 15.0) -> bool:
    deadline = time.monotonic() + timeout_sec
    while time.monotonic() < deadline:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(0.5)
            if sock.connect_ex((host, port)) == 0:
                return True
        time.sleep(0.2)
    return False


def launch_desktop_app() -> None:
    root_dir = Path(__file__).resolve().parent.parent
    app_script = root_dir / "src" / "app.py"
    port = find_free_port(8501)

    env = os.environ.copy()
    env["BROWSER"] = "none"

    cmd = [
        sys.executable,
        "-m",
        "streamlit",
        "run",
        str(app_script),
        "--server.headless=true",
        f"--server.port={port}",
        "--server.address=127.0.0.1",
        "--global.developmentMode=false",
    ]

    proc = subprocess.Popen(
        cmd,
        cwd=str(root_dir),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    try:
        if not wait_for_server("127.0.0.1", port, timeout_sec=20.0):
            raise RuntimeError("Local filing-diff server did not start within 20 seconds.")

        url = f"http://127.0.0.1:{port}"
        try:
            import webview  # pywebview

            webview.create_window(
                title="filing-diff — SEC 10-K/10-Q Semantic Diff & Risk Analyzer",
                url=url,
                width=1440,
                height=900,
                min_size=(1024, 680),
                text_select=True,
            )
            webview.start()
        except ImportError:
            import webbrowser

            print(f"pywebview not installed; opening desktop interface at {url}")
            webbrowser.open(url)
            proc.wait()
    finally:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()


if __name__ == "__main__":
    launch_desktop_app()
