# UI Development

This guide covers UI development patterns for agents-manage-ui.

## Stack

- **Next.js** with App Router
- **React** with TypeScript
- **Tailwind CSS** for styling
- **Zod** for form validation
- **shadcn/ui** component library

## Directory Structure

- `/agents-manage-ui/src/components/` - React components
- `/agents-manage-ui/src/app/` - Next.js pages and routing

## Development Commands

```bash
cd agents-manage-ui
pnpm dev    # Start dev server
pnpm build  # Build for production
pnpm lint   # Run linter
```

## Component Pattern

See existing components in `agents-manage-ui/src/components/` for patterns:

```tsx
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const featureSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  // ... other fields
});

export function FeatureForm() {
  const form = useForm({
    resolver: zodResolver(featureSchema)
  });
  
  return (
    // Component implementation
  );
}
```

## Guidelines

- Include form validation schemas using Zod
- Follow existing Next.js and React patterns
- Use the existing UI component library (shadcn/ui)
- Ensure forms have proper validation and error handling



