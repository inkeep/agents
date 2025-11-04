import type { UseFormReturn } from 'react-hook-form';
import { GenericInput } from '@/components/form/generic-input';
import { GenericSelect } from '@/components/form/generic-select';
import { ColorPickerInput } from '@/components/ui/color-picker';
import { Form, FormItem, FormLabel } from '@/components/ui/form';

export enum ChatUIComponent {
  EMBEDDED_CHAT = 'Embedded Chat',
  CHAT_BUTTON = 'Chat Button',
  SIDEBAR_CHAT = 'Sidebar Chat',
}

interface ChatUIPreviewFormProps {
  form: UseFormReturn<any>;
}
export const ChatUIPreviewForm = ({ form }: ChatUIPreviewFormProps) => {
  return (
    <Form {...form}>
      <form className="space-y-8 flex-1">
        <GenericSelect
          control={form.control}
          name="component"
          label="Component"
          options={Object.values(ChatUIComponent).map((component) => ({
            value: component,
            label: component,
          }))}
          selectTriggerClassName="w-full"
        />
        <FormItem className="relative">
          <FormLabel>Primary brand color</FormLabel>
          <ColorPickerInput
            color={form.watch('baseSettings.primaryBrandColor')}
            setColor={(color) => form.setValue('baseSettings.primaryBrandColor', color)}
            placeholder="#000000"
          />
        </FormItem>
        <GenericInput
          control={form.control}
          name="aiChatSettings.aiAssistantAvatar"
          label="AI assistant avatar"
          placeholder="https://example.com/assistant-avatar.png"
        />
        <GenericInput
          control={form.control}
          name="aiChatSettings.introMessage"
          label="Intro message"
          placeholder="Hi! How can I help?"
          description="Supports markdown formatting. For example: **bold** or _italic_ or [link](https://example.com)"
        />
        <GenericInput
          control={form.control}
          name="aiChatSettings.placeholder"
          label="Placeholder"
          placeholder="How do I get started?"
        />
      </form>
    </Form>
  );
};
