'use client';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToParentElement } from '@dnd-kit/modifiers';
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, Plus, Trash2, X } from 'lucide-react';
import { type KeyboardEvent, useId, useState } from 'react';
import {
  type Control,
  type FieldValues,
  type Path,
  useFieldArray,
  useWatch,
} from 'react-hook-form';
import { Button, buttonVariants } from '@/components/ui/button';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const QUICK_ACTIONS_FIELD_NAME = 'supportCopilotQuickActions';

interface SupportCopilotQuickActionsSectionProps<T extends FieldValues> {
  control: Control<T>;
}

export function SupportCopilotQuickActionsSection<T extends FieldValues>({
  control,
}: SupportCopilotQuickActionsSectionProps<T>) {
  const groupName = QUICK_ACTIONS_FIELD_NAME as Path<T>;

  const {
    fields: groupFields,
    append: appendGroup,
    remove: removeGroup,
    move: moveGroup,
  } = useFieldArray({
    control,
    name: groupName as never,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const watchedGroups = useWatch({ control, name: groupName as never }) as
    | Array<{ group?: string; actions?: unknown[] }>
    | undefined;
  const lastGroup = watchedGroups?.[watchedGroups.length - 1];
  const hasEmptyTrailingGroup = groupFields.length > 0 && !lastGroup?.group?.trim();

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = groupFields.findIndex((f) => f.id === active.id);
    const to = groupFields.findIndex((f) => f.id === over.id);
    if (from === -1 || to === -1) return;
    moveGroup(from, to);
  };

  const groupAccessibility = {
    announcements: {
      onDragStart: ({ active }: { active: { id: string | number } }) => {
        const i = groupFields.findIndex((f) => f.id === active.id);
        return `Picked up group at position ${i + 1} of ${groupFields.length}.`;
      },
      onDragOver: ({
        active,
        over,
      }: {
        active: { id: string | number };
        over: { id: string | number } | null;
      }) => {
        if (!over) return `Group is no longer over a drop target.`;
        const from = groupFields.findIndex((f) => f.id === active.id);
        const to = groupFields.findIndex((f) => f.id === over.id);
        return `Group moved from position ${from + 1} to ${to + 1} of ${groupFields.length}.`;
      },
      onDragEnd: ({ over }: { over: { id: string | number } | null }) => {
        if (!over) return `Group was dropped outside of a drop target.`;
        const to = groupFields.findIndex((f) => f.id === over.id);
        return `Group dropped at position ${to + 1} of ${groupFields.length}.`;
      },
      onDragCancel: () => `Group reorder cancelled.`,
    },
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">Quick actions</h3>
        <p className="text-xs text-muted-foreground">
          Grouped action buttons shown in the Support Copilot. Clicking an action button sends its
          user message.
        </p>
      </div>

      <div className="rounded-md border p-2 space-y-1">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToParentElement]}
          accessibility={groupAccessibility}
        >
          <SortableContext
            items={groupFields.map((f) => f.id)}
            strategy={verticalListSortingStrategy}
          >
            {groupFields.map((groupField, groupIndex) => (
              <SortableGroupRow
                key={groupField.id}
                control={control}
                fieldId={groupField.id}
                groupIndex={groupIndex}
                onRemove={() => removeGroup(groupIndex)}
              />
            ))}
          </SortableContext>
        </DndContext>

        <button
          type="button"
          disabled={hasEmptyTrailingGroup}
          onClick={() =>
            appendGroup({
              group: '',
              actions: [],
            } as never)
          }
          title={hasEmptyTrailingGroup ? 'Name the current group before adding another' : undefined}
          className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-muted-foreground/40 text-xs text-muted-foreground transition-colors hover:border-input hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-muted-foreground/40 disabled:hover:text-muted-foreground"
        >
          <Plus className="h-3 w-3" />
          Add group
        </button>
      </div>
    </div>
  );
}

interface SortableGroupRowProps<T extends FieldValues> {
  control: Control<T>;
  fieldId: string;
  groupIndex: number;
  onRemove: () => void;
}

