import { GripVertical, Plus, X } from 'lucide-react';
import { useMemo, useState, type FC } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  return current.map((skill, idx) => ({ ...skill, index: idx }));
}

export const SkillSelector: FC<SkillSelectorProps> = ({
  skillLookup,
  selectedSkills,
  onChange,
  error,
}) => {
  const [pendingAdd, setPendingAdd] = useState('');
  const [draggingId, setDraggingId] = useState('');
  const [dragOverId, setDragOverId] = useState('');

  const orderedSkills = useMemo(
    () => [...selectedSkills].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)),
    [selectedSkills]
  );

  const availableSkills = useMemo(
    () =>
      Object.values(skillLookup).filter(
        (skill) => !orderedSkills.some((selected) => selected.id === skill.id)
      ),
    [skillLookup, orderedSkills]
  );

  const handleAdd = () => {
    if (!pendingAdd || pendingAdd === '__none') return;
    const next = [...orderedSkills, { id: pendingAdd, index: orderedSkills.length }];
    onChange(next);
    setPendingAdd('');
  };

  const handleRemove = (id: string) => {
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Skills</Label>
        <div className="flex items-center gap-2">
          <Select value={pendingAdd} onValueChange={setPendingAdd}>
            <SelectTrigger className="w-55">
              <SelectValue placeholder="Select skill" />
            </SelectTrigger>
            <SelectContent>
              {availableSkills.length ? (
                availableSkills.map((skill) => (
                  <SelectItem key={skill.id} value={skill.id}>
                    {skill.name}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="__none" disabled>
                  No available skills
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleAdd}
            disabled={!pendingAdd}
          >
            <Plus className="size-4" />
            Add
          </Button>
        </div>
      </div>
      {orderedSkills.length === 0 ? (
        <p className="text-sm text-muted-foreground">No skills attached.</p>
      ) : (
        <ul className="space-y-2">
          {orderedSkills.map((skill) => (
            <li
              key={skill.id}
              className={cn(
                'border rounded-md px-3 py-2 flex items-center justify-between gap-3 bg-background',
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
                  {skill.id}{' '}
                  <span className="text-xs text-muted-foreground">(#{skill.index + 1})</span>{' '}
                </div>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => handleRemove(skill.id)}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
};
