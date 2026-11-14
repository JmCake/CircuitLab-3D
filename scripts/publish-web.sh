#!/usr/bin/env bash
set -euo pipefail

# Only publish a checked main commit; a slower, older CI run must not replace a newer version.
if [[ "$(gh api "repos/$GITHUB_REPOSITORY/git/ref/heads/main" --jq '.object.sha')" != "$GITHUB_SHA" ]]; then
  echo '::notice::A newer main commit exists; this deployment is superseded.'
  exit 0
fi
: "${PAGES_DEPLOY_KEY:?The web publishing deploy key is missing}"

key_path="$RUNNER_TEMP/circuitlab-web-deploy-key"
known_hosts="$RUNNER_TEMP/circuitlab-web-known-hosts"
publish_dir="$RUNNER_TEMP/circuitlab-web-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
trap 'rm -f "$key_path" "$known_hosts"' EXIT
umask 077
printf '%s\n' "$PAGES_DEPLOY_KEY" > "$key_path"
unset PAGES_DEPLOY_KEY

# Fetch GitHub's published SSH host keys over verified HTTPS instead of trusting an SSH scan.
node --input-type=module <<'NODE'
import fs from 'node:fs/promises';
const response = await fetch('https://api.github.com/meta', { headers: { Authorization: `Bearer ${process.env.GH_TOKEN}` } });
if (!response.ok) throw new Error(`GitHub host key lookup failed: ${response.status}`);
const { ssh_keys } = await response.json();
if (!Array.isArray(ssh_keys) || !ssh_keys.length) throw new Error('No GitHub SSH host keys');
await fs.writeFile(`${process.env.RUNNER_TEMP}/circuitlab-web-known-hosts`, ssh_keys.map(key => `github.com ${key}`).join('\n') + '\n');
NODE

export GIT_SSH_COMMAND="ssh -i \"$key_path\" -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=\"$known_hosts\""
git clone --quiet --depth=1 git@github.com:JmCake/CircuitLab-3D-Web.git "$publish_dir"
rsync --archive --delete --exclude='.git/' dist-web/ "$publish_dir/"
git -C "$publish_dir" config user.name 'github-actions[bot]'
git -C "$publish_dir" config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git -C "$publish_dir" add --all
if git -C "$publish_dir" diff --cached --quiet; then
  echo 'Public files already match this build.'
  exit 0
fi
git -C "$publish_dir" commit --quiet -m "deploy: CircuitLab-3D ${GITHUB_SHA:0:7}"
git -C "$publish_dir" push origin HEAD:main
echo 'Published compiled files to https://jmcake.github.io/CircuitLab-3D-Web/'
