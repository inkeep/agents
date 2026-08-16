#!/bin/bash
set -e

# Enable weaker nested sandbox for Docker environment.
# Claude Code's bubblewrap sandbox cannot run in unprivileged Docker containers.
# Our security boundary is the Docker container + Squid proxy network jail.
SETTINGS_FILE="/home/agent/.claude/settings.json"
if [ ! -f "$SETTINGS_FILE" ]; then
    echo '{}' > "$SETTINGS_FILE"
fi
if command -v jq &>/dev/null; then
    tmp=$(jq '.sandbox.enableWeakerNestedSandbox = true' "$SETTINGS_FILE")
    echo "$tmp" > "$SETTINGS_FILE"

    # Enable plugins discovered in the seed directory.
    # CLAUDE_CODE_PLUGIN_SEED_DIR handles path resolution at runtime, but
    # enabledPlugins must still be set in settings.json for Claude Code to
    # actually load them. (Known issue: https://github.com/anthropics/claude-code/issues/20661)
    if [ -d "${CLAUDE_CODE_PLUGIN_SEED_DIR:-}" ]; then
        INSTALLED_FILE="${CLAUDE_CODE_PLUGIN_SEED_DIR}/installed_plugins.json"
        if [ -f "$INSTALLED_FILE" ]; then
            for key in $(jq -r '.plugins | keys[]' "$INSTALLED_FILE" 2>/dev/null); do
                tmp=$(jq --arg k "$key" '.enabledPlugins[$k] = true' "$SETTINGS_FILE")
                echo "$tmp" > "$SETTINGS_FILE"
            done
        fi
    fi
fi

# Git config — run from HOME to avoid issues when /workspace is a git worktree
# whose .git file references a host path that doesn't exist in the container.
(
    cd /home/agent

    # safe.directory — bind-mounted /workspace has different ownership than
    # the container's agent user. Without this, git refuses to operate.
    git config --global --add safe.directory /workspace

    # Git credential helper — enables git push from inside the container using
    # GITHUB_TOKEN env var.
    if [ -n "${GITHUB_TOKEN:-}" ]; then
        git config --global credential.helper '!f() { echo "username=x-access-token"; echo "password=$GITHUB_TOKEN"; }; f'
        git config --global url."https://github.com/".insteadOf "git@github.com:"
    fi
)

exec "$@"
