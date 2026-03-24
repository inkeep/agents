import { CodeDiff } from './code-diff';
import { TextDiff } from './text-diff';

const FieldLabel = ({ children }: { children: React.ReactNode }) => {
  return <div className="text-sm font-medium mb-2 text-foreground">{children}</div>;
};

interface DiffFieldProps {
  originalValue: any;
  field: string;
  subAgentId?: string;
  newValue: any;
  renderAsCode?: boolean;
}

const formatFieldName = (field: string) => {
  const formatted = field
    .replace(/([a-z])([A-Z])/g, '$1 $2') // Insert space before capital letters (camelCase)
    .replace(/[-_]/g, ' ') // Replace hyphens and underscores with spaces
    .toLowerCase(); // Convert to lowercase
  return formatted.charAt(0).toUpperCase() + formatted.slice(1); // Capitalize only first letter
};

export const DiffField = ({
  originalValue,
  field,
  newValue,
  renderAsCode = false,
}: DiffFieldProps) => {
  const bothStrings = typeof originalValue === 'string' && typeof newValue === 'string';
  const useCodeDiff = !bothStrings || renderAsCode;

  return (
    <div className="flex flex-col relative">
      <FieldLabel>{formatFieldName(field)}</FieldLabel>
      {bothStrings && !useCodeDiff ? (
        <TextDiff originalValue={originalValue} newValue={newValue} />
      ) : (
        <CodeDiff
          originalValue={
            typeof originalValue === 'string'
              ? originalValue
              : originalValue
                ? JSON.stringify(originalValue, null, 2)
                : ''
          }
          newValue={typeof newValue === 'string' ? newValue : JSON.stringify(newValue, null, 2)}
        />
      )}
    </div>
  );
};
