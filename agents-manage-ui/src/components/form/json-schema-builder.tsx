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

export const JsonSchemaBuilder: FC = () => {
  return (
    <>
      <div className="flex gap-2">
        <StringIcon className="shrink-0" />
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
      </div>
      <Button variant="secondary" size="sm">
        <PlusIcon />
        Add property
      </Button>
    </>
  );
};
