import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Badge } from '@/components/ui/badge';

interface SchemaOverrideBadgeProps {
  schema: unknown;
}

export function SchemaOverrideBadge({ schema }: SchemaOverrideBadgeProps) {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  return (
    <>
      <Badge
        variant="secondary"
        className="mt-1 text-xs cursor-default"
        onMouseEnter={(e) => {
          setMousePos({ x: e.clientX, y: e.clientY });
          setIsHovered(true);
        }}
        onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setIsHovered(false)}
      >
        schema overridden
      </Badge>
      {isHovered &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              left: mousePos.x + 12,
              top: mousePos.y + 12,
              zIndex: 9999,
              pointerEvents: 'none',
            }}
            className="bg-popover text-popover-foreground rounded-md border shadow-md p-2 max-w-xs"
          >
            <pre className="text-xs overflow-auto max-h-40 whitespace-pre-wrap">
              {JSON.stringify(schema, null, 2)}
            </pre>
          </div>,
          document.body
        )}
    </>
  );
}
