import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const skip = process.platform === "win32" ? "deploy.sh needs a POSIX shell; see deploy.ps1.test.mjs" : false;

const script = readFileSync(new URL("../deploy.sh", import.meta.url), "utf8");
const stub = `#!/usr/bin/env bash
set -eu
tool="$(basename "$0")"
printf '%s %s\\n' "$tool" "$*" >> "$TEST_ROOT/commands"
case "$tool $1" in
  "git rev-parse")
    case "$2" in
      --show-toplevel) printf '%s\\n' "$TEST_ROOT" ;;
      HEAD) echo abc123 ;;
    esac ;;
  "git branch") echo "\${TEST_BRANCH:-main}" ;;
  "git remote") echo "\${TEST_REMOTE:-https://github.com/willzjc/id-sample.git}" ;;
  "git rev-list") echo "\${TEST_BEHIND:-0}" ;;
  "git status")
    if [[ "\${TEST_DIRTY:-1}" == 1 && ! -f "$TEST_ROOT/committed" ]]; then echo " M app.js"; fi
    if [[ "\${TEST_HOOK_DIRTY:-0}" == 1 && -f "$TEST_ROOT/committed" ]]; then echo " M app.js"; fi ;;
  "git commit") touch "$TEST_ROOT/committed" ;;
  "git push") exit "\${TEST_PUSH_EXIT:-0}" ;;
  "npm test") exit "\${TEST_TEST_EXIT:-0}" ;;
  "gh auth") exit "\${TEST_AUTH_EXIT:-0}" ;;
  "gh run")
    if [[ "$2" == list ]]; then echo 12345; else exit "\${TEST_BUILD_EXIT:-0}"; fi ;;
  "node --input-type=module") cat >/dev/null; exit "\${TEST_VERIFY_EXIT:-0}" ;;
esac
`;

function deploy(options = {}, args = []) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "id-sample-deploy-")));
  try {
    const bin = join(root, "bin");
    mkdirSync(bin);
    writeFileSync(join(root, "deploy.sh"), script);
    for (const tool of ["git", "npm", "node", "gh"]) {
      writeFileSync(join(bin, tool), stub, { mode: 0o755 });
    }
    const result = spawnSync("bash", [join(root, "deploy.sh"), ...args], {
      cwd: tmpdir(),
      encoding: "utf8",
      timeout: 10000,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TEST_ROOT: root, ...options }
    });
    assert.equal(result.error, undefined);
    const commands = readFileSync(join(root, "commands"), "utf8");
    return { ...result, commands };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("deploy script commits all app edits without prompting, preserves hooks and verifies Pages before success", { skip }, () => {
  const result = deploy({}, ["Update card styling"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.commands, /git add -A -- \./);
  assert.match(result.commands, /git commit -m Update card styling -m Co-authored-by: Copilot/);
  const expectedOrder = ["npm test", "git add", "git commit", "git push origin main", "gh run watch", "node --input-type=module"];
  let previous = -1;
  for (const command of expectedOrder) {
    const position = result.commands.indexOf(command);
    assert.ok(position > previous, `${command} runs in the required order`);
    previous = position;
  }
  assert.doesNotMatch(result.commands, /--force|--no-verify|rebase/);
  assert.match(result.stdout, /Deployment verified: https:\/\/willzjc.github.io\/id-sample\/\?v=abc123/);
});

test("deploy script also verifies committed changes without creating an empty commit", { skip }, () => {
  const result = deploy({ TEST_DIRTY: "0" });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.commands, /git add|git commit/);
  assert.match(result.commands, /git push origin main/);
  assert.match(result.commands, /gh run watch/);
});

test("deploy stops before testing or committing on the wrong branch, wrong origin or a newer upstream", { skip }, () => {
  for (const options of [
    { TEST_BRANCH: "topic" },
    { TEST_REMOTE: "https://github.com/willzjc/cv.git" },
    { TEST_BEHIND: "1" },
    { TEST_AUTH_EXIT: "1" }
  ]) {
    const result = deploy(options);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.commands, /npm test|git add|git commit|git push/);
    assert.doesNotMatch(result.stdout, /Deployment verified/);
  }
});

test("failed tests prevent any staging, commits or pushes", { skip }, () => {
  const result = deploy({ TEST_TEST_EXIT: "1" });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.commands, /git add|git commit|git push/);
  assert.match(result.stderr, /Deployment stopped/);
});

test("hook-generated changes prevent publishing a success-shaped partial commit", { skip }, () => {
  const result = deploy({ TEST_HOOK_DIRTY: "1" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /working tree changed/);
  assert.doesNotMatch(result.commands, /git push/);
});

test("failed pushes, Pages builds and public asset verification never report success", { skip }, () => {
  for (const options of [{ TEST_PUSH_EXIT: "1" }, { TEST_BUILD_EXIT: "1" }, { TEST_VERIFY_EXIT: "1" }]) {
    const result = deploy(options);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout, /Deployment verified/);
    assert.match(result.stderr, /Deployment stopped/);
  }
});
