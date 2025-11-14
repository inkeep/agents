'use client';

import type { AIChatFunctions } from '@inkeep/agents-ui/types';
import { createContext, type ReactNode, type RefObject, useContext, useRef, useState } from 'react';

interface CopilotContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  chatFunctionsRef: RefObject<AIChatFunctions | null>;
  openCopilot: () => void;
}

const CopilotContext = createContext<CopilotContextValue | null>(null);

export function CopilotProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const chatFunctionsRef = useRef<AIChatFunctions | null>(null);

  const openCopilot = () => setIsOpen(true);

  return (
    <CopilotContext.Provider value={{ isOpen, setIsOpen, chatFunctionsRef, openCopilot }}>
      {children}
    </CopilotContext.Provider>
  );
}

export function useCopilotContext() {
  const context = useContext(CopilotContext);
  if (!context) {
    throw new Error('useCopilotContext must be used within CopilotProvider');
  }
  return context;
}
