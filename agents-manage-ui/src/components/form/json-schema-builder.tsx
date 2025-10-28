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
import { PlusIcon, TrashIcon, X } from 'lucide-react';
import { StringIcon, NumberIcon, BooleanIcon, EnumIcon, ArrayIcon } from './icons';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const Types = {
  string: 'str',
  number: 'num',
  boolean: 'bool',
  enum: 'enum',
  array: 'obj',
  object: 'arr',
};

type TypeValues = (typeof Types)[keyof typeof Types];

const SelectType: FC<{ type: TypeValues }> = ({ type }) => {
  return (
    <Select defaultValue={type}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.values(Types).map((agent) => (
          <SelectItem key={agent} value={agent}>
            {agent.toUpperCase()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

function renderProperty(type: TypeValues) {
  const inputs = (
    <>
      {renderIcon(type)}
      <Input placeholder="Property name" />
      <SelectType type={type} />
      <Input placeholder="Add description" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="icon-sm" variant="ghost">
            <TrashIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Remove property</TooltipContent>
      </Tooltip>
    </>
  );

  switch (type) {
    case 'num':
    case 'bool':
    case 'str': {
      return <div className="flex gap-2 items-center">{inputs}</div>;
    }
    case 'enum':
      return (
        <>
          <div className="flex gap-2 items-center">{inputs}</div>
          <TagsInput />
        </>
      );
    case 'arr':
      return (
        <>
          <div className="flex gap-2 items-center">{inputs}</div>
          <div className="flex gap-2 items-center me-8 ms-6">
            <span className="shrink-0 md:text-sm">Array items</span>
            <SelectType type="str" />
            <Input placeholder="Add description" />
          </div>
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
    case 'arr':
      return <ArrayIcon className="shrink-0 text-pink-500" />;
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
      {renderProperty('arr')}
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
    <div className="ms-6 me-8 h-9 flex flex-wrap items-center gap-2 rounded-md border border-input px-3 py-1 bg-transparent dark:bg-input/30 md:text-sm">
      {tags.map((tag) => (
        <Badge
          key={tag}
          variant="secondary"
          className="flex items-center gap-1 rounded-full px-2 py-1"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="ml-1 rounded-full hover:bg-muted p-0.5"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type possible values and press enter"
        className="grow outline-none"
      />
    </div>
  );
};
