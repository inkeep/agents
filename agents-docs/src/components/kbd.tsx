import { isMac } from '@/lib/isMac';

export function Kbd() {
  const modifier = isMac() ? '⌘' : 'ctrl';
  return (
    <kbd className="rounded-md bg-transparent px-1.5 space-x-0.5 font-semibold">
      <span>{modifier}</span>
      <span>k</span>
    </kbd>
  );
}
