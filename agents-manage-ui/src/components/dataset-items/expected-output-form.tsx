'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { useController } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface Message {
  role: string;
  content: string;
}

interface ExpectedOutputFormProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  description?: string;
}

// Parse the value - it might be a JSON string or an array
const parseExpectedOutputValue = (value: unknown): Message[] => {
  if (!value) {
    return [];
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  if (Array.isArray(value)) {
    return value;
  }

  return [];
};

export function ExpectedOutputForm<T extends FieldValues>({
  control,
  name,
  label,
  description,
}: ExpectedOutputFormProps<T>) {
  const { field } = useController({
    control,
    name,
  });

  const [localMessages, setLocalMessages] = useState<Message[]>(
    parseExpectedOutputValue(field.value)
  );

  // Sync with form field value changes
  useEffect(() => {
    setLocalMessages(parseExpectedOutputValue(field.value));
  }, [field.value]);

  const updateField = (messages: Message[]) => {
    field.onChange(JSON.stringify(messages, null, 2));
  };

  const addMessage = () => {
    const newMessages = [...localMessages, { role: 'assistant', content: '' }];
    setLocalMessages(newMessages);
    updateField(newMessages);
  };

  const removeMessage = (index: number) => {
    const newMessages = localMessages.filter((_, i) => i !== index);
    setLocalMessages(newMessages);
    updateField(newMessages);
  };

  const updateMessage = (index: number, field: 'role' | 'content', value: string) => {
    const newMessages = [...localMessages];
    newMessages[index] = { ...newMessages[index], [field]: value };
    setLocalMessages(newMessages);
    updateField(newMessages);
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>{label}</Label>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Expected Messages</Label>
          <Button type="button" variant="outline" size="sm" onClick={addMessage}>
            <Plus className="w-4 h-4 mr-2" />
            Add Message
          </Button>
        </div>

        {localMessages.length === 0 ? (
          <div className="text-center py-8 border border-dashed rounded-md">
            <p className="text-sm text-muted-foreground mb-3">No expected messages yet</p>
            <Button type="button" variant="outline" size="sm" onClick={addMessage}>
              <Plus className="w-4 h-4 mr-2" />
              Add First Message
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {localMessages.map((message, index) => (
              <div key={index} className="border rounded-md p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Message {index + 1}</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeMessage(index)}
                    className="h-6 w-6 p-0 hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="md:col-span-1">
                    <Label htmlFor={`role-${index}`} className="text-xs text-muted-foreground">
                      Role
                    </Label>
                    <Select
                      value={message.role}
                      onValueChange={(value) => updateMessage(index, 'role', value)}
                    >
                      <SelectTrigger id={`role-${index}`}>
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="assistant">Assistant</SelectItem>
                        <SelectItem value="system">System</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="md:col-span-3">
                    <Label htmlFor={`content-${index}`} className="text-xs text-muted-foreground">
                      Content
                    </Label>
                    <Textarea
                      id={`content-${index}`}
                      value={message.content}
                      onChange={(e) => updateMessage(index, 'content', e.target.value)}
                      placeholder="Enter expected message content..."
                      className="min-h-[80px]"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
