# @inkeep/agents-cli

CLI for working with the Inkeep Agent Framework.

## Install

```bash
npm install -g @inkeep/agents-cli
# or
pnpm add -g @inkeep/agents-cli
```

The executable command is `inkeep`.

## Docs

- CLI overview: <https://docs.inkeep.com/guides/cli/overview>
- CLI reference: <https://docs.inkeep.com/typescript-sdk/cli-reference>
- Push guide: <https://docs.inkeep.com/guides/cli/push-to-cloud>
- Pull guide: <https://docs.inkeep.com/guides/cli/pull-from-cloud>
- Profile setup: <https://docs.inkeep.com/guides/cli/setup-profile>

## Quick usage

```bash
inkeep init
inkeep push
inkeep pull
inkeep list-agent --project <project-id>
```

## Local development

```bash
pnpm install
pnpm build
npm link
inkeep --version
```

## Contributing

Run from `agents-cli/`:

```bash
pnpm lint
pnpm typecheck
pnpm test --run
```