function SortableGroupRow<T extends FieldValues>({
  control,
  fieldId,
  groupIndex,
  onRemove,
}: SortableGroupRowProps<T>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: fieldId,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? 'none' : transition,
  };

  const actionsFieldName = `${QUICK_ACTIONS_FIELD_NAME}.${groupIndex}.actions` as Path<T>;
  const groupFieldName = `${QUICK_ACTIONS_FIELD_NAME}.${groupIndex}.group` as Path<T>;

  const {
    fields: actionFields,
    append: appendAction,
    remove: removeAction,
    move: moveAction,
  } = useFieldArray({
    control,
    name: actionsFieldName as never,
  });

  const actionSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleActionDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = actionFields.findIndex((f) => f.id === active.id);
    const to = actionFields.findIndex((f) => f.id === over.id);
    if (from === -1 || to === -1) return;
    moveAction(from, to);
  };

  const actionAccessibility = {
    announcements: {
      onDragStart: ({ active }: { active: { id: string | number } }) => {
        const i = actionFields.findIndex((f) => f.id === active.id);
        return `Picked up action at position ${i + 1} of ${actionFields.length}.`;
      },
      onDragOver: ({
        active,
        over,
      }: {
        active: { id: string | number };
        over: { id: string | number } | null;
      }) => {
        if (!over) return `Action is no longer over a drop target.`;
        const from = actionFields.findIndex((f) => f.id === active.id);
        const to = actionFields.findIndex((f) => f.id === over.id);
        return `Action moved from position ${from + 1} to ${to + 1} of ${actionFields.length}.`;
      },
      onDragEnd: ({ over }: { over: { id: string | number } | null }) => {
        if (!over) return `Action was dropped outside of a drop target.`;
        const to = actionFields.findIndex((f) => f.id === over.id);
        return `Action dropped at position ${to + 1} of ${actionFields.length}.`;
      },
      onDragCancel: () => `Action reorder cancelled.`,
    },
  };

  const [newPillOpen, setNewPillOpen] = useState(false);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group/row flex items-center gap-3 py-1.5 rounded-sm',
        isDragging && 'z-10 shadow-sm bg-background ring-1 ring-border'
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground opacity-0 group-hover/row:opacity-100 transition-opacity focus:opacity-100 focus:outline-none"
        aria-label="Drag group to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="relative w-32 shrink-0 group/label">
        <FormField
          control={control}
          name={groupFieldName}
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input
                  {...field}
                  value={(field.value as string | undefined) ?? ''}
                  placeholder="GROUP"
                  className="h-7 border-transparent bg-transparent pl-3 pr-7 text-[12px] md:text-[12px] font-medium uppercase tracking-wider text-muted-foreground hover:border-input focus:border-input focus:bg-background"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Pencil
          className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/50 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/label:opacity-0"
          aria-hidden
        />
      </div>

      <DndContext
        sensors={actionSensors}
        collisionDetection={closestCenter}
        onDragEnd={handleActionDragEnd}
        modifiers={[restrictToParentElement]}
        accessibility={actionAccessibility}
      >
        <SortableContext
          items={actionFields.map((f) => f.id)}
          strategy={horizontalListSortingStrategy}
        >
          <div className="flex flex-wrap items-center gap-1.5 flex-1">
            {actionFields.map((actionField, actionIndex) => (
              <SortableActionPill
                key={actionField.id}
                control={control}
                fieldId={actionField.id}
                groupIndex={groupIndex}
                actionIndex={actionIndex}
                onRemove={() => removeAction(actionIndex)}
              />
            ))}

            <Popover open={newPillOpen} onOpenChange={setNewPillOpen}>
              <PopoverTrigger
                className={cn(
                  buttonVariants({ variant: 'gray-outline', size: 'xs' }),
                  'border-dashed text-muted-foreground hover:text-foreground'
                )}
                aria-label="Add action"
              >
                <Plus className="size-3" />
                Add action
              </PopoverTrigger>
              <PopoverContent className="w-80" align="start">
                <NewActionForm
                  onSubmit={(values) => {
                    appendAction(values as never);
                    setNewPillOpen(false);
                  }}
                  onCancel={() => setNewPillOpen(false)}
                />
              </PopoverContent>
            </Popover>
          </div>
        </SortableContext>
      </DndContext>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        className="h-7 w-7 shrink-0 text-muted-foreground/60 hover:text-destructive opacity-0 group-hover/row:opacity-100 transition-opacity"
        aria-label="Remove group"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

