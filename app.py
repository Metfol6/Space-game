import os
import subprocess
import sys

if __name__ == "__main__":
    port = os.environ.get("PORT", "3000")
    print(f"[BOOT] Starting Node.js 22 server on port {port} with --experimental-sqlite...")
    env = os.environ.copy()
    env["NODE_OPTIONS"] = "--experimental-sqlite " + env.get("NODE_OPTIONS", "")
    sys.exit(subprocess.call(["node", "--experimental-sqlite", "server.js"], env=env))
