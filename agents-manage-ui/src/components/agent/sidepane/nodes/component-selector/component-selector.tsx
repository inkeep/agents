import { type BaseComponentDropdownProps, ComponentDropdown } from './component-dropdown';
import { ComponentHeader } from './component-header';
import { SelectedComponents } from './selected-components';

interface ComponentItem {
  id: string;
  name: string;
  description?: string | null;
}

interface ComponentSelectorProps<T extends ComponentItem>
  extends Pick<
    BaseComponentDropdownProps,
    | 'selectedComponents'
    | 'emptyStateMessage'
    | 'emptyStateActionText'
    | 'emptyStateActionHref'
    | 'placeholder'
    | 'commandInputPlaceholder'
  > {
  label: string;
  componentLookup: Record<string, T>;
  onSelectionChange: (newSelection: string[]) => void;
}

export function ComponentSelector<T extends ComponentItem>({
  label,
  componentLookup,
  selectedComponents,
  onSelectionChange,
  ...props
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
        {label && <ComponentHeader label={label} count={selectedComponents.length} />}
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
        {...props}
      />
    </div>
  );
}
