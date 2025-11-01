import { InkeepEmbeddedChat } from '@inkeep/agents-ui';
import { CodeIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { GenericInput } from '@/components/form/generic-input';
import { Button } from '@/components/ui/button';
import { ColorPickerInput } from '@/components/ui/color-picker';
import { Form, FormItem, FormLabel } from '@/components/ui/form';

export function ChatUiPreview() {
  const form = useForm({
    defaultValues: {
      primaryBrandColor: '#3784ff',
      aiAssistantAvatar: '',
      introMessage: 'Hi! How can I help?',
    },
  });
  const allValues = form.watch();
  return (
    <div>
      <div className="flex justify-between items-center mb-6 pt-8">
        <h3 className="text-md font-medium">Customize the chat UI</h3>
        <Button variant="outline" size="sm">
          <CodeIcon className="size-4" />
          View code
        </Button>
      </div>
      <div className="flex flex-row gap-12 w-full">
        <Form {...form}>
          <form className="space-y-8 flex-1">
            <FormItem className="relative">
              <FormLabel>Primary brand color</FormLabel>
              <ColorPickerInput
                color={form.watch('primaryBrandColor')}
                setColor={(color) => form.setValue('primaryBrandColor', color)}
                placeholder="#000000"
              />
            </FormItem>

            <GenericInput
              control={form.control}
              name="aiAssistantAvatar"
              label="AI assistant avatar"
              placeholder="https://example.com/assistant-avatar.png"
            />
            <GenericInput
              control={form.control}
              name="introMessage"
              label="Intro message"
              placeholder="Hi! How can I help?"
              description="Supports markdown formatting. For example: **bold** or _italic_ or [link](https://example.com)"
            />
          </form>
        </Form>
        <div className="flex-1">
          <InkeepEmbeddedChat
            baseSettings={{
              primaryBrandColor: allValues.primaryBrandColor,
              colorMode: {
                sync: {
                  target: document.documentElement,
                  attributes: ['class'],
                  isDarkMode: (attributes: Record<string, string | null>) =>
                    !!attributes?.class?.includes('dark'),
                },
              },
            }}
            aiChatSettings={{ ...allValues }}
          />
        </div>
      </div>
    </div>
  );
}
