#!/bin/bash
set -e

# Copy plugins from host mount (if available)
if [ -d "/host-plugins" ] && [ "$(ls -A /host-plugins 2>/dev/null)" ]; then
    mkdir -p /home/agent/.claude/plugins
    cp -r /host-plugins/* /home/agent/.claude/plugins/
fi

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
fi

exec "$@"
