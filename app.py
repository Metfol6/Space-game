import os
import subprocess
import sys

if __name__ == "__main__":
    port = os.environ.get("PORT", "3000")
    print(f"[BOOT] Starting Node.js 22 server on port {port}...")
    sys.exit(subprocess.call(["node", "server.js"]))
