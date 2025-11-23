'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowUpIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { useCopilotContext } from './copilot-context';

const samplePrompts = [
  {
    label: 'Build a weather agent',
    value: 'Help me build an agent that can tell me the weather in any city.',
  },
  {
    label: 'Build a recipe agent',
    value: 'Help me build an agent that can help me find recipes.',
  },
  {
    label: 'Build a travel agent',
    value: 'Help me build an agent that can help me plan my travel.',
  },
];

const schema = z.object({
  message: z.string().min(1, 'Message is required'),
});

const defaultValues: CopilotStandaloneInputFormData = {
  message: '',
};

type CopilotStandaloneInputFormData = z.infer<typeof schema>;

export default function CopilotStandaloneInput() {
  const form = useForm<CopilotStandaloneInputFormData>({
    resolver: zodResolver(schema),
    defaultValues,
  });
  const { isSubmitting } = form.formState;
  const { chatFunctionsRef, openCopilot } = useCopilotContext();

  const onSubmit = ({ message }: CopilotStandaloneInputFormData) => {
    if (chatFunctionsRef?.current) {
      openCopilot();
      // todo this is a hack to ensure the message is submitted after the conversation id is set
      setTimeout(() => {
        chatFunctionsRef?.current?.submitMessage(message);
      }, 100);
    }
  };

  return (
    <>
      <Form {...form}>
        <form
          className="flex flex-col items-center border bg-background rounded-xl w-full focus-within:border-ring focus-within:ring-ring/50 shadow-sm"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <FormField
            control={form.control}
            name="message"
            render={({ field }) => (
              <FormControl>
                <Textarea
                  placeholder="Ask Agent Builder to build..."
                  className="w-full border-none focus-visible:ring-0 focus-visible:border-none resize-none shadow-none p-3 max-h-[200px] min-h-[54px] rounded-b-none rounded-t-xl"
                  autoFocus
                  {...field}
                />
              </FormControl>
            )}
          />
          <div className="flex justify-end w-full px-3 pb-3 dark:bg-input/30 rounded-b-xl">
            <Button size="icon" className="h-7 w-7" type="submit" disabled={isSubmitting}>
              <span className="sr-only">Submit</span>
              <ArrowUpIcon className="size-5" />
            </Button>
          </div>
        </form>
      </Form>
      <div className="flex flex-row items-center justify-center gap-2 mt-3">
        {samplePrompts.map((prompt) => (
          <Button
            key={prompt.value}
            type="button"
            size="xs"
            variant="outline"
            className="justify-center rounded-full font-normal font-sans normal-case backdrop-blur-3xl"
            onClick={() => form.setValue('message', prompt.value)}
          >
            <span className="text-sm text-muted-foreground">{prompt.label}</span>
          </Button>
        ))}
      </div>
    </>
  );
}
