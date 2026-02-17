'use client';

import type { AIChatFunctions } from '@inkeep/agents-ui/types';
import { createContext, type ReactNode, type RefObject, use, useRef, useState } from 'react';
import { useRuntimeConfig } from '@/contexts/runtime-config';

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
  isCopilotConfigured: boolean;
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
  const isCopilotConfigured = !!(
    PUBLIC_INKEEP_COPILOT_AGENT_ID &&
    PUBLIC_INKEEP_COPILOT_PROJECT_ID &&
    PUBLIC_INKEEP_COPILOT_TENANT_ID
  );

  if (!isCopilotConfigured) {
    console.warn('Copilot is not configured.');
  }

  const openCopilot = () => setIsOpen(true);

  return (
    <CopilotContext
      value={{
        isOpen,
        setIsOpen,
        isStreaming,
        setIsStreaming,
        chatFunctionsRef,
        openCopilot,
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
