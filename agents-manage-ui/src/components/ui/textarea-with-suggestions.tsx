import { useEffect, useMemo, useRef, useState } from 'react';
import getCaretCoordinates from 'textarea-caret'; // npm i textarea-caret
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'; // shadcn/ui
import { Textarea } from '@/components/ui/textarea'; // shadcn/ui

// Demo data – replace with your own async fetch if needed
const PEOPLE = [
  { id: '1', handle: 'alice', name: 'Alice Johnson' },
  { id: '2', handle: 'bob', name: 'Bob Smith' },
  { id: '3', handle: 'charlie', name: 'Charlie P.' },
  { id: '4', handle: 'dima', name: 'Dimitri Postolov' },
  { id: '5', handle: 'eve', name: 'Eve Torres' },
];

// Utility: returns the trigger token (e.g. "@ali") before the caret, or null
function getTriggerToken(text: string, caret: number, triggers = ['@', '/', '#']) {
  // Scan left from caret until whitespace or beginning
  let i = caret - 1;
  while (i >= 0 && !/\s/.test(text[i])) i--;
  const start = i + 1;
  const token = text.slice(start, caret);
  if (!token) return null;
  // Ensure it begins with an allowed trigger and has at least 1 char after trigger
  if (triggers.some((t) => token.startsWith(t)) && token.length >= 1)
    return {
      token,
      start,
      end: caret,
    };
  return null;
}

// Replace the token range with the chosen replacement and move caret accordingly
function replaceRange(
  text: string,
  start: number,
  end: number,
  replacement: string
): { next: string; nextCaret: number } {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const next = before + replacement + after;
  const nextCaret = (before + replacement).length;
  return { next, nextCaret };
}

export function TextareaWithSuggestions() {
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const [range, setRange] = useState<{ start: number; end: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Which trigger are we handling? For demo, only "@" (mentions)
  const suggestions = useMemo(() => {
    if (!range) return [] as typeof PEOPLE;
    const token = value.slice(range.start, range.end); // e.g. "@al"
    if (!token.startsWith('@')) return [] as typeof PEOPLE;
    const q = token.slice(1).toLowerCase();
    const filtered = PEOPLE.filter(
      (p) => p.handle.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
    ).slice(0, 8);
    return filtered;
  }, [range, value]);

  // Compute floating panel position at the current caret
  const updateAnchorFromCaret = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const caret = ta.selectionStart ?? 0;
    const tokenInfo = getTriggerToken(value, caret, ['@']); // only @ for this demo
    if (!tokenInfo) {
      setOpen(false);
      setRange(null);
      return;
    }

    const coords = getCaretCoordinates(ta, tokenInfo.end); // relative to the textarea
    const rect = ta.getBoundingClientRect();

    // Position the panel near the caret, accounting for scroll
    const top = ta.scrollTop + coords.top + 24; // put list below the caret
    const left = ta.scrollLeft + coords.left;

    setAnchor({ top, left });
    setRange({ start: tokenInfo.start, end: tokenInfo.end });
    setOpen(true);
  };

  // Recompute on input, caret move, scroll, or resize
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;

    const handleInput = () => updateAnchorFromCaret();
    const handleKeyUp = () => updateAnchorFromCaret();
    const handleClick = () => updateAnchorFromCaret();
    const handleScroll = () => updateAnchorFromCaret();

    ta.addEventListener('input', handleInput);
    ta.addEventListener('keyup', handleKeyUp);
    ta.addEventListener('click', handleClick);
    ta.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', handleScroll);

    return () => {
      ta.removeEventListener('input', handleInput);
      ta.removeEventListener('keyup', handleKeyUp);
      ta.removeEventListener('click', handleClick);
      ta.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const onSelect = (item: { handle: string; name: string }) => {
    if (!range) return;
    const replacement = `@${item.handle} `; // trailing space to finish the mention
    const { next, nextCaret } = replaceRange(value, range.start, range.end, replacement);
    setValue(next);
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(nextCaret, nextCaret);
      }
    });
    setOpen(false);
    setRange(null);
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      // Accept the active suggestion only if list is open
      e.preventDefault();
      const item = suggestions[activeIndex];
      if (item) onSelect(item);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="relative max-w-2xl space-y-2">
      <label className="text-sm font-medium text-muted-foreground">Type "@" to mention</label>

      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Try typing: @di"
        className="min-h-[140px] pr-10"
      />

      {/* Floating suggestion panel anchored to caret */}
      {open && anchor && (
        <div
          ref={panelRef}
          className="absolute z-50 w-72 rounded-2xl border bg-background/95 p-1 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-background/60"
          style={{ top: anchor.top, left: anchor.left }}
        >
          <Command>
            <CommandInput placeholder="Search people…" className="h-9" />
            <CommandList>
              <CommandEmpty>No results.</CommandEmpty>
              <CommandGroup heading="People">
                {suggestions.map((p, idx) => (
                  <CommandItem
                    key={p.id}
                    value={p.handle}
                    onSelect={() => onSelect(p)}
                    className={
                      idx === activeIndex
                        ? 'aria-selected:bg-accent aria-selected:text-accent-foreground'
                        : ''
                    }
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border text-sm">
                        @{p.handle[0].toUpperCase()}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium">@{p.handle}</span>
                        <span className="text-xs text-muted-foreground">{p.name}</span>
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Tips: Type <kbd className="rounded border bg-muted px-1">@</kbd> to open the list, use ↑/↓
        to navigate, <kbd className="rounded border bg-muted px-1">Enter</kbd> to insert, and{' '}
        <kbd className="rounded border bg-muted px-1">Esc</kbd> to close.
      </p>
    </div>
  );
}
