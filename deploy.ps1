#!/usr/bin/env pwsh
#Requires -Version 7.0
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Message = 'Deploy app updates',
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ExtraArguments
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$repo = 'willzjc/id-sample'
$site = 'https://willzjc.github.io/id-sample/'

function Write-Stderr([string]$Text) {
    [Console]::Error.WriteLine($Text)
}

function Stop-Precheck([string]$Text) {
    Write-Stderr $Text
    exit 1
}

function Invoke-Tool {
    param(
        [Parameter(Mandatory, Position = 0)][string]$Tool,
        [Parameter(Position = 1)][string[]]$Arguments = @()
    )
    & $Tool @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Tool $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }
}

function Get-ToolOutput {
    param(
        [Parameter(Mandatory, Position = 0)][string]$Tool,
        [Parameter(Position = 1)][string[]]$Arguments = @()
    )
    $output = & $Tool @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Tool $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }
    (@($output) -join "`n").Trim()
}

function Resolve-ComparablePath([string]$Path) {
    [System.IO.Path]::GetFullPath($Path.Trim()).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
}

try {
    Set-Location -LiteralPath $PSScriptRoot

    foreach ($tool in 'git', 'npm', 'node', 'gh') {
        if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
            Stop-Precheck "Missing required command: $tool"
        }
    }
    if ($ExtraArguments) {
        Stop-Precheck 'Usage: ./deploy.ps1 ["Commit message"]'
    }

    $top = Resolve-ComparablePath (Get-ToolOutput git @('rev-parse', '--show-toplevel'))
    $here = Resolve-ComparablePath (Get-Location).ProviderPath
    $comparison = if ($IsWindows) { 'OrdinalIgnoreCase' } else { 'Ordinal' }
    $branch = Get-ToolOutput git @('branch', '--show-current')
    if (-not $top.Equals($here, $comparison) -or $branch -ne 'main') {
        Stop-Precheck 'Run this script in the standalone id-sample repository on main.'
    }

    $origin = Get-ToolOutput git @('remote', 'get-url', 'origin')
    $allowed = @(
        'https://github.com/willzjc/id-sample',
        'https://github.com/willzjc/id-sample.git',
        'git@github.com:willzjc/id-sample.git'
    )
    if ($allowed -notcontains $origin) {
        Stop-Precheck 'origin must point to willzjc/id-sample. Nothing was published.'
    }

    Invoke-Tool gh @('auth', 'status')
    Invoke-Tool git @('fetch', 'origin')
    if ((Get-ToolOutput git @('rev-list', '--count', 'HEAD..origin/main')) -ne '0') {
        Stop-Precheck 'Local main is behind origin/main. Sync it before deploying.'
    }
    Invoke-Tool npm @('test')

    if (Get-ToolOutput git @('status', '--porcelain')) {
        Invoke-Tool git @('add', '-A', '--', '.')
        Invoke-Tool git @('commit', '-m', $Message, '-m', 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>')
    }
    if (Get-ToolOutput git @('status', '--porcelain')) {
        Stop-Precheck 'The working tree changed during the commit. Review those changes and rerun.'
    }

    Invoke-Tool git @('push', 'origin', 'main')
    $sha = Get-ToolOutput git @('rev-parse', 'HEAD')

    $run = ''
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        $run = Get-ToolOutput gh @('run', 'list', '--repo', $repo, '--workflow', 'pages-build-deployment', '--commit', $sha, '--limit', '1', '--json', 'databaseId', '--jq', '.[0].databaseId // empty')
        if ($run) { break }
        Start-Sleep -Seconds 2
    }
    if (-not $run) {
        Stop-Precheck 'Pushed successfully, but no Pages run appeared within 60 seconds. Check GitHub Actions.'
    }
    Invoke-Tool gh @('run', 'watch', $run, '--repo', $repo, '--exit-status', '--interval', '5')

    $verifier = @'
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";

const [, , site, sha] = process.argv;
const assets = ["index.html", "styles.css", "app.js", "icon.svg", "rosette.svg"];
const hash = (data) => createHash("sha256").update(data).digest("hex");
for (const file of assets) {
  const expected = hash(await readFile(file));
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(`${site}${file}?deploy=${sha}`, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
      if (hash(Buffer.from(await response.arrayBuffer())) !== expected) {
        throw new Error(`${file}: published content does not match local content`);
      }
      console.log(`${file}: verified`);
      break;
    } catch (error) {
      if (attempt === 5) throw error;
      console.warn(`${error.message}; retrying public asset verification in 5 seconds`);
      await setTimeout(5000);
    }
  }
}
'@
    $verifier | & node --input-type=module - $site $sha
    if ($LASTEXITCODE -ne 0) {
        throw "Public asset verification failed with exit code $LASTEXITCODE."
    }

    Write-Output "Deployment verified: $site`?v=$sha"
}
catch {
    Write-Stderr $_.Exception.Message
    $line = $_.InvocationInfo.ScriptLineNumber
    Write-Stderr "Deployment stopped at line $line. See the error above; no success was assumed."
    exit 1
}
