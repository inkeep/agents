import { useEffect, useMemo, useRef, useState } from 'react';
// @ts-ignore - textarea-caret doesn't have types
import getCaretCoordinates from 'textarea-caret';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Textarea } from '@/components/ui/textarea';
import { getContextSuggestions } from '@/lib/context-suggestions';
import { useGraphStore } from '@/features/graph/state/use-graph-store';

// Utility: returns the trigger token (e.g., "{foo", "{{bar") before the caret, or null
function getTriggerToken(text: string, caret: number, triggers = ['@', '/', '#']) {
  // Scan left from caret until whitespace or beginning
  let i = caret - 1;
  while (i >= 0 && !/\s/.test(text[i])) i--;
  const start = i + 1;
  const token = text.slice(start, caret);
  if (!token) return null;

  // Check for single or double brace triggers
  if (token.startsWith('{')) {
    return {
      token,
      start,
      end: caret,
    };
  }

  // Check for other triggers
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
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const [range, setRange] = useState<{ start: number; end: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null!);
  const cmdRef = useRef<HTMLDivElement | null>(null);
  const contextConfig = useGraphStore((state) => state.metadata.contextConfig);

  const list = useMemo(() => {
    const contextVariables = JSON.parse(contextConfig.contextVariables || '{}');
    const requestContextSchema = JSON.parse(contextConfig.requestContextSchema || '{}');
    return getContextSuggestions({ requestContextSchema, contextVariables });
  }, [contextConfig]);

  // Which trigger are we handling? Both "{" and "{{" (mentions)
  const suggestions = useMemo<string[]>(() => {
    if (!range) return [];
    const ta = textareaRef.current;
    const token = ta.value.slice(range.start, range.end); // e.g. "{foo" or "{{foo"
    if (!token.startsWith('{')) return [];

    // Handle both single and double braces
    let query = '';
    if (token.startsWith('{{')) {
      query = token.slice(2).toLowerCase(); // Remove "{{"
    } else if (token.startsWith('{')) {
      query = token.slice(1).toLowerCase(); // Remove "{"
    }

    return list.filter((p) => p.toLowerCase().includes(query));
  }, [range, list]);

  console.log(suggestions);

  // Recompute on input, caret move, scroll, or resize
  useEffect(() => {
    const ta = textareaRef.current;
    // Compute floating panel position at the current caret
    const updateAnchorFromCaret = () => {
      const caret = ta.selectionStart ?? 0;
      const tokenInfo = getTriggerToken(ta.value, caret, ['{']); // only { for this demo
      if (!tokenInfo) {
        setOpen(false);
        setRange(null);
        return;
      }

      const coords = getCaretCoordinates(ta, tokenInfo.end); // relative to the textarea

      // Position the panel near the caret, accounting for scroll
      const top = ta.scrollTop + coords.top + 24; // put list below the caret
      const left = ta.scrollLeft + coords.left;

      setAnchor({ top, left });
      setRange({ start: tokenInfo.start, end: tokenInfo.end });
      setOpen(true);
    };

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
  }, []);

  const onSelect = (item: string) => {
    if (!range) return;

    // Determine if we started with single or double braces
    const token = textareaRef.current.value.slice(range.start, range.end);
    console.log({ token });
    let replacement = '';

    if (token.startsWith('{{')) {
      replacement = `{{${item}}}`; // Wrap in double braces
    } else if (token.startsWith('{')) {
      replacement = `{${item}}`; // Wrap in single braces
    }

    const { next, nextCaret } = replaceRange(
      textareaRef.current.value,
      range.start,
      range.end,
      replacement
    );

    // Update the textarea value
    textareaRef.current.value = next;

    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      ta.focus();
      ta.setSelectionRange(nextCaret, nextCaret);
    });
    setOpen(false);
    setRange(null);
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    const { key } = e;
    if (!open) return;

    if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter') {
      e.preventDefault();
      // Find the hidden input inside the command component
      const hiddenInput = cmdRef.current?.querySelector('input');
      if (hiddenInput) {
        // Temporarily focus the hidden input to enable cmdk navigation
        hiddenInput.focus();
        // Dispatch the key event
        const newEvent = new KeyboardEvent('keydown', {
          key,
          bubbles: true,
          cancelable: true,
        });
        hiddenInput.dispatchEvent(newEvent);
        // Return focus to textarea after a brief moment
        setTimeout(() => {
          textareaRef.current?.focus();
        }, 0);
      }
      return;
    }
    if (key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setRange(null);
    }
  };

  return (
    <div className="relative max-w-2xl space-y-2">
      <Textarea
        ref={textareaRef}
        onKeyDown={handleKeyDown}
        placeholder="Try typing: {req"
        className="min-h-[140px] pr-10"
      />

      {/* Floating suggestion panel anchored to caret */}
      {open && anchor && (
        <div
          className="absolute z-50 w-72 rounded-2xl border bg-background/95 p-1 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-background/60"
          style={{ top: anchor.top, left: anchor.left }}
        >
          <Command ref={cmdRef} className="focus:outline-none" tabIndex={-1}>
            <div className="hidden">
              <CommandInput />
            </div>
            <CommandList>
              <CommandEmpty>No variables were found.</CommandEmpty>
              <CommandGroup>
                {suggestions.map((p) => (
                  <CommandItem key={p} value={p} onSelect={onSelect}>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{p}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Tips: Type <kbd className="rounded border bg-muted px-1">&#123;</kbd> or{' '}
        <kbd className="rounded border bg-muted px-1">&#123;&#123;</kbd> to open the list, use ↑/↓
        to navigate, <kbd className="rounded border bg-muted px-1">Enter</kbd> to insert, and{' '}
        <kbd className="rounded border bg-muted px-1">Esc</kbd> to close.
      </p>
    </div>
  );
}
