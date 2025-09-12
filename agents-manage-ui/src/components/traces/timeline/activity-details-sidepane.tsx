import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ActivityDetailsSidePane({
  title,
  children,
  open,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className={`bg-background h-full flex flex-col py-4 transform transition-transform duration-300 ease-out ${
        open ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="flex-shrink-0">
        <div className="text-foreground text-md font-medium px-6 pb-4 flex items-center justify-between">
          <h3 className="text-md font-medium text-foreground">{title}</h3>
          <Button variant="ghost" size="icon-sm" onClick={onClose} className=" p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="pt-2 px-6 pb-6 flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-transparent dark:scrollbar-thumb-muted-foreground/50">
        {children}
      </div>
    </div>
  );
}
