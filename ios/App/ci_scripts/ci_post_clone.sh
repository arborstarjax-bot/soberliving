#!/bin/sh
# CI post-clone hook (.github/workflows/ios-testflight.yml calls it; Xcode Cloud
# also picks it up automatically if that path is ever used).
# Installs the npm deps the CapApp-SPM package points at, generates the Capacitor
# iOS artifacts (public/, capacitor.config.json, Package.swift) and stamps the
# build number so every TestFlight upload is unique.
set -eu

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$REPO_ROOT"

if ! command -v node >/dev/null 2>&1; then
  brew install node@22
  export PATH="$(brew --prefix node@22)/bin:$PATH"
fi
node -v
npm -v

npm ci --no-audit --no-fund

# The shell loads https://soberliving.vercel.app at runtime, so the bundled web
# dir only needs a placeholder for Capacitor to copy.
mkdir -p public
[ -f public/index.html ] || printf '<!doctype html><title>HouseFlow</title>\n' > public/index.html

npx cap sync ios

if [ -n "${CI_BUILD_NUMBER:-}" ]; then
  sed -i '' "s/CURRENT_PROJECT_VERSION = [0-9][0-9]*;/CURRENT_PROJECT_VERSION = ${CI_BUILD_NUMBER};/g" \
    ios/App/App.xcodeproj/project.pbxproj
  echo "Build number set to ${CI_BUILD_NUMBER}"
fi
