#!/usr/bin/env bash
# Runs the end-to-end suite twice: once through the built standalone CLI, then
# again through the latest sdkck host CLI with this build packed and installed
# as its @hesed/search plugin — alongside the other @hesed plugins, so the
# search surface is the real, installed one rather than this plugin's own
# three commands.
#
#   npm run test:e2e                            # everything, local plugin builds
#   E2E_PLUGINS="jira bb" npm run test:e2e      # a subset of extra plugins
#   E2E_PLUGIN_SOURCE=npm npm run test:e2e      # @hesed/<name>@latest from npm
#   npm run test:e2e -- --grep search           # extra args go through to mocha
#   npm run test:e2e -- --keep                  # leave the throwaway home behind
#
# Installing a plugin only drops its tarball into the throwaway home; the
# search plugin never invokes other plugins' commands, it only indexes their
# metadata — so unlike the host suite in the sdkck repo this needs no sandbox
# credentials and no Docker on either leg.
#
# Plugin sources (E2E_PLUGIN_SOURCE):
#   local (default) — build and npm pack the sibling repos (../jira, ../bb,
#     …; override the parent dir with E2E_PLUGIN_ROOT) and install the
#     tarballs: what a developer iterating across repos wants.
#   npm — install @hesed/<name>@latest straight from the registry: what CI
#     runs, proving the host against the published releases users get.
set -euo pipefail

cd "$(dirname "$0")/.."
REPO_ROOT="$PWD"

ALL_PLUGINS="jira conni bb sentry trello mysql psql api2cli"
if [ -n "${E2E_PLUGINS:-}" ]; then
  SELECTED="$E2E_PLUGINS"
else
  SELECTED="$ALL_PLUGINS"
fi

E2E_PLUGIN_SOURCE="${E2E_PLUGIN_SOURCE:-local}"
if [ "$E2E_PLUGIN_SOURCE" != "local" ] && [ "$E2E_PLUGIN_SOURCE" != "npm" ]; then
  echo "error: E2E_PLUGIN_SOURCE must be 'local' or 'npm', got '$E2E_PLUGIN_SOURCE'" >&2
  exit 1
fi

# Where the sibling plugin repos live (local source only); override when they
# are checked out elsewhere.
E2E_PLUGIN_ROOT="${E2E_PLUGIN_ROOT:-$(cd "$REPO_ROOT/.." && pwd)}"

KEEP=0
MOCHA_ARGS=()
USER_GREP=0

for arg in "$@"; do
  case "$arg" in
    --keep) KEEP=1 ;;
    --grep|-g) USER_GREP=1; MOCHA_ARGS+=("$arg") ;;
    *) MOCHA_ARGS+=("$arg") ;;
  esac
done

# Deliberately NOT named SDKCK_HOME: an inherited SDKCK_HOME could point at
# the developer's real sdkck setup, and the EXIT trap must never rm -rf that.
# This variable only ever holds a path this script itself mktemp'd.
SDKCK_E2E_HOME=""

cleanup() {
  local status=$?

  # npm pack's prepack (`oclif readme`) rewrites the tracked README.md with
  # the current machine's usage string. Restore the backup taken before
  # packing — an e2e run must never dirty this repo's worktree or clobber
  # uncommitted README edits. The sibling repos' backups are restored below.
  if [ -f "$REPO_ROOT/README.md.e2e-bak" ]; then
    mv "$REPO_ROOT/README.md.e2e-bak" "$REPO_ROOT/README.md"
  fi

  if [ "$E2E_PLUGIN_SOURCE" = "local" ]; then
    for plugin in $ALL_PLUGINS; do
      if [ -f "$E2E_PLUGIN_ROOT/$plugin/README.md.e2e-bak" ]; then
        mv "$E2E_PLUGIN_ROOT/$plugin/README.md.e2e-bak" "$E2E_PLUGIN_ROOT/$plugin/README.md"
      fi
    done
  fi

  if [ "$KEEP" -ne 0 ]; then
    echo "==> Leaving the throwaway home in place (--keep): $SDKCK_E2E_HOME"
    exit "$status"
  fi

  if [ -n "$SDKCK_E2E_HOME" ]; then
    rm -rf "$SDKCK_E2E_HOME"
  fi

  exit "$status"
}
trap cleanup EXIT

run_mocha() {
  # Delegates to the `e2e:mocha` script rather than calling mocha directly, so
  # both legs share one glob and one timeout.
  # The +expansion guard keeps `set -u` happy with an empty array on bash 3.2.
  npm run --silent e2e:mocha -- ${MOCHA_ARGS[@]+"${MOCHA_ARGS[@]}"}
}

echo "==> Building the CLI"
npm run --silent build

echo "==> Leg 1: end-to-end tests through the standalone CLI"
run_mocha

