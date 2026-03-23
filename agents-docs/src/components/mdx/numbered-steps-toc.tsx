'use client';

import { useEffect } from 'react';

interface NumberedStepsTOCProps {
  stepIds: string[];
}

export function NumberedStepsTOC({ stepIds }: NumberedStepsTOCProps) {
  useEffect(() => {
    function applyStepNumbers() {
      const tocContainer = document.getElementById('nd-toc');
      if (!tocContainer) return false;

      let applied = 0;
      for (let i = 0; i < stepIds.length; i++) {
        const link = tocContainer.querySelector<HTMLAnchorElement>(`a[href="#${stepIds[i]}"]`);
        if (!link) continue;
        link.setAttribute('data-step-number', String(i + 1));
        link.classList.add('numbered-step-toc-item');
        applied++;
      }
      return applied > 0;
    }

    if (applyStepNumbers()) return;

    const observer = new MutationObserver(() => {
      if (applyStepNumbers()) {
        observer.disconnect();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      const tocContainer = document.getElementById('nd-toc');
      if (!tocContainer) return;
      for (const id of stepIds) {
        const link = tocContainer.querySelector<HTMLAnchorElement>(`a[href="#${id}"]`);
        if (!link) continue;
        link.removeAttribute('data-step-number');
        link.classList.remove('numbered-step-toc-item');
      }
    };
  }, [stepIds]);

  return null;
}
