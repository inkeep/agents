# Agents.md

This document provides machine-readable instructions for AI agents to interact with the Inkeep Agents project.

## Project Overview

Inkeep Agents is a multi-agent framework that enables multiple specialized AI agents to collaborate and solve complex problems through a graph-based architecture. It provides two ways to build agents:

1.  **Visual Builder:** A no-code interface for designing and managing agent workflows.
2.  **TypeScript SDK:** A code-first approach for building and managing agent workflows.

The project is a TypeScript monorepo managed with `pnpm` and `turbo`.

### Key Technologies

*   **TypeScript:** The primary programming language.
*   **Node.js:** The runtime environment.
*   **pnpm:** The package manager.
*   **turbo:** The monorepo build system.
*   **React:** Used in the `agents-manage-ui` and `agents-ui` packages.
*   **Next.js:** Used in the `agents-docs` and `agents-manage-ui` packages.
*   **Vite:** Used in the `agents-manage-api`, `agents-run-api`, and `agents-ui` packages.
*   **Vitest:** The testing framework.
*   **Biome:** The code formatter and linter.
*   **Drizzle:** The ORM for the `agents-core` package.

### Project Structure

The project is a monorepo with the following packages:

*   `agents-cli`: A command-line interface for interacting with the agent framework.
*   `agents-docs`: The documentation website.
*   `agents-manage-api`: The API for managing agents.
*   `agents-manage-ui`: The UI for the visual builder.
*   `agents-run-api`: The API for running agents.
*   `agents-ui`: The UI for the chat widget.
*   `examples`: Example agent graphs.
*   `packages/agents-core`: Core functionality of the agent framework.
*   `packages/agents-sdk`: The TypeScript SDK for building agents.
*   `packages/create-agents`: A CLI to create new agent projects.

## Building and Running

### Installation

Install the dependencies:

```bash
pnpm install
```

### Database Setup

Run database migrations:

```bash
pnpm db:migrate
```

### Running the Development Server

At the root directory:

```bash
pnpm dev
```

### Running the test suite

```bash
pnpm test
```

## Development Conventions

### Code Style

The project uses Biome for code formatting and linting. The configuration is in the `biome.json` file.

### Testing

The project uses Vitest for testing. Test files are located in `__tests__` directories and have the `.test.ts` or `.spec.ts` extension.

### Committing

The project uses a pre-push hook to run tests.

### Versioning and Releasing

The project uses Changesets for versioning and releasing.
