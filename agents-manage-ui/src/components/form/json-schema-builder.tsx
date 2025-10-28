import { type ComponentProps, type FC, type ReactNode, useCallback, useState } from 'react';
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
import { cn } from '@/lib/utils';

const Types = {
  string: 'str',
  number: 'num',
  boolean: 'bool',
  enum: 'enum',
  array: 'obj',
  object: 'arr',
};

type TypeValues = (typeof Types)[keyof typeof Types];

const SelectType: FC<{ defaultType: TypeValues }> = ({ defaultType }) => {
  return (
    <Select defaultValue={defaultType}>
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

const Property: FC<{ defaultType: TypeValues }> = ({ defaultType }) => {
  const inputs = (
    <>
      <PropertyIcon type={defaultType} />
      <Input placeholder="Property name" />
      <SelectType defaultType={defaultType} />
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

  switch (defaultType) {
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
            <SelectType defaultType="str" />
            <Input placeholder="Add description" />
          </div>
        </>
      );
    default: {
      throw new TypeError(`Unsupported type ${defaultType}`);
    }
  }
};

const IconToUse: Record<TypeValues, FC<ComponentProps<'svg'>>> = {
  str: StringIcon,
  num: NumberIcon,
  bool: BooleanIcon,
  enum: EnumIcon,
  arr: ArrayIcon,
};

const ClassToUse: Record<string, string> = {
  str: 'text-green-500',
  num: 'text-blue-500',
  bool: 'text-orange-500',
  enum: 'text-yellow-500',
  arr: 'text-pink-500',
};

const PropertyIcon: FC<{ type: TypeValues }> = ({ type }) => {
  const Icon = IconToUse[type];
  if (!Icon) {
    throw new Error(`Unsupported type "${type}"`);
  }
  return <Icon className={cn('shrink-0', ClassToUse[type])} />;
};

export const JsonSchemaBuilder: FC = () => {
  const [properties, setProperties] = useState<ReactNode[]>([]);
  const handleAddProperty = useCallback(() => {
    setProperties((prev) => [...prev, <Property defaultType="str" />]);
  }, []);

  return (
    <>
      <Property defaultType="str" />
      <Property defaultType="num" />
      <Property defaultType="bool" />
      <Property defaultType="enum" />
      <Property defaultType="arr" />
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
