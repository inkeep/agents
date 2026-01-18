---
"@inkeep/agents-manage-ui": patch
---

move all React context Provider in `@/contexts` (except shadcn providers)

remove unnecessary `.Provider` suffix React context components. Starting in React 19, you can render `<SomeContext>` as a provider.
