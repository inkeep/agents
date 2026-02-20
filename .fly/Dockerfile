# Minimal sidecar image for Fly.io multi-container Machines.
#
# agents-api runs on Vercel, NOT on Fly. This sidecar exists only because
# `fly deploy` requires a Dockerfile to build. The real workload is the
# DB containers (doltgres, postgres, spicedb) defined in machine-config.json.
#
# Decision D20: Keep sidecar minimal — no agents-api build needed.

FROM alpine:3.21
CMD ["sleep", "infinity"]
