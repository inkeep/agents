# Template Projects

This directory contains template projects for use with the Inkeep Agent Framework.

## Adding a New Template Project

To add a new template project, follow these guidelines:

### Folder Structure
Create a new folder with your project name (e.g., `template-project`).

### Required Files

#### `index.ts`
This file must export a project with the following structure:
- **id**: Must exactly match the project folder name
- **name**: Human-readable name for the project
- **description**: Brief description of what the project does
- **agents**: Function that returns an array of all agents defined in the folder

#### Agent Files
Define your agents in separate `.ts` files and import them into your `index.ts`.

### Example Structure

```
template-projects/
├── my-project/
│   ├── index.ts
│   ├── agents
│       └── my-agent.ts
```

### Example `index.ts`

```typescript
import { myAgent } from './my-agent.ts';
import { project } from '@inkeep/agents-sdk';

export const myProject = project({
  id: 'my-project', // Must match folder name
  name: 'My Project',
  description: 'Description of what this project does',
  agents: () => [myAgent], // Include all agents from this folder
});
```

### Example Agent File (`my-agent.ts`)

```typescript
import { agent, subAgent } from '@inkeep/agents-sdk';

const mySubAgent = subAgent({
  id: 'my-sub-agent',
  name: 'My SubAgent',
  description: 'SubAgent description',
  prompt: 'Your sub agent prompt here',
});

export const myAgent = agent({
  id: 'my-project-agent',
  name: 'My Project',
  defaultSubAgent: mySubAgent,
  subAgents: () => [mySubAgent],
});
```

## Key Requirements

1. **Project ID**: The `id` in your project export must exactly match your folder name
2. **All Agents**: Include all agents defined in your project folder in the `agents` array
3. **Export**: Your `index.ts` must export the project as a named export