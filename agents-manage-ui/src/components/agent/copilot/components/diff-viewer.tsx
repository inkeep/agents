import { CodeDiff } from './code-diff';
import { RelationalDiff } from './relational-diff';
import { TextDiff } from './text-diff';

export const FieldLabel = ({ children }: { children: React.ReactNode }) => {
  return <div className="text-sm font-medium mb-2">{children}</div>;
};

interface DiffViewerProps {
  originalValue: string;
  field: string;
  subAgentId?: string;
  newValue: string;
}

export const DiffViewer = (props: DiffViewerProps) => {
  console.log(props);
  return (
    <div className="relative rounded-lg border px-4 py-3">
      <FieldLabel>{props.field}</FieldLabel>
      <CodeDiff originalValue={props.originalValue} newValue={props.newValue} />
      <TextDiff oldValue={props.originalValue} newValue={props.newValue} />

      <RelationalDiff
        sourceSubAgentId={'activities-planner'}
        targetSubAgentId={'weather-forecast'}
        relationType={'transfer'}
      />
    </div>
  );
};
