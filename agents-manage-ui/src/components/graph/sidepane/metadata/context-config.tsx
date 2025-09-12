import { ExpandableJsonEditor } from '@/components/form/expandable-json-editor';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ContextConfig, GraphMetadata } from '../../configuration/graph-types';

export function ContextConfigForm({
  contextConfig,
  updateMetadata,
}: {
  contextConfig: ContextConfig;
  updateMetadata: (field: keyof GraphMetadata, value: GraphMetadata[keyof GraphMetadata]) => void;
}) {
  const { id, name, description, contextVariables, requestContextSchema } = contextConfig;

  const updateContextConfig = (field: keyof ContextConfig, value: string) => {
    const updatedContextConfig = {
      ...contextConfig,
      [field]: value,
    };
    updateMetadata('contextConfig', updatedContextConfig);
  };

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Context configuration</h2>
        <p className="text-sm text-muted-foreground">Configure dynamic context for this graph.</p>
      </div>
      <div className="flex flex-col space-y-8">
        <div className="space-y-2">
          <Label htmlFor="id">Id</Label>
          <Input
            id="id"
            value={id || ''}
            onChange={(e) => updateContextConfig('id', e.target.value)}
            placeholder="my-context"
          />
          <p className="text-sm text-muted-foreground">
            Choose a unique identifier for this configuration. Using an existing id will replace
            that configuration.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => updateContextConfig('name', e.target.value)}
            placeholder="My context"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => updateContextConfig('description', e.target.value)}
            placeholder="Context description..."
            className="max-h-96"
          />
        </div>
        <ExpandableJsonEditor
          name="contextVariables"
          label="Context variables (JSON)"
          value={contextVariables}
          onChange={(value) => updateContextConfig('contextVariables', value)}
          placeholder="{}"
          className=""
        />
        <ExpandableJsonEditor
          name="requestContextSchema"
          label="Request context schema (JSON)"
          value={requestContextSchema}
          onChange={(value) => updateContextConfig('requestContextSchema', value)}
          placeholder="{}"
          className=""
        />
      </div>
    </div>
  );
}
