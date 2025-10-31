# Inkeep Agent Framework Template 

An Inkeep Agent Framework project with multi-service architecture.

## Quick Start

[Follow these steps in the docs to get started](https://docs.inkeep.com/get-started/quick-start) with the `npx @inkeep/create-agents` CLI command.

## Architecture

This project follows a workspace structure with the following services:
- **Agents Manage UI** (Port 3000): Web interface
  - The agent framework visual builder. From the builder you can create, manage and visualize all your graphs.
- **Agents Manage API** (Port 3002): Agent configuration and management
  - Handles entity management and configuration endpoints.
- **Agents Run API** (Port 3003): Agent execution and chat processing  
  - Handles agent communication. You can interact with your agents either over MCP from an MCP client or through our React UI components library

## Deployment Guides

To build and run your own images you can follow the [Build a Custom Image](https://docs.inkeep.com/self-hosting/docker-build) docs.

This repostory contains a `docker-compose.yml` and template `Dockerfile` for each service:
- `Dockerfile.manage-ui`
- `Dockerfile.manage-api`
- `Dockerfile.run-ui`
- `Dockerfile.migrate`

To build and run:
```bash
docker compose build
docker compose up -d
```

### Deploy using official prebuilt images
- [Deploy to Vercel](https://docs.inkeep.com/self-hosting/vercel)
- [Docker (Local Dev)](https://docs.inkeep.com/self-hosting/docker-local)
- [GCP Compute Engine](https://docs.inkeep.com/self-hosting/gcp-compute-engine)
- [GCP Cloud Run](https://docs.inkeep.com/self-hosting/gcp-cloud-run)
- [AWS EC2](https://docs.inkeep.com/self-hosting/aws-ec2)
- [Hetzner](https://docs.inkeep.com/self-hosting/hetzner)

---

## Automated Dependency Updates

This template uses **Renovate Bot** to automatically create PRs when new @inkeep packages are published.

