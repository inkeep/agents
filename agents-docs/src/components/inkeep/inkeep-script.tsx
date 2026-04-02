'use client';

import {
  InkeepChatButton,
  InkeepModalSearchAndChat,
  type InkeepModalSearchAndChatProps,
} from '@inkeep/agents-ui-cloud';
import type { SharedProps } from 'fumadocs-ui/components/dialog/search';
import type { FC } from 'react';

const apiKey = process.env.NEXT_PUBLIC_INKEEP_API_KEY;
const appId = process.env.NEXT_PUBLIC_INKEEP_APP_ID;

if (!apiKey) {
  console.warn('NEXT_PUBLIC_INKEEP_API_KEY not configured.');
}

if (!appId) {
  console.warn('NEXT_PUBLIC_INKEEP_APP_ID not configured.');
}

const config: InkeepModalSearchAndChatProps = {
  baseSettings: {
    primaryBrandColor: '#D5E5FF',
    organizationDisplayName: 'Inkeep',
    colorMode: {
      sync: {
        target: document.documentElement,
        attributes: ['class'],
        isDarkMode: (attrs) => !!attrs.class?.includes('dark'),
      },
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
  },
  aiChatSettings: {
    appId,
    aiAssistantAvatar: {
      light: '/logos/icon-black.svg',
      dark: '/logos/icon-light-blue.svg',
    },
    exampleQuestions: [
      'How to get started with the quick start?',
      'How to install the Inkeep CLI?',
      "Who's in the Inkeep team?",
    ],
    getHelpOptions: [
      {
        name: 'Schedule a Demo',
        isPinnedToToolbar: true,
        icon: { builtIn: 'LuCalendar' },
        action: {
          type: 'open_link',
          url: 'https://inkeep.com/demo?cta_id=docs_cxkit',
        },
      },
      {
        name: 'Contact us',
        isPinnedToToolbar: true,
        icon: { builtIn: 'IoChatbubblesOutline' },
        action: {
          type: 'open_link',
          url: 'mailto:support@inkeep.com?subject=Question%20about%20inkeep',
        },
      },
    ],
  },
  searchSettings: {
    apiKey,
    tabs: [['Docs', { isAlwaysVisible: true }], ['All', { isAlwaysVisible: true }], 'GitHub'],
  },
};

export const InkeepScript: FC<SharedProps> = ({ open, onOpenChange }) => {
  if (!apiKey || !appId) {
    return;
  }

  return (
    <>
      <InkeepChatButton
        {...config}
        avatar={{ light: '/logos/icon-black.svg', dark: '/logos/icon-light-blue.svg' }}
      />
      <InkeepModalSearchAndChat
        {...config}
        openSettings={{
          // disable default cmd+k behavior, it's handled by fumadocs
          shortcutKey: null,
          isOpen: open,
          onOpenChange,
        }}
      />
    </>
  );
};
