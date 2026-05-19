#!/usr/bin/env node
/**
 * Resolve python3 or python (3.x) and run the given args.
 * Override with env PYTHON=/path/to/python if needed.
 */
import { spawnSync } from "node:child_process";

function isPython3(cmd) {
  const r = spawnSync(
    cmd,
    ["-c", "import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)"],
    { encoding: "utf8" }
  );
  return r.status === 0;
}

function resolvePython() {
  const override = process.env.PYTHON?.trim();
  if (override) {
    if (!isPython3(override)) {
      console.error(`PYTHON=${override} is not Python 3.8+`);
      process.exit(1);
    }
    return override;
  }
  for (const cmd of ["python3", "python"]) {
    if (isPython3(cmd)) return cmd;
  }
  console.error(
    "Python 3.8+ not found. Install python3 or set PYTHON=/path/to/python"
  );
  process.exit(1);
}

const py = resolvePython();
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/run-python.mjs <script-or-module-args...>");
  process.exit(1);
}

const result = spawnSync(py, args, { stdio: "inherit" });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
