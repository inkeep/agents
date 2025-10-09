# @inkeep/agents-ui

React-based UI components for the Inkeep Agent Framework chat interface.

## Installation

```bash
npm install @inkeep/agents-ui
```

## Overview

This package provides a customizable chat widget UI for interacting with agents built using the Inkeep Agent Framework. It includes:

- Chat interface components
- Message rendering with markdown support
- Streaming response handling
- Tool call visualization
- Responsive design with Tailwind CSS

## Usage

```typescript
import { ChatWidget } from '@inkeep/agents-ui';

// Basic usage
<ChatWidget 
  apiUrl="https://your-api-endpoint.com"
  subAgentId="your-agent-id"
/>
```

## Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

## Dependencies

- React 19+
- Vite for bundling
- TypeScript for type safety
- Tailwind CSS for styling
- Lucide React for icons

## License

See LICENSE.md for details.

## Contributing

Please refer to the main repository's contribution guidelines.

## Support

For issues and questions, please open an issue in the main [inkeep/agents repository](https://github.com/inkeep/agents/issues).
