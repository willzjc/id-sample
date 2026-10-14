import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const pwsh = spawnSync("pwsh", ["-NoProfile", "-Command", "exit 0"], { encoding: "utf8" }).status === 0;
const skip = pwsh ? false : "PowerShell 7 (pwsh) is not installed";

const script = readFileSync(new URL("../deploy.ps1", import.meta.url), "utf8");
const stub = `#!/usr/bin/env pwsh
$ErrorActionPreference = 'Stop'
$tool = [System.IO.Path]::GetFileNameWithoutExtension($PSCommandPath)
$root = $env:TEST_ROOT
$committed = Join-Path $root 'committed'
Add-Content -LiteralPath (Join-Path $root 'commands') -Value ("$tool " + ($args -join ' '))
function Val([string]$name, [string]$fallback) {
  $current = [System.Environment]::GetEnvironmentVariable($name)
  if ([string]::IsNullOrEmpty($current)) { $fallback } else { $current }
}
switch ("$tool $($args[0])") {
  'git rev-parse' {
    if ($args[1] -eq '--show-toplevel') { Write-Output $root } else { Write-Output 'abc123' }
  }
  'git branch' { Write-Output (Val 'TEST_BRANCH' 'main') }
  'git remote' { Write-Output (Val 'TEST_REMOTE' 'https://github.com/willzjc/id-sample.git') }
  'git rev-list' { Write-Output (Val 'TEST_BEHIND' '0') }
  'git status' {
    if ((Val 'TEST_DIRTY' '1') -eq '1' -and -not (Test-Path -LiteralPath $committed)) { Write-Output ' M app.js' }
    if ((Val 'TEST_HOOK_DIRTY' '0') -eq '1' -and (Test-Path -LiteralPath $committed)) { Write-Output ' M app.js' }
  }
  'git commit' { New-Item -ItemType File -Path $committed -Force | Out-Null }
  'git push' { exit [int](Val 'TEST_PUSH_EXIT' '0') }
  'npm test' { exit [int](Val 'TEST_TEST_EXIT' '0') }
  'gh auth' { exit [int](Val 'TEST_AUTH_EXIT' '0') }
  'gh run' {
    if ($args[1] -eq 'list') { Write-Output '12345' } else { exit [int](Val 'TEST_BUILD_EXIT' '0') }
  }
  'node --input-type=module' {
    $input | Out-Null
    exit [int](Val 'TEST_VERIFY_EXIT' '0')
  }
}
exit 0
`;

function deploy(options = {}, args = []) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "id-sample-deploy-ps-")));
  try {
    const bin = join(root, "bin");
    mkdirSync(bin);
    writeFileSync(join(root, "deploy.ps1"), script);
    for (const tool of ["git", "npm", "node", "gh"]) {
      writeFileSync(join(bin, `${tool}.ps1`), stub);
    }
    const result = spawnSync(
      "pwsh",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(root, "deploy.ps1"), ...args],
      {
        cwd: tmpdir(),
        encoding: "utf8",
        timeout: 60000,
        env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}`, TEST_ROOT: root, ...options }
      }
    );
    assert.equal(result.error, undefined);
    const log = join(root, "commands");
    const commands = existsSync(log) ? readFileSync(log, "utf8") : "";
    return { ...result, commands };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("Windows deploy script commits all app edits without prompting, preserves hooks and verifies Pages before success", { skip }, () => {
  const result = deploy({}, ["Update card styling"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(script, /execFileSync\("git", \["show"/);
  assert.doesNotMatch(script, /hash\(await readFile\(file\)\)/);
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

test("Windows deploy script also verifies committed changes without creating an empty commit", { skip }, () => {
  const result = deploy({ TEST_DIRTY: "0" });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.commands, /git add|git commit/);
  assert.match(result.commands, /git push origin main/);
  assert.match(result.commands, /gh run watch/);
});

test("Windows deploy stops before testing or committing on the wrong branch, wrong origin or a newer upstream", { skip }, () => {
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

test("Windows deploy stops when extra arguments are passed", { skip }, () => {
  const result = deploy({}, ["First message", "Second message"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Usage: \.\/deploy\.ps1/);
  assert.doesNotMatch(result.commands, /npm test|git add|git commit|git push/);
});

test("Windows deploy: failed tests prevent any staging, commits or pushes", { skip }, () => {
  const result = deploy({ TEST_TEST_EXIT: "1" });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.commands, /git add|git commit|git push/);
  assert.match(result.stderr, /Deployment stopped/);
});

test("Windows deploy: hook-generated changes prevent publishing a success-shaped partial commit", { skip }, () => {
  const result = deploy({ TEST_HOOK_DIRTY: "1" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /working tree changed/);
  assert.doesNotMatch(result.commands, /git push/);
});

test("Windows deploy: failed pushes, Pages builds and public asset verification never report success", { skip }, () => {
  for (const options of [{ TEST_PUSH_EXIT: "1" }, { TEST_BUILD_EXIT: "1" }, { TEST_VERIFY_EXIT: "1" }]) {
    const result = deploy(options);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout, /Deployment verified/);
    assert.match(result.stderr, /Deployment stopped/);
  }
});
