import { GripVertical, X } from 'lucide-react';
import { type FC, type MouseEvent, useState } from 'react';
import { ComponentDropdown } from '@/components/agent/sidepane/nodes/component-selector/component-dropdown';
import { ComponentHeader } from '@/components/agent/sidepane/nodes/component-selector/component-header';
import { Button } from '@/components/ui/button';
import type { Skill } from '@/lib/types/skills';
import { cn } from '@/lib/utils';

type SkillSelection = {
  id: string;
  index: number;
};

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

  const handleRemove = (event: MouseEvent<HTMLButtonElement>) => {
    const id = event.currentTarget.dataset.id as string;
    const next = orderedSkills.filter((skill) => skill.id !== id);
    onChange(next.map((skill, idx) => ({ ...skill, index: idx })));
  };

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
      <ComponentHeader label="Skills" count={skills.length} />
      <ComponentDropdown
        selectedComponents={skills}
        handleToggle={handleToggle}
        availableComponents={Object.values(skillLookup)}
        placeholder="Select skills..."
        emptyStateMessage="No skills found."
        commandInputPlaceholder="Search skills..."
      />
      <ul className="space-y-2">
        {orderedSkills.map((skill, index) => (
          <li
            key={skill.id}
            className={cn(
              'group/skill cursor-pointer border rounded-md px-3 py-2 flex items-center justify-between gap-3 bg-background',
              dragOverId === skill.id && 'border-primary'
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
            <Button
              className="opacity-0 group-hover/skill:opacity-100"
              variant="ghost"
              size="icon-sm"
              data-id={skill.id}
              onClick={handleRemove}
            >
              <X />
            </Button>
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
};
