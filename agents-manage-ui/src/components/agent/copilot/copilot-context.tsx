'use client';

import type { AIChatFunctions } from '@inkeep/agents-ui/types';
import { createContext, type ReactNode, type RefObject, useContext, useRef, useState } from 'react';

import { useRuntimeConfig } from '@/contexts/runtime-config-context';

interface CopilotContextHeaders {
  messageId?: string;
  conversationId?: string;
}

interface CopilotContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  isStreaming: boolean;
  setIsStreaming: (streaming: boolean) => void;
  chatFunctionsRef?: RefObject<AIChatFunctions | null>;
  openCopilot: () => void;
  dynamicHeaders: CopilotContextHeaders;
  setDynamicHeaders: (headers: CopilotContextHeaders) => void;
  hasCopilotConfigured: boolean;
}

const CopilotContext = createContext<CopilotContextValue | null>(null);

export function CopilotProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const chatFunctionsRef = useRef<AIChatFunctions | null>(null);
  const [dynamicHeaders, setDynamicHeaders] = useState<CopilotContextHeaders>({});

  const {
    PUBLIC_INKEEP_COPILOT_AGENT_ID,
    PUBLIC_INKEEP_COPILOT_PROJECT_ID,
    PUBLIC_INKEEP_COPILOT_TENANT_ID,
  } = useRuntimeConfig();
  const hasCopilotConfigured = !!(
    PUBLIC_INKEEP_COPILOT_AGENT_ID &&
    PUBLIC_INKEEP_COPILOT_PROJECT_ID &&
    PUBLIC_INKEEP_COPILOT_TENANT_ID
  );

  if (!hasCopilotConfigured) {
    console.warn('Copilot is not configured.');
  }

  const openCopilot = () => setIsOpen(true);

  return (
    <CopilotContext.Provider
      value={{
        isOpen,
        setIsOpen,
        isStreaming,
        setIsStreaming,
        chatFunctionsRef,
        openCopilot,
        dynamicHeaders,
        setDynamicHeaders,
        hasCopilotConfigured,
      }}
    >
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
