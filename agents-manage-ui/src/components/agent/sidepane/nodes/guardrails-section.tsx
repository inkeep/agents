import { ChevronRight } from 'lucide-react';
import { useParams } from 'next/navigation';
import { type FC, type ReactNode, useState } from 'react';
import { useWatch } from 'react-hook-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { useFullAgentFormContext } from '@/contexts/full-agent-form';
import { useArtifactComponentsQuery } from '@/lib/query/artifact-components';
import { useDataComponentsQuery } from '@/lib/query/data-components';
import { createLookup } from '@/lib/utils';
import { SectionHeader } from '../section';
import { ComponentSelector } from './component-selector/component-selector';

const SECTION_DESCRIPTION =
  'What this sub agent can emit, and the rules its responses must satisfy.';

const REQUIRE_HINT =
  'Click a selected component or artifact to require it. Required items are highlighted and must appear in every response.';

const ON_VIOLATION_OPTIONS: SelectOption[] = [
  { value: 'reject', label: 'Reject' },
  { value: 'warn', label: 'Warn' },
];

const SET_DIRTY = { shouldDirty: true, shouldValidate: true } as const;

interface SelectOption {
  value: string;
  label: string;
}

type ComponentLookup = Record<string, { id: string; name: string; description?: string | null }>;

function pluralize(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** Narrow an unknown form value to a clean string[]. */
function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** Resolve component ids to their display names, dropping ids that no longer exist. */
function resolveNames(ids: string[], lookup: Record<string, { name: string }>): string[] {
  return ids.map((id) => lookup[id]?.name).filter((name): name is string => Boolean(name));
}

/** Toggle a value in/out of a list. */
function toggleInArray(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** One label-and-control row inside the rules card. */
function GuardrailRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <FormItem className="gap-1.5 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="grid gap-1">
          <FormLabel>{label}</FormLabel>
          {description ? <FormDescription>{description}</FormDescription> : null}
        </div>
        {children}
      </div>
      <FormMessage />
    </FormItem>
  );
}

/** A counted multi-select inventory field whose chips toggle the require state. */
function InventoryField({
  label,
  componentLookup,
  value,
  onChange,
  requiredComponents,
  onComponentClick,
  emptyStateMessage,
  emptyStateActionText,
  emptyStateActionHref,
  placeholder,
  commandInputPlaceholder,
}: {
  label: string;
  componentLookup: ComponentLookup;
  value: string[];
  onChange: (value: string[]) => void;
  requiredComponents: string[];
  onComponentClick: (id: string) => void;
  emptyStateMessage: string;
  emptyStateActionText: string;
  emptyStateActionHref: string;
  placeholder: string;
  commandInputPlaceholder: string;
}) {
  return (
    <FormItem>
      <div className="flex gap-1">
        <FormLabel>{label}</FormLabel>
        <Badge variant="count">{value.length}</Badge>
      </div>
      <ComponentSelector
        componentLookup={componentLookup}
        selectedComponents={value}
        onSelectionChange={onChange}
        requiredComponents={requiredComponents}
        onComponentClick={onComponentClick}
        emptyStateMessage={emptyStateMessage}
        emptyStateActionText={emptyStateActionText}
        emptyStateActionHref={emptyStateActionHref}
        placeholder={placeholder}
        commandInputPlaceholder={commandInputPlaceholder}
      />
      <FormMessage />
    </FormItem>
  );
}

interface GuardrailsSectionProps {
  nodeId: string;
}

