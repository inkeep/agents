import type { FC } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { PlusIcon } from 'lucide-react';
import { StringIcon } from './icons';

const Types = {
  string: 'str',
  number: 'num',
  boolean: 'bool',
  enum: 'enum',
  array: 'obj',
  object: 'arr',
};

function renderProperty(type: keyof typeof Types) {
  const inputs = (
    <>
      <Input placeholder="Property name" />
      <Select defaultValue="str">
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {['str', 'num', 'bool', 'enum', 'obj', 'arr'].map((agent) => (
            <SelectItem key={agent} value={agent}>
              {agent.toUpperCase()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input placeholder="Add description" />
    </>
  );

  const icon = renderIcon(type);

  switch (type) {
    case 'string':
      return (
        <div className="flex gap-2 items-center">
          {icon}
          {inputs}
        </div>
      );
  }
}

function renderIcon(type: keyof typeof Types) {
  switch (type) {
    case 'string':
      return <StringIcon className="shrink-0 text-green-500" />;
  }
}

export const JsonSchemaBuilder: FC = () => {
  return (
    <>
      {renderProperty('string')}
      <Button variant="secondary" size="sm" className="self-start">
        <PlusIcon />
        Add property
      </Button>
    </>
  );
};
