import { type FC, type ReactNode, useCallback, useState } from 'react';
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
import { StringIcon, NumberIcon, BooleanIcon, EnumIcon } from './icons';

const Types = {
  string: 'str',
  number: 'num',
  boolean: 'bool',
  enum: 'enum',
  array: 'obj',
  object: 'arr',
};

type TypeValues = (typeof Types)[keyof typeof Types];

function renderProperty(type: TypeValues) {
  const inputs = (
    <>
      <Input placeholder="Property name" />
      <Select defaultValue={type}>
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
    case 'num':
    case 'bool':
    case 'enum':
    case 'str': {
      return (
        <div className="flex gap-2 items-center">
          {icon}
          {inputs}
        </div>
      );
    }
    default: {
      throw new TypeError(`Unsupported type ${type}`);
    }
  }
}

function renderIcon(type: TypeValues) {
  switch (type) {
    case 'str':
      return <StringIcon className="shrink-0 text-green-500" />;
    case 'num':
      return <NumberIcon className="shrink-0 text-blue-500" />;
    case 'bool':
      return <BooleanIcon className="shrink-0 text-orange-500" />;
    case 'enum':
      return <EnumIcon className="shrink-0 text-yellow-500" />;
  }
}

export const JsonSchemaBuilder: FC = () => {
  const [properties, setProperties] = useState<ReactNode[]>([]);
  const handleAddProperty = useCallback(() => {
    setProperties((prev) => [...prev, renderProperty('str')]);
  }, []);

  return (
    <>
      {renderProperty('str')}
      {renderProperty('num')}
      {renderProperty('bool')}
      {renderProperty('enum')}
      {properties}
      <Button onClick={handleAddProperty} variant="secondary" size="sm" className="self-start">
        <PlusIcon />
        Add property
      </Button>
    </>
  );
};
