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
import { PlusIcon, X } from 'lucide-react';
import { StringIcon, NumberIcon, BooleanIcon, EnumIcon } from './icons';
import { Badge } from '@/components/ui/badge';

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
    case 'str': {
      return (
        <div className="flex gap-2 items-center">
          {icon}
          {inputs}
        </div>
      );
    }
    case 'enum':
      return (
        <>
          <div className="flex gap-2 items-center">
            {icon}
            {inputs}
          </div>
          <TagsInput />
        </>
      );
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

const TagsInput: FC = () => {
  const [tags, setTags] = useState<string[]>([]);
  const [input, setInput] = useState('');

  const addTag = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(input);
      setInput('');
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border p-2">
      {tags.map((tag) => (
        <Badge
          key={tag}
          variant="secondary"
          className="flex items-center gap-1 rounded-full px-2 py-1"
        >
          <span>{tag}</span>
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="ml-1 rounded-full hover:bg-muted p-0.5"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        className="flex-1 border-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        placeholder="Type and press Enter..."
      />
    </div>
  );
};
