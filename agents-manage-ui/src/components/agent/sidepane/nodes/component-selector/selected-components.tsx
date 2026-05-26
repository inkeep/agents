import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ComponentItem {
  id: string;
  name: string;
  description?: string | null;
}

interface SelectedComponentsProps<T extends ComponentItem> {
  selectedComponents: string[];
  componentLookup: Record<string, T>;
  handleToggle: (componentId: string) => void;
  /** Ids rendered with the highlighted (required) style. */
  requiredComponents?: string[];
  /** When provided, the chip body is clickable — callers use it to toggle a secondary state. */
  onComponentClick?: (componentId: string) => void;
}

export function SelectedComponents<T extends ComponentItem>({
  selectedComponents,
  componentLookup,
  handleToggle,
  requiredComponents,
  onComponentClick,
}: SelectedComponentsProps<T>) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {selectedComponents.map((componentId) => {
          const component = componentLookup[componentId];
          const name = component?.name || componentId;
          const isRequired = requiredComponents?.includes(componentId) ?? false;
          return (
            <Badge
              key={componentId}
              variant="code"
              className={cn(
                'text-xs',
                // dark:bg-primary overrides the `code` variant's dark:bg-muted/50,
                // which tailwind-merge keeps alongside an unprefixed bg-primary.
                isRequired &&
                  'border-primary bg-primary font-semibold text-primary-foreground dark:bg-primary'
              )}
            >
              {onComponentClick ? (
                <button
                  type="button"
                  className="cursor-pointer"
                  aria-pressed={isRequired}
                  onClick={() => onComponentClick(componentId)}
                >
                  {name}
                </button>
              ) : (
                name
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                className={cn(
                  'size-3 ml-1',
                  // the ghost variant hard-codes text-muted-foreground; on a solid
                  // primary chip the × must match the chip's foreground instead.
                  isRequired &&
                    'text-primary-foreground hover:bg-transparent hover:text-primary-foreground dark:text-primary-foreground'
                )}
                aria-label={`Remove ${name}`}
                onClick={() => handleToggle(componentId)}
              >
                <X className="size-3" />
              </Button>
            </Badge>
          );
        })}
      </div>
    </div>
  );
}
