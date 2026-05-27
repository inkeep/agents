'use client';

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FormControl, FormItem, FormLabel } from '@/components/ui/form';

const ERROR_EVENT_TYPES = [
  {
    value: 'conversation.execution.error',
    label: 'Execution Error',
    description: 'Terminal failure (max errors, max transfers, or uncaught exception)',
  },
  {
    value: 'conversation.generation.error',
    label: 'Generation Error',
    description: 'An LLM call in a conversation fails to produce a response',
  },
  {
    value: 'conversation.tool.error',
    label: 'Tool Error',
    description: 'A tool call returns an error',
  },
  {
    value: 'conversation.context.error',
    label: 'Context Error',
    description: 'Context resolution encounters fetch failures',
  },
] as const;

type ErrorEventType = (typeof ERROR_EVENT_TYPES)[number]['value'];

interface ConversationErrorsEventGroupProps {
  selectedEventTypes: string[];
  onChange: (eventTypes: string[]) => void;
}

export function ConversationErrorsEventGroup({
  selectedEventTypes,
  onChange,
}: ConversationErrorsEventGroupProps) {
  const [isOpen, setIsOpen] = useState(false);

  const errorValues = ERROR_EVENT_TYPES.map((e) => e.value);
  const selectedErrorTypes = selectedEventTypes.filter((t): t is ErrorEventType =>
    errorValues.includes(t as ErrorEventType)
  );
  const nonErrorTypes = selectedEventTypes.filter(
    (t) => !errorValues.includes(t as ErrorEventType)
  );

  const allChecked = selectedErrorTypes.length === ERROR_EVENT_TYPES.length;
  const someChecked = selectedErrorTypes.length > 0 && !allChecked;

  function handleMasterChange(checked: boolean) {
    if (checked) {
      onChange([...nonErrorTypes, ...errorValues]);
    } else {
      onChange(nonErrorTypes);
    }
  }

  function handleIndividualChange(value: string, checked: boolean) {
    if (checked) {
      onChange([...selectedEventTypes, value]);
    } else {
      onChange(selectedEventTypes.filter((t) => t !== value));
    }
  }

  return (
    <>
      <FormItem className="flex items-center space-x-2 space-y-0">
        <FormControl>
          <Checkbox
            checked={allChecked ? true : someChecked ? 'indeterminate' : false}
            onCheckedChange={(checked) => handleMasterChange(checked === true)}
          />
        </FormControl>
        <FormLabel
          className="font-normal cursor-pointer"
          onClick={() => handleMasterChange(!allChecked)}
        >
          Conversation Error
        </FormLabel>
      </FormItem>

      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground ml-6">
          <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
          Advanced
        </CollapsibleTrigger>
        <CollapsibleContent className="ml-6 mt-1 space-y-2">
          {ERROR_EVENT_TYPES.map((eventType) => (
            <FormItem key={eventType.value} className="flex items-start space-x-2 space-y-0">
              <FormControl>
                <Checkbox
                  className="mt-0.5"
                  checked={selectedErrorTypes.includes(eventType.value)}
                  onCheckedChange={(checked) =>
                    handleIndividualChange(eventType.value, checked === true)
                  }
                />
              </FormControl>
              <div>
                <FormLabel className="font-normal cursor-pointer">{eventType.label}</FormLabel>
                <p className="text-xs text-muted-foreground">{eventType.description}</p>
              </div>
            </FormItem>
          ))}
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}
