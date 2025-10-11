import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface ComponentItem {
  id: string;
  name: string;
  description?: string;
}

interface SelectedComponentsProps<T extends ComponentItem> {
  selectedComponents: string[];
  componentLookup: Record<string, T>;
  handleToggle: (componentId: string) => void;
}

export function SelectedComponents<T extends ComponentItem>({
  selectedComponents,
  componentLookup,
  handleToggle,
}: SelectedComponentsProps<T>) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {selectedComponents.map((componentId) => {
          const component = componentLookup[componentId];
          return (
            <Badge key={componentId} variant="code" className="text-xs">
              {component?.name || componentId}
              <Button
                variant="ghost"
                size="icon-sm"
                className=" size-3 ml-1"
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
