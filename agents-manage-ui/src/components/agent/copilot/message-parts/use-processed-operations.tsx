import type { Message } from '@inkeep/agents-ui/types';
import { useEffect, useRef, useState } from 'react';

// Extract and group operations by type for better UX
export function useProcessedOperations(parts: Message['parts']) {
  const [operations, setOperations] = useState<any[]>([]);
  const [textContent, setTextContent] = useState('');
  const [artifacts, setArtifacts] = useState<any[]>([]);

  // Use refs to track seen items - refs don't cause closure issues
  const seenOperationKeys = useRef(new Set<string>());
  const seenArtifactKeys = useRef(new Set<string>());

  // Reset tracking on initial mount to avoid stale data
  useEffect(() => {
    seenOperationKeys.current.clear();
    seenArtifactKeys.current.clear();
    setOperations([]);
    setArtifacts([]);
  }, []); // Only run once on mount

  useEffect(() => {
    // Process only NEW operations and artifacts
    const newOps: any[] = [];
    const newArts: any[] = [];
    let textBuilder = '';

    for (const part of parts) {
      if (part.type === 'data-artifact') {
        const key = part.data.artifactId || part.data.name;
        if (!seenArtifactKeys.current.has(key)) {
          seenArtifactKeys.current.add(key);
          newArts.push(part.data);
        }
      } else if (part.type === 'text') {
        textBuilder += part.text || '';
      } else if (part.type === 'data-operation' || part.type === 'data-summary') {
        const key = part.data.type;
        if (!seenOperationKeys.current.has(key)) {
          seenOperationKeys.current.add(key);
          newOps.push(part.data);
        }
      }
    }

    // Only update if we have new operations
    if (newOps.length > 0) {
      setOperations((prev) => [...prev, ...newOps]);
    }

    // Only update if we have new artifacts
    if (newArts.length > 0) {
      setArtifacts((prev) => [...prev, ...newArts]);
    }

    // Always update text content
    setTextContent(textBuilder);
  }, [parts]); // Refs don't need to be dependencies

  return { operations, textContent, artifacts };
}
