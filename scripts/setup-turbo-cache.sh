#!/bin/bash
# Setup Turbo Remote Caching
#
# This script configures turbo remote caching via Vercel.
# Remote caching dramatically speeds up builds by sharing cache across:
#   - Your local machine (subsequent runs)
#   - CI/CD pipelines
#   - Team members
#
# Prerequisites:
#   - A Vercel account (free tier works)
#   - Access to the team's Vercel organization (for shared caching)

set -e

echo "🚀 Setting up Turbo Remote Caching"
echo ""

# Check if already configured
if [ -n "$TURBO_TOKEN" ] && [ -n "$TURBO_TEAM" ]; then
  echo "✅ Remote caching already configured!"
  echo "   Team: $TURBO_TEAM"
  echo ""
  echo "To reconfigure, unset TURBO_TOKEN and TURBO_TEAM and run again."
  exit 0
fi

echo "This will:"
echo "  1. Log you into Vercel (opens browser)"
echo "  2. Link this repo to your Vercel team"
echo "  3. Enable remote caching for all turbo commands"
echo ""
echo "Benefits:"
echo "  - Pre-push hooks run in ~1-2s when cache is warm"
echo "  - CI builds are faster when code hasn't changed"
echo "  - Team members share build cache"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Cancelled."
  exit 0
fi

echo ""
echo "Step 1: Logging into Vercel..."
pnpm turbo login

echo ""
echo "Step 2: Linking to Vercel team..."
pnpm turbo link

echo ""
echo "✅ Remote caching is now configured!"
echo ""
echo "The following environment variables are now set in your turbo config:"
echo "  - TURBO_TOKEN: Your personal access token"
echo "  - TURBO_TEAM: Your team identifier"
echo ""
echo "For CI/CD, add these as secrets:"
echo "  TURBO_TOKEN: (get from 'turbo login' or Vercel dashboard)"
echo "  TURBO_TEAM: (your team slug, e.g., 'team_xxxxx')"
echo ""
echo "To verify caching is working:"
echo "  1. Run: pnpm check:husky"
echo "  2. Run again: pnpm check:husky"
echo "  3. Second run should show 'FULL TURBO' and complete in ~1-2s"
