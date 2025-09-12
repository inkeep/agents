import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';

interface ComponentHeaderProps {
  label: string;
  count: number;
}

export function ComponentHeader({ label, count }: ComponentHeaderProps) {
  return (
    <div className="flex gap-2">
      <Label>{label}</Label>
      <Badge variant="code" className="border-none px-2 text-[10px] text-muted-foreground">
        {count}
      </Badge>
    </div>
  );
}
