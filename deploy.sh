#!/usr/bin/env bash
set -Eeuo pipefail

trap 'printf "Deployment stopped at line %s. See the error above; no success was assumed.\n" "$LINENO" >&2' ERR

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
repo="willzjc/id-sample"
site="https://willzjc.github.io/id-sample/"

for tool in git npm node gh; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf "Missing required command: %s\n" "$tool" >&2
    exit 1
  fi
done
if [[ $# -gt 1 ]]; then
  echo 'Usage: ./deploy.sh ["Commit message"]' >&2
  exit 1
fi
if [[ "$(git rev-parse --show-toplevel)" != "$(pwd -P)" || "$(git branch --show-current)" != "main" ]]; then
  echo "Run this script in the standalone id-sample repository on main." >&2
  exit 1
fi
case "$(git remote get-url origin)" in
  https://github.com/willzjc/id-sample|https://github.com/willzjc/id-sample.git|git@github.com:willzjc/id-sample.git) ;;
  *) echo "origin must point to willzjc/id-sample. Nothing was published." >&2; exit 1 ;;
esac

gh auth status
git fetch origin
if [[ "$(git rev-list --count HEAD..origin/main)" != "0" ]]; then
  echo "Local main is behind origin/main. Sync it before deploying." >&2
  exit 1
fi
npm test

if [[ -n "$(git status --porcelain)" ]]; then
  git add -A -- .
  git commit -m "${1:-Deploy app updates}" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "The working tree changed during the commit. Review those changes and rerun." >&2
  exit 1
fi

git push origin main
sha="$(git rev-parse HEAD)"
run=""
for ((attempt = 0; attempt < 30; attempt++)); do
  run="$(gh run list --repo "$repo" --workflow pages-build-deployment --commit "$sha" --limit 1 --json databaseId --jq '.[0].databaseId // empty')"
  if [[ -n "$run" ]]; then break; fi
  sleep 2
done
if [[ -z "$run" ]]; then
  echo "Pushed successfully, but no Pages run appeared within 60 seconds. Check GitHub Actions." >&2
  exit 1
fi
gh run watch "$run" --repo "$repo" --exit-status --interval 5

node --input-type=module - "$site" "$sha" <<'NODE'
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";

const [, , site, sha] = process.argv;
const assets = ["index.html", "styles.css", "app.js", "icon.svg", "rosette.svg"];
const hash = (data) => createHash("sha256").update(data).digest("hex");
for (const file of assets) {
  const expected = hash(execFileSync("git", ["show", `${sha}:${file}`]));
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(`${site}${file}?deploy=${sha}`, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
      if (hash(Buffer.from(await response.arrayBuffer())) !== expected) {
        throw new Error(`${file}: published content does not match committed content`);
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
NODE
printf "Deployment verified: %s?v=%s\n" "$site" "$sha"
