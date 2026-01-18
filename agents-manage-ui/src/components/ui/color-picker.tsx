import { Popover, PopoverContent, PopoverTrigger } from '@radix-ui/react-popover';
import { HexColorInput, HexColorPicker } from 'react-colorful';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ColorPickerInputProps {
  color: string;
  setColor: (color: string) => void;
  placeholder: string;
}

export function ColorPickerInput({ placeholder, color, setColor }: ColorPickerInputProps) {
  return (
    <div className="relative flex items-center flex-row max-w-full">
      <div className="absolute left-3 text-sm text-muted-foreground">#</div>
      <HexColorInput
        className={cn(
          'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
          'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive disabled:bg-muted',
          'pl-7 pr-12'
        )}
        color={color}
        onChange={setColor}
        placeholder={placeholder}
      />
      <div className="z-10 absolute right-3">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              aria-label="color picker"
              className="flex flex-row gap-2 rounded w-6 h-6"
              size="sm"
              variant="ghost"
              style={{ background: color }}
            >
              <span className="sr-only">Color picker</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="flex flex-row w-fit p-2">
            <HexColorPicker color={color} onChange={setColor} />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
