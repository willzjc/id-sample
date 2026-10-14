#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const windows = process.platform === "win32";
const command = windows ? "pwsh" : "bash";
const prefix = windows
  ? ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(root, "deploy.ps1")]
  : [join(root, "deploy.sh")];

const result = spawnSync(command, [...prefix, ...args], { stdio: "inherit", cwd: root });
if (result.error) {
  const hint = windows
    ? "Install PowerShell 7 (winget install Microsoft.PowerShell) or run ./deploy.ps1 directly."
    : "Install bash or run ./deploy.sh directly.";
  console.error(`Could not start ${command}: ${result.error.message}. ${hint}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
