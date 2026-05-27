// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { Form, FormField } from '@/components/ui/form';
import { ConversationErrorsEventGroup } from '../conversation-errors-event-group';

const ERROR_TYPES = [
  'conversation.execution.error',
  'conversation.generation.error',
  'conversation.tool.error',
  'conversation.context.error',
];

function Wrapper({
  selectedEventTypes,
  onChange,
}: {
  selectedEventTypes: string[];
  onChange: (v: string[]) => void;
}) {
  const form = useForm({ defaultValues: { eventTypes: selectedEventTypes } });
  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name="eventTypes"
        render={() => (
          <ConversationErrorsEventGroup
            selectedEventTypes={selectedEventTypes}
            onChange={onChange}
          />
        )}
      />
    </Form>
  );
}

function renderGroup(selectedEventTypes: string[] = [], onChange = vi.fn()) {
  const result = render(<Wrapper selectedEventTypes={selectedEventTypes} onChange={onChange} />);
  return { onChange, ...result };
}

describe('ConversationErrorsEventGroup', () => {
  it('master checkbox selects all 4 error types while preserving non-error types', () => {
    const { onChange } = renderGroup(['conversation.created', 'feedback.created']);
    const masterCheckbox = screen.getAllByRole('checkbox')[0];
    fireEvent.click(masterCheckbox);
    expect(onChange).toHaveBeenCalledWith(
      expect.arrayContaining(['conversation.created', 'feedback.created', ...ERROR_TYPES])
    );
  });

  it('unchecking master removes only error types, preserving non-error types', () => {
    const { onChange } = renderGroup(['conversation.created', ...ERROR_TYPES]);
    const masterCheckbox = screen.getAllByRole('checkbox')[0];
    fireEvent.click(masterCheckbox);
    expect(onChange).toHaveBeenCalledWith(['conversation.created']);
  });

  it('renders indeterminate state when subset of error types selected', () => {
    renderGroup(['conversation.execution.error', 'conversation.tool.error']);
    const masterCheckbox = screen.getAllByRole('checkbox')[0];
    expect(masterCheckbox).toHaveAttribute('data-state', 'indeterminate');
  });

  it('renders checked state when all error types selected', () => {
    renderGroup(ERROR_TYPES);
    const masterCheckbox = screen.getAllByRole('checkbox')[0];
    expect(masterCheckbox).toHaveAttribute('data-state', 'checked');
  });

  it('renders unchecked state when no error types selected', () => {
    renderGroup(['conversation.created']);
    const masterCheckbox = screen.getAllByRole('checkbox')[0];
    expect(masterCheckbox).toHaveAttribute('data-state', 'unchecked');
  });
});
