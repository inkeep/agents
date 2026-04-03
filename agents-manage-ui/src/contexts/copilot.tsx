'use client';

import type { AIChatFunctions } from '@inkeep/agents-ui/types';
import type { Dispatch, ReactNode, RefObject, SetStateAction } from 'react';
import { createContext, use, useRef, useState } from 'react';
import { useRuntimeConfig } from '@/contexts/runtime-config';

interface CopilotContextHeaders {
  messageId?: string;
  conversationId?: string;
}

interface CopilotContextValue {
  isOpen: boolean;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  isStreaming: boolean;
  setIsStreaming: Dispatch<SetStateAction<boolean>>;
  chatFunctionsRef: RefObject<AIChatFunctions | null>;
  openCopilot: () => void;
  dynamicHeaders: CopilotContextHeaders;
  setDynamicHeaders: Dispatch<SetStateAction<CopilotContextHeaders>>;
  isCopilotConfigured: boolean;
}

const CopilotContext = createContext<CopilotContextValue | null>(null);

export function CopilotProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const chatFunctionsRef = useRef<AIChatFunctions | null>(null);
  const [dynamicHeaders, setDynamicHeaders] = useState<CopilotContextHeaders>({});

  const { PUBLIC_INKEEP_COPILOT_APP_ID: copilotAppId } = useRuntimeConfig();
  const isCopilotConfigured = !!copilotAppId;

  if (!isCopilotConfigured) {
    console.warn('Copilot is not configured.');
  }

  return (
    <CopilotContext
      value={{
        isOpen,
        setIsOpen,
        isStreaming,
        setIsStreaming,
        chatFunctionsRef,
        openCopilot: () => setIsOpen(true),
        dynamicHeaders,
        setDynamicHeaders,
        isCopilotConfigured,
      }}
    >
      {children}
    </CopilotContext>
  );
}

export function useCopilotContext() {
  const context = use(CopilotContext);
  if (!context) {
    throw new Error('useCopilotContext must be used within a <CopilotProvider />');
  }
  return context;
}
