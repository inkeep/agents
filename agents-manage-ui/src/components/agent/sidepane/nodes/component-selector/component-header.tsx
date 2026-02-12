import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';

interface ComponentHeaderProps {
  label: string;
  count: number;
}

export function ComponentHeader({ label, count }: ComponentHeaderProps) {
  'use memo';
  return (
    <div className="flex gap-2">
      <Label>{label}</Label>
      <Badge variant="count">{count}</Badge>
    </div>
  );
}
