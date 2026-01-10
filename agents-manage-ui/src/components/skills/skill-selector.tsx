import { GripVertical } from 'lucide-react';
import { type FC, useState } from 'react';
import { ComponentDropdown } from '@/components/agent/sidepane/nodes/component-selector/component-dropdown';
import { ComponentHeader } from '@/components/agent/sidepane/nodes/component-selector/component-header';
import { Checkbox } from '@/components/ui/checkbox';
import { ExternalLink } from '@/components/ui/external-link';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DOCS_BASE_URL } from '@/constants/page-descriptions';
import type { Skill } from '@/lib/types/skills';
import { cn } from '@/lib/utils';

interface SkillSelection {
  id: string;
  index: number;
}

interface SkillSelectorProps {
  skillLookup: Record<string, Skill>;
  selectedSkills: SkillSelection[];
  onChange: (skills: SkillSelection[]) => void;
  error?: string;
}

export function reorderSkills(
  skills: SkillSelection[],
  fromId: string,
  toId: string
): SkillSelection[] {
  if (fromId === toId) return skills;
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

export const SkillSelector: FC<SkillSelectorProps> = ({
  skillLookup,
  selectedSkills,
  onChange,
  error,
}) => {
  'use memo';
  const [draggingId, setDraggingId] = useState('');
  const [dragOverId, setDragOverId] = useState('');

  const orderedSkills = [...selectedSkills].sort((a, b) => a.index - b.index);

  const handleDrop = (targetId: string) => {
    if (!draggingId) return;
    const next = reorderSkills(orderedSkills, draggingId, targetId);
    onChange(next);
    setDraggingId('');
    setDragOverId('');
  };

  const handleToggle = (id: string) => {
    const newSelection = selectedSkills.some((skill) => skill.id === id)
      ? selectedSkills.filter((skill) => skill.id !== id)
      : [...selectedSkills, { id, index: selectedSkills.length }];
    onChange(newSelection);
  };

  const skills = selectedSkills.map((skill) => skill.id);

  return (
    <div className="space-y-2">
      <ComponentHeader label="Skill Configuration" count={skills.length} />
      <ComponentDropdown
        selectedComponents={skills}
        handleToggle={handleToggle}
        availableComponents={Object.values(skillLookup)}
        placeholder="Select skills..."
        emptyStateMessage="No skills found."
        commandInputPlaceholder="Search skills..."
      />
      {orderedSkills.length > 0 && (
        <div className="border rounded-md">
          <div className="grid grid-cols-[1fr_auto] gap-4 px-3 py-2.5 text-xs font-medium text-muted-foreground rounded-t-md">
            <div>Skill</div>
            <Tooltip>
              <TooltipTrigger className="cursor-help">On demand</TooltipTrigger>
              <TooltipContent>
                This skill is activated automatically when required and is not included in every
                prompt.
                <ExternalLink
                  href={`${DOCS_BASE_URL}/visual-builder/skills#TODO`}
                  className="text-xs normal-case"
                >
                  Learn more
                </ExternalLink>
              </TooltipContent>
            </Tooltip>
          </div>
          {orderedSkills.map((skill, index, array) => (
            <li
              key={skill.id}
              className={cn(
                'cursor-pointer grid grid-cols-[1fr_auto] gap-4 px-3 py-2 hover:bg-muted/30 transition-colors border-t',
                dragOverId === skill.id &&
                  // for last highlight border bottom
                  (skill === array.at(-1) ? 'border-b border-b-primary' : 'border-primary')
              )}
              draggable
              onDragStart={() => setDraggingId(skill.id)}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverId(skill.id);
              }}
              onDragLeave={() => setDragOverId('')}
              onDrop={() => handleDrop(skill.id)}
              onDragEnd={() => {
                setDraggingId('');
                setDragOverId('');
              }}
            >
              <div className="flex items-center gap-2">
                <GripVertical className="size-4 text-muted-foreground" />
                <div className="text-sm font-medium">
                  {skillLookup[skill.id].name}{' '}
                  <span className="text-xs text-muted-foreground">(#{index + 1})</span>{' '}
                </div>
              </div>
              <Checkbox />
            </li>
          ))}
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
};
