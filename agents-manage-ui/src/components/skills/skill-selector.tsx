import type { CheckedState } from '@radix-ui/react-checkbox';
import { GripVertical, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import NextLink from 'next/link';
import { useParams } from 'next/navigation';
import { type FC, useState } from 'react';
import type { AgentNodeData } from '@/components/agent/configuration/node-types';
import { ComponentDropdown } from '@/components/agent/sidepane/nodes/component-selector/component-dropdown';
import { ComponentHeader } from '@/components/agent/sidepane/nodes/component-selector/component-header';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ExternalLink } from '@/components/ui/external-link';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DOCS_BASE_URL } from '@/constants/theme';
import { useAgentStore } from '@/features/agent/state/use-agent-store';
import { cn } from '@/lib/utils';

interface SkillSelection {
  id: string;
  index: number;
  alwaysLoaded?: boolean;
}

interface SkillSelectorProps {
  selectedSkills: AgentNodeData['skills'];
  onChange: (skills: SkillSelection[]) => void;
  error?: string;
}

export function reorderSkills(
  skills: SkillSelection[],
  fromId: SkillSelection['id'],
  toId: SkillSelection['id']
): SkillSelection[] {
  if (fromId === toId) {
    return skills;
  }
  const current = [...skills];
  const fromIndex = current.findIndex((p) => p.id === fromId);
  const toIndex = current.findIndex((p) => p.id === toId);
  if (fromIndex === -1 || toIndex === -1) {
    return skills;
  }
  const [moved] = current.splice(fromIndex, 1);
  current.splice(toIndex, 0, moved);
  return current.map((skill, index) => ({ ...skill, index }));
}

export function updateSkillAlwaysLoaded(
  skills: SkillSelection[],
  id: SkillSelection['id'],
  alwaysLoaded: boolean
): SkillSelection[] {
  return skills.map((skill) => (skill.id === id ? { ...skill, alwaysLoaded } : skill));
}

export const SkillSelector: FC<SkillSelectorProps> = ({ selectedSkills = [], onChange, error }) => {
  'use memo';
  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();
  const [draggingId, setDraggingId] = useState('');
  const [dragOverId, setDragOverId] = useState('');
  const availableSkills = useAgentStore((state) => state.availableSkills);

  const handleDrop = (targetId: string) => {
    if (!draggingId) return;
    const next = reorderSkills(selectedSkills, draggingId, targetId);
    onChange(next);
    setDraggingId('');
    setDragOverId('');
  };

  const handleToggle = (id: string) => {
    const newSelection = selectedSkills.some((skill) => skill.id === id)
      ? selectedSkills.filter((skill) => skill.id !== id)
      : [
          ...selectedSkills,
          // biome-ignore lint/style/noNonNullAssertion: always exist
          availableSkills.find((skill) => skill.id === id)!,
        ];
    onChange(newSelection.map((skill, index) => ({ ...skill, index })));
  };

  const handleAlwaysLoadedChange = (id: string, checked: CheckedState) => {
    const nextChecked = checked === 'indeterminate' ? true : checked;
    onChange(updateSkillAlwaysLoaded(selectedSkills, id, nextChecked));
  };

  return (
    <div className="space-y-2">
      <ComponentHeader label="Skill Configuration" count={selectedSkills.length} />
      <ComponentDropdown
        selectedComponents={selectedSkills.map((skill) => skill.id)}
        handleToggle={handleToggle}
        availableComponents={availableSkills}
        placeholder="Select skills..."
        emptyStateMessage="No skills found."
        commandInputPlaceholder="Search skills..."
      />
      {selectedSkills.length > 0 && (
        <div className="border rounded-md text-xs">
          <div className="flex gap-2 px-3 py-2.5 font-medium text-muted-foreground rounded-t-md">
            Skill
            <Tooltip>
              <TooltipTrigger asChild>
                {/* use span instead of button */}
                <span className="cursor-help ml-auto">Always loaded</span>
              </TooltipTrigger>
              <TooltipContent>
                When enabled, this skill is included in every prompt. Disable to load it on demand.
                <ExternalLink
                  href={`${DOCS_BASE_URL}/visual-builder/skills#always-loaded-and-on-demand-skills`}
                  className="text-xs normal-case inline"
                >
                  Learn more
                </ExternalLink>
              </TooltipContent>
            </Tooltip>
          </div>
          {selectedSkills.map((skill) => (
            <li
              key={skill.id}
              className={cn(
                'cursor-pointer flex items-center gap-2 text-muted-foreground px-3 py-2 transition-colors border-t',
                dragOverId ? dragOverId === skill.id && 'bg-muted/30' : 'hover:bg-muted/30'
              )}
              draggable
              data-id={skill.id}
              onDragStart={(event) => {
                setDraggingId(event.currentTarget.dataset.id as string);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOverId(event.currentTarget.dataset.id as string);
              }}
              onDragLeave={() => setDragOverId('')}
              onDrop={(event) => {
                handleDrop(event.currentTarget.dataset.id as string);
              }}
              onDragEnd={() => {
                setDraggingId('');
                setDragOverId('');
              }}
            >
              <div className="flex items-center">
                {`${skill.index + 1}.`}
                <GripVertical className="size-4" />
              </div>
              <div className="grow">
                <div className="text-sm text-foreground font-medium line-clamp-1">{skill.id}</div>
                <div className="line-clamp-1">{skill.description}</div>
              </div>
              <Checkbox
                checked={skill.alwaysLoaded}
                onCheckedChange={(checked) => handleAlwaysLoadedChange(skill.id, checked)}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="-mr-2"
                    aria-label="Skill options"
                  >
                    <MoreVertical />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <NextLink href={`/${tenantId}/projects/${projectId}/skills/${skill.id}/edit`}>
                      <Pencil />
                      Edit
                    </NextLink>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    data-id={skill.id}
                    onClick={(event) => {
                      handleToggle(event.currentTarget.dataset.id as string);
                    }}
                  >
                    <Trash2 />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
};
