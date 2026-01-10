import { GripVertical } from 'lucide-react';
import { type FC, useState } from 'react';
import type { AgentNodeData } from '@/components/agent/configuration/node-types';
import { ComponentDropdown } from '@/components/agent/sidepane/nodes/component-selector/component-dropdown';
import { ComponentHeader } from '@/components/agent/sidepane/nodes/component-selector/component-header';
import { Checkbox } from '@/components/ui/checkbox';
import { ExternalLink } from '@/components/ui/external-link';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DOCS_BASE_URL } from '@/constants/page-descriptions';
import { cn } from '@/lib/utils';

interface SkillSelection {
  id: string;
  index: number;
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

export const SkillSelector: FC<SkillSelectorProps> = ({ selectedSkills = [], onChange, error }) => {
  'use memo';

  const [draggingId, setDraggingId] = useState('');
  const [dragOverId, setDragOverId] = useState('');

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
      : [...selectedSkills, { id, index: selectedSkills.length }];
    onChange(newSelection);
  };

  console.log(selectedSkills);

  return (
    <div className="space-y-2">
      <ComponentHeader label="Skill Configuration" count={selectedSkills.length} />
      <ComponentDropdown
        selectedComponents={selectedSkills.map((skill) => skill.id)}
        handleToggle={handleToggle}
        availableComponents={selectedSkills}
        placeholder="Select skills..."
        emptyStateMessage="No skills found."
        commandInputPlaceholder="Search skills..."
      />
      {selectedSkills.length > 0 && (
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
          {selectedSkills.map((skill, index, array) => (
            <li
              key={skill.id}
              className={cn(
                'cursor-pointer flex items-center gap-2 text-sm text-muted-foreground px-3 py-2 hover:bg-muted/30 transition-colors border-t',
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
              <div className="flex items-center">
                {index + 1}
                <GripVertical className="size-4" />
              </div>
              <div className="grow">
                <div className="text-foreground font-medium line-clamp-1">{skill.id}</div>
                <div className="text-xs line-clamp-1">
                  {/* DESCRIPTION EXIST */}
                  {skill.description}
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