echo "==> Downloading the latest sdkck"
# --no-save resolves "latest" from the registry on every run without touching
# package.json; the binary comes from node_modules/.bin.
npm install --no-save sdkck
export PATH="$REPO_ROOT/node_modules/.bin:$PATH"

# A throwaway sdkck home keeps the plugin installs, their config and their
# caches out of the developer's real sdkck setup; the test side finds it via
# E2E_SDKCK_HOME.
SDKCK_E2E_HOME="$(mktemp -d)"
export E2E_SDKCK_HOME="$SDKCK_E2E_HOME"

# Installs an install spec — a `file:` URL to a packed tarball (local source)
# or an npm spec like `@hesed/jira@latest` — into the throwaway home. Every
# install happens before any `sdkck search` call: the freshly installed plugin
# must be what the host dispatches, and sdkck's first-use auto-installer would
# otherwise fetch published releases over the builds under test.
install_plugin() {
  local spec="$1"
  local name="$2"

  echo "==> Installing $name into the throwaway home"
  # A tarball must be passed as a `file:` URL: sdkck resolves any bare path
  # containing a slash as a GitHub org/repo.
  SDKCK_CACHE_DIR="$SDKCK_E2E_HOME/cache" \
  SDKCK_CONFIG_DIR="$SDKCK_E2E_HOME/config" \
  SDKCK_DATA_DIR="$SDKCK_E2E_HOME/data" \
    sdkck plugins install "$spec" >/dev/null
}

# This build first, so the host's `search`/`synonyms` commands come from the
# build under test, not the release sdkck bundles. Packing runs prepack,
# regenerating oclif.manifest.json and the README — the same artifacts the
# publish workflow ships — so the host leg exercises the real install
# artifact. The README backup is restored in the EXIT trap.
cp "$REPO_ROOT/README.md" "$REPO_ROOT/README.md.e2e-bak"
echo "==> Packing the current build"
TGZ="$(npm pack --pack-destination "$SDKCK_E2E_HOME" | tail -n 1)"
install_plugin "file:$SDKCK_E2E_HOME/$TGZ" "@hesed/search (this build)"

# `oclif readme` inside each sibling's prepack rewrites its tracked README.md,
# so back it up and restore it after packing. The backup lives next to the
# README (not in the throwaway home) so the EXIT trap can restore it even when
# packing itself fails partway through. Only the tarball path is written to
# stdout — the caller captures it with command substitution, so progress goes
# to stderr.
pack_plugin() {
  local dir="$1"
  local name
  name="$(basename "$dir")"

  echo "==> Building and packing $name" >&2
  if [ ! -d "$dir/node_modules" ]; then
    (cd "$dir" && npm ci --silent 1>&2)
  fi

  (cd "$dir" && npm run --silent build 1>&2)

  cp "$dir/README.md" "$dir/README.md.e2e-bak"
  local tgz
  tgz="$(cd "$dir" && npm pack --pack-destination "$SDKCK_E2E_HOME" | tail -n 1)"
  mv "$dir/README.md.e2e-bak" "$dir/README.md"

  echo "$SDKCK_E2E_HOME/$tgz"
}

for plugin in $SELECTED; do
  if [ "$E2E_PLUGIN_SOURCE" = "npm" ]; then
    install_plugin "@hesed/$plugin@latest" "@hesed/$plugin@latest"
    continue
  fi

  dir="$E2E_PLUGIN_ROOT/$plugin"
  if [ ! -d "$dir" ]; then
    echo "error: plugin repo not found: $dir (set E2E_PLUGIN_ROOT, or use E2E_PLUGIN_SOURCE=npm)" >&2
    exit 1
  fi

  tgz="$(pack_plugin "$dir")"
  install_plugin "file:$tgz" "@hesed/$plugin (local $dir)"
done

export E2E_SDKCK_PLUGINS="$SELECTED"

# A plugin subset selects the matching describe blocks (`e2e: <topic> plugin
# via sdkck`), so unselected plugin suites never run. An explicit --grep from
# the caller wins. Leg 1 ignores the subset: its host has no plugins at all,
# and the host-agnostic suites are always worth running.
if [ "$USER_GREP" -eq 0 ] && [ "$SELECTED" != "$ALL_PLUGINS" ]; then
  labels=""
  for plugin in $SELECTED; do
    case "$plugin" in
      api2cli) topic="api" ;;
      *) topic="$plugin" ;;
    esac
    if [ -n "$labels" ]; then
      labels="$labels|$topic"
    else
      labels="$topic"
    fi
  done
  MOCHA_ARGS+=(--grep "e2e: ($labels) plugin via sdkck")
fi

echo "==> Leg 2: end-to-end tests through the sdkck host CLI"
E2E_HOST_CLI=sdkck run_mocha
