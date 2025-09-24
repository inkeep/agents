'use client';

import {
  type InkeepBaseSettings,
  InkeepChatButton,
  type InkeepEmbeddedSearchAndChatFunctions,
  InkeepModalSearchAndChat,
  type InkeepSearchSettings,
  type ToolFunction,
} from '@inkeep/cxkit-react';
import { useEffect, useRef, useState } from 'react';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { detectedSalesSignal, salesSignalType } from './sales-escalation';
import { provideAnswerConfidenceSchema } from './support-escalation';

const validSalesSignalTypes: string[] = salesSignalType.options.map((option) => option.value);

const apiKey = process.env.NEXT_PUBLIC_INKEEP_API_KEY;

export function InkeepScript() {
  const [syncTarget, setSyncTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setSyncTarget(document.documentElement);
  }, []);

  const config = {
    baseSettings: {
      apiKey,
      primaryBrandColor: '#D5E5FF',
      organizationDisplayName: 'Inkeep',
      colorMode: {
        sync: syncTarget
          ? {
              target: syncTarget,
              attributes: ['class'],
              isDarkMode: (attrs: Record<string, string | null>) => !!attrs.class?.includes('dark'),
            }
          : undefined,
      },
      theme: {
        styles: [
          {
            key: 'chat-button',
            type: 'style',
            value: `
            .ikp-chat-button__container { z-index: var(--ikp-z-index-overlay); }
            [data-theme="light"] .ikp-chat-button__button {
              background-color: #D5E5FF !important;
              border: 1px solid #69A3FF !important;
              color: #231F20 !important;
              backdrop-filter: blur(10px) !important;
              -webkit-backdrop-filter: blur(10px) !important;
              box-shadow: 5px 6px 18px rgba(157, 194, 255, 0.20), 0 8px 32px rgba(0, 0, 0, 0.08) !important;
              transition: box-shadow 0.2s ease, background-color 0.2s ease, transform 0.2s ease !important;
            }
            [data-theme="light"] .ikp-chat-button__text { color: #231F20 !important; }
            [data-theme="light"].ikp-chat-button__button:hover {
              background-color: #C9DBFF !important;
              border-color: #69A3FF !important;
              box-shadow: 6px 8px 22px rgba(157, 194, 255, 0.24), 0 10px 36px rgba(0, 0, 0, 0.10) !important;
              transform: translateY(-1px);
            }
            [data-theme="light"].ikp-chat-button__button:focus-visible {
              box-shadow: 0 0 0 2px #FFFFFF, 0 0 0 4px #69A3FF !important;
            }`,
          },
        ],
      },
      transformSource: (source) => {
        const tabs = source.tabs || [];
        if (source.url.includes('docs.inkeep.com')) {
          tabs.push('Docs');
        }
        return {
          ...source,
          tabs,
        };
      },
    } satisfies InkeepBaseSettings,
    aiChatSettings: {
      aiAssistantAvatar: {
        light: '/logos/icon-black.svg',
        dark: '/logos/icon-light-blue.svg',
      },
      exampleQuestions: [
        'What sources are supported?',
        'Can I add Inkeep as a Slack bot?',
        "Who's in the Inkeep team?",
      ],
      getHelpOptions: [
        {
          name: 'Schedule a Demo',
          isPinnedToToolbar: true,
          icon: { builtIn: 'LuCalendar' as const },
          action: {
            type: 'open_link' as const,
            url: 'https://inkeep.com/demo?cta_id=docs_cxkit',
          },
        },
        {
          name: 'Contact us',
          isPinnedToToolbar: true,
          icon: { builtIn: 'IoChatbubblesOutline' as const },
          action: {
            type: 'open_link' as const,
            url: 'mailto:support@inkeep.com?subject=Question%20about%20inkeep',
          },
        },
      ],
      getTools: () => [
        {
          type: 'function',
          function: {
            name: 'detectSalesSignal',
            description:
              'Identify when users express interest in potentially purchasing a product.',
            parameters: zodToJsonSchema(detectedSalesSignal),
          },
          renderMessageButtons: ({ args }) => {
            if (args.type && validSalesSignalTypes.includes(args.type)) {
              return [
                {
                  label: 'Schedule a Demo',
                  icon: { builtIn: 'LuCalendar' as const },
                  action: {
                    type: 'open_link' as const,
                    url: 'https://inkeep.com/demo?cta_id=docs_cxkit',
                  },
                },
              ];
            }
            return [];
          },
        } as ToolFunction<{ type: string }>,
        {
          type: 'function',
          function: {
            name: 'provideAnswerConfidence',
            description:
              'Determine how confident the AI assistant was and whether or not to escalate to humans.',
            parameters: zodToJsonSchema(provideAnswerConfidenceSchema),
          },
          renderMessageButtons: ({ args }) => {
            const confidence = args.answerConfidence;
            if (['not_confident', 'no_sources', 'other'].includes(confidence)) {
              return [
                {
                  label: 'Contact Support',
                  icon: { builtIn: 'LuUser' as const },
                  action: {
                    type: 'open_link' as const,
                    url: 'mailto:support@inkeep.com',
                  },
                },
              ];
            }
            return [];
          },
        } as ToolFunction<{
          answerConfidence: string;
          explanation: string;
        }>,
      ],
    },
    modalSettings: {
      // disable default cmd+k behavior, it's handled in this script
      shortcutKey: null,
    },
    searchSettings: {
      tabs: [['Docs', { isAlwaysVisible: true }], ['All', { isAlwaysVisible: true }], 'GitHub'],
    } satisfies InkeepSearchSettings,
  };

  const [modalOpen, setModalOpen] = useState(false);
  const modalRef = useRef<InkeepEmbeddedSearchAndChatFunctions>(null);

  useEffect(() => {
    // When the search bar or button element is clicked, open the Inkeep search modal
    for (const button of document.querySelectorAll('#search-trigger, #search-trigger-mobile')) {
      button.addEventListener('click', () => {
        setModalOpen(true);
      });
    }

    for (const button of document.querySelectorAll('#chat-trigger')) {
      button.addEventListener('click', () => {
        modalRef.current?.setView('chat');
        setModalOpen(true);
      });
    }

    // Open the Inkeep Modal with cmd+k
    window.addEventListener(
      'keydown',
      (event) => {
        if ((event.metaKey || event.ctrlKey) && (event.key === 'k' || event.key === 'K')) {
          event.stopPropagation();
          event.preventDefault();
          setModalOpen(true);
          return false;
        }
      },
      true
    );
  }, []);

  if (!apiKey) {
    console.warn('NEXT_PUBLIC_INKEEP_API_KEY not configured.');
  }

  return (
    <>
      <InkeepChatButton
        {...config}
        avatar={{ light: '/logos/icon-black.svg', dark: '/logos/icon-light-blue.svg' }}
      />
      <InkeepModalSearchAndChat
        {...config}
        modalSettings={{
          ...config.modalSettings,
          isOpen: modalOpen,
          onOpenChange: (open) => {
            modalRef.current?.setView('search');
            setModalOpen(open ?? false);
          },
        }}
        ref={modalRef as any}
      />
    </>
  );
}
