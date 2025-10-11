import { ComponentDropdown } from './component-dropdown';
import { ComponentHeader } from './component-header';
import { SelectedComponents } from './selected-components';

interface ComponentItem {
  id: string;
  name: string;
  description?: string;
}

interface ComponentSelectorProps<T extends ComponentItem> {
  label: string;
  componentLookup: Record<string, T>;
  selectedComponents: string[];
  onSelectionChange: (newSelection: string[]) => void;
  emptyStateMessage?: string;
  emptyStateActionText?: string;
  emptyStateActionHref?: string;
  placeholder?: string;
}

export function ComponentSelector<T extends ComponentItem>({
  label,
  componentLookup,
  selectedComponents,
  onSelectionChange,
  emptyStateMessage,
  emptyStateActionText,
  emptyStateActionHref,
  placeholder = 'Select components...',
}: ComponentSelectorProps<T>) {
  const handleToggle = (componentId: string) => {
    const newSelection = selectedComponents.includes(componentId)
      ? selectedComponents.filter((id) => id !== componentId)
      : [...selectedComponents, componentId];
    onSelectionChange(newSelection);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2">
        <ComponentHeader label={label} count={selectedComponents.length} />
        {selectedComponents.length > 0 && (
          <SelectedComponents
            selectedComponents={selectedComponents}
            componentLookup={componentLookup}
            handleToggle={handleToggle}
          />
        )}
      </div>
      <ComponentDropdown
        selectedComponents={selectedComponents}
        handleToggle={handleToggle}
        availableComponents={Object.values(componentLookup)}
        emptyStateMessage={emptyStateMessage}
        emptyStateActionText={emptyStateActionText}
        emptyStateActionHref={emptyStateActionHref}
        placeholder={placeholder}
      />
    </div>
  );
}
