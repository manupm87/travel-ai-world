#!/usr/bin/env bash
# Runs once, after the devcontainer is created (see devcontainer.json).
set -euo pipefail
cd /workspace

# Named volumes are created root-owned; hand them to the workspace user.
sudo chown -R "$(id -u):$(id -g)" src/backend/.venv src/frontend/node_modules src/frontend/.next \
  /commandhistory "$HOME/.claude" "$HOME/.codex" "$HOME/.gemini" "$HOME/.copilot" "$HOME/.aws"

# AWS SSO profile (no secrets: account id, role name and start URL). Fill it in once;
# it lives in the aws_config volume, so it survives rebuilds.
if [ ! -f "$HOME/.aws/config" ]; then
  cp .devcontainer/aws-config.example "$HOME/.aws/config"
fi

# .env files from templates, uv sync (into the venv volume), npm install (into the node_modules volume).
just setup

# Chromium for `just test-e2e` (system deps need sudo, which the base image grants).
(cd src/frontend && npx playwright install --with-deps chromium)

echo
echo "Devcontainer ready. Fill in SECRET_KEY (same in both backend .env files), GOOGLE_* and NVIDIA_API_KEY, then:"
echo "  just dev-core   # :8000"
echo "  just dev-ai     # :8001"
echo "  just dev-frontend  # :3000"
echo "AWS: edit ~/.aws/config (account id, role, start URL), then \`just aws-login\`."