interface SortableActionPillProps<T extends FieldValues> {
  control: Control<T>;
  fieldId: string;
  groupIndex: number;
  actionIndex: number;
  onRemove: () => void;
}

function SortableActionPill<T extends FieldValues>({
  control,
  fieldId,
  groupIndex,
  actionIndex,
  onRemove,
}: SortableActionPillProps<T>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: fieldId,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? 'none' : transition,
  };

  const labelName =
    `${QUICK_ACTIONS_FIELD_NAME}.${groupIndex}.actions.${actionIndex}.label` as Path<T>;
  const promptName =
    `${QUICK_ACTIONS_FIELD_NAME}.${groupIndex}.actions.${actionIndex}.prompt` as Path<T>;

  return (
    <FormField
      control={control}
      name={labelName}
      render={({ field: labelField, fieldState }) => (
        <Popover>
          <PopoverTrigger asChild>
            <button
              ref={setNodeRef}
              style={style}
              type="button"
              {...attributes}
              {...listeners}
              className={cn(
                buttonVariants({ variant: 'gray-outline', size: 'xs' }),
                'group/pill cursor-grab active:cursor-grabbing hover:border-input hover:shadow-sm',
                fieldState.error && 'border-destructive text-destructive',
                isDragging && 'z-10 shadow-sm opacity-80 !transition-none'
              )}
            >
              {labelField.value ? (
                <span>{labelField.value as string}</span>
              ) : (
                <span className="italic text-muted-foreground">Untitled</span>
              )}
              <Pencil
                className="size-3 text-muted-foreground/70 opacity-0 transition-opacity group-hover/pill:opacity-100"
                aria-hidden
              />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 space-y-3" align="start">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Edit action</p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onRemove}
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                aria-label="Delete action"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <FormField
              control={control}
              name={labelName}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium text-muted-foreground">Label</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={(field.value as string | undefined) ?? ''}
                      placeholder="e.g. Summarize"
                      className="h-8"
                      autoFocus
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name={promptName}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium text-muted-foreground">
                    User message
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={(field.value as string | undefined) ?? ''}
                      placeholder="Sent as the user message when clicked"
                      rows={3}
                      className="max-h-40 text-sm"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </PopoverContent>
        </Popover>
      )}
    />
  );
}

interface NewActionFormProps {
  onSubmit: (values: { label: string; prompt: string }) => void;
  onCancel: () => void;
}

function NewActionForm({ onSubmit, onCancel }: NewActionFormProps) {
  const [label, setLabel] = useState('');
  const [prompt, setPrompt] = useState('');
  const labelId = useId();
  const promptId = useId();
  const canAdd = label.trim().length > 0 && prompt.trim().length > 0;

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canAdd) {
      e.preventDefault();
      onSubmit({ label: label.trim(), prompt: prompt.trim() });
    }
    if (e.key === 'Escape') onCancel();
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">New action</p>
      <div className="space-y-1">
        <label htmlFor={labelId} className="text-xs font-medium text-muted-foreground block">
          Label
        </label>
        <Input
          id={labelId}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. Action Items"
          className="h-8"
          autoFocus
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={promptId} className="text-xs font-medium text-muted-foreground block">
          User message
        </label>
        <Textarea
          id={promptId}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. What are the pending tasks for me and the customer?"
          rows={3}
          className="max-h-40 text-sm"
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          <X className="h-3.5 w-3.5" />
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!canAdd}
          onClick={() => onSubmit({ label: label.trim(), prompt: prompt.trim() })}
        >
          Add action
        </Button>
      </div>
    </div>
  );
}