export const GuardrailsSection: FC<GuardrailsSectionProps> = ({ nodeId }) => {
  const form = useFullAgentFormContext();
  const [isOpen, setIsOpen] = useState(false);
  const [subAgent, allSubAgents] = useWatch({
    control: form.control,
    name: [`subAgents.${nodeId}`, 'subAgents'],
  });
  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();
  const { data: artifactComponents } = useArtifactComponentsQuery();
  const { data: dataComponents } = useDataComponentsQuery();
  const path = <K extends string>(key: K) => `subAgents.${nodeId}.${key}` as const;

  if (!subAgent) {
    return null;
  }

  const dataComponentsById = createLookup(dataComponents);
  const artifactComponentsById = createLookup(artifactComponents);
  const contract = subAgent.outputContract;

  const hasTransferTargets = Object.values(allSubAgents ?? {}).some(
    (sa) => Boolean(sa?.id) && sa.id !== subAgent.id
  );

  // Components and Artifacts are symmetric: each is a require-aware inventory field
  // whose chips toggle membership in the matching outputContract.require* list.
  const inventories = [
    {
      field: 'dataComponents',
      requireField: 'requireComponent',
      label: 'Components',
      lookup: dataComponentsById,
      emptyStateMessage: 'No components found.',
      emptyStateActionText: 'Create component',
      emptyStateActionHref: `/${tenantId}/projects/${projectId}/components/new`,
      placeholder: 'Select components...',
      commandInputPlaceholder: 'Search components...',
    },
    {
      field: 'artifactComponents',
      requireField: 'requireArtifact',
      label: 'Artifacts',
      lookup: artifactComponentsById,
      emptyStateMessage: 'No artifacts found.',
      emptyStateActionText: 'Create artifact',
      emptyStateActionHref: `/${tenantId}/projects/${projectId}/artifacts/new`,
      placeholder: 'Select artifacts...',
      commandInputPlaceholder: 'Search artifacts...',
    },
  ] as const;

  const structuredOnly = contract?.allowText === false;
  const requirementCount =
    asStringArray(contract?.requireComponent).length +
    asStringArray(contract?.requireArtifact).length +
    (contract?.requireTransfer ? 1 : 0);

  const inventoryParts: string[] = [];
  const dataCount = asStringArray(subAgent.dataComponents).length;
  const artifactCount = asStringArray(subAgent.artifactComponents).length;
  if (dataCount > 0) inventoryParts.push(pluralize(dataCount, 'component'));
  if (artifactCount > 0) inventoryParts.push(pluralize(artifactCount, 'artifact'));
  const inventorySummary =
    inventoryParts.length > 0 ? inventoryParts.join(' · ') : 'No components or artifacts';

  const ruleParts: string[] = [];
  if (structuredOnly) ruleParts.push('Text-free');
  if (requirementCount > 0) ruleParts.push(pluralize(requirementCount, 'requirement'));
  const rulesSummary = ruleParts.length > 0 ? ruleParts.join(' · ') : 'No response restrictions';

  return (
    <div className="space-y-4">
      <SectionHeader title="Guardrails" description={SECTION_DESCRIPTION} />
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full flex items-center justify-between gap-4 rounded-lg border bg-background p-4 text-left transition-colors hover:border-muted-foreground/30"
      >
        <div className="space-y-0.5 min-w-0">
          <div className="text-sm truncate">{inventorySummary}</div>
          <div className="text-sm text-muted-foreground truncate">{rulesSummary}</div>
        </div>
        <span className="flex items-center gap-1 text-sm text-muted-foreground shrink-0">
          Configure
          <ChevronRight className="size-4" />
        </span>
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Guardrails</DialogTitle>
            <DialogDescription>{SECTION_DESCRIPTION}</DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">{REQUIRE_HINT}</p>

            {inventories.map((inv) => {
              const requiredNames = asStringArray(contract?.[inv.requireField]);
              return (
                <FormField
                  key={inv.field}
                  control={form.control}
                  name={path(inv.field)}
                  render={({ field }) => {
                    const ids = asStringArray(field.value);
                    const requiredIds = ids.filter((id) =>
                      requiredNames.includes(inv.lookup[id]?.name ?? '')
                    );
                    const setRequired = (names: string[]) =>
                      form.setValue(
                        path(`outputContract.${inv.requireField}`),
                        names.length > 0 ? names : undefined,
                        SET_DIRTY
                      );
                    return (
                      <InventoryField
                        label={inv.label}
                        componentLookup={inv.lookup}
                        value={ids}
                        onChange={(nextIds) => {
                          field.onChange(nextIds);
                          const stillSelected = new Set(resolveNames(nextIds, inv.lookup));
                          const pruned = requiredNames.filter((name) => stillSelected.has(name));
                          if (pruned.length !== requiredNames.length) {
                            setRequired(pruned);
                          }
                        }}
                        requiredComponents={requiredIds}
                        onComponentClick={(id) => {
                          const name = inv.lookup[id]?.name;
                          if (name) {
                            setRequired(toggleInArray(requiredNames, name));
                          }
                        }}
                        emptyStateMessage={inv.emptyStateMessage}
                        emptyStateActionText={inv.emptyStateActionText}
                        emptyStateActionHref={inv.emptyStateActionHref}
                        placeholder={inv.placeholder}
                        commandInputPlaceholder={inv.commandInputPlaceholder}
                      />
                    );
                  }}
                />
              );
            })}

            <FormField
              control={form.control}
              name={path('outputContract.allowText')}
              render={({ field }) => (
                <FormItem className="gap-1.5">
                  <div className="flex items-start gap-2">
                    <FormControl>
                      <Checkbox
                        checked={field.value !== false}
                        onCheckedChange={(checked) => {
                          form.setValue(
                            path('outputContract.allowText'),
                            checked !== false,
                            SET_DIRTY
                          );
                        }}
                      />
                    </FormControl>
                    <div className="grid gap-1">
                      <FormLabel>Include text</FormLabel>
                      <FormDescription>
                        When unchecked, this sub agent can't emit free text — only the components
                        and artifacts above, transfers, or tool calls.
                      </FormDescription>
                    </div>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />
            <div className="divide-y overflow-hidden rounded-lg border">
              {hasTransferTargets && (
                <FormField
                  control={form.control}
                  name={path('outputContract.requireTransfer')}
                  render={({ field }) => (
                    <GuardrailRow
                      label="Require transfer"
                      description="Every response must hand off to another sub agent."
                    >
                      <FormControl>
                        <Switch
                          checked={field.value === true}
                          onCheckedChange={(checked) => {
                            form.setValue(
                              path('outputContract.requireTransfer'),
                              checked,
                              SET_DIRTY
                            );
                          }}
                        />
                      </FormControl>
                    </GuardrailRow>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name={path('outputContract.onViolation')}
                render={({ field }) => (
                  <GuardrailRow
                    label="On violation"
                    description="What happens when a rule is broken."
                  >
                    <Select
                      value={typeof field.value === 'string' ? field.value : undefined}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger className="w-52">
                          <SelectValue placeholder="Reject" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ON_VIOLATION_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </GuardrailRow>
                )}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button>Done</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
