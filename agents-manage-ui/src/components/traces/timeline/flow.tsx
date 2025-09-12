import { ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function Flow({ from, to }: { from: string; to: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Badge variant="code" className=" ">
        {from}
      </Badge>
      <ArrowRight className="h-4 w-4 " />
      <Badge variant="code" className=" ">
        {to}
      </Badge>
    </div>
  );
}
