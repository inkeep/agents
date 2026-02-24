'use client';

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Badge } from '@/components/ui/badge';

interface SchemaOverrideBadgeProps {
  schema: unknown;
}

export function SchemaOverrideBadge({ schema }: SchemaOverrideBadgeProps) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const badgeRef = useRef<HTMLSpanElement>(null);

  const showFromMouse = (e: React.MouseEvent) => {
    setPos({ x: e.clientX, y: e.clientY });
    setIsVisible(true);
  };

  const showFromFocus = () => {
    if (badgeRef.current) {
      const rect = badgeRef.current.getBoundingClientRect();
      setPos({ x: rect.left, y: rect.bottom + 4 });
    }
    setIsVisible(true);
  };

  return (
    <>
      <Badge
        ref={badgeRef}
        variant="violet"
        className="mt-1 cursor-default uppercase"
        tabIndex={0}
        onMouseEnter={showFromMouse}
        onMouseMove={showFromMouse}
        onMouseLeave={() => setIsVisible(false)}
        onFocus={showFromFocus}
        onBlur={() => setIsVisible(false)}
        aria-label="Schema modified — focus or hover to preview"
      >
        Modified
      </Badge>
      {isVisible &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              left: pos.x + 12,
              top: pos.y + 12,
              zIndex: 9999,
              pointerEvents: 'none',
            }}
            className="bg-popover text-popover-foreground rounded-md border shadow-md p-2 max-w-xs"
            role="tooltip"
          >
            <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-mono">
              Schema
            </div>
            <pre className="text-xs overflow-auto max-h-40 whitespace-pre-wrap">
              {JSON.stringify(schema, null, 2)}
            </pre>
          </div>,
          document.body
        )}
    </>
  );
}
