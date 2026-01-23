// ============================================================
// src/lib/blocks.ts
// Block Kit building utilities
// ============================================================

import type { Button, KnownBlock, PlainTextInput, StaticSelect } from '@slack/types';

export type Block = KnownBlock;
export type ButtonStyle = 'primary' | 'danger';

export interface SelectOption {
  label: string;
  value: string;
}

// JSON encode/decode for action payloads
export const encode = <T>(data: T): string => JSON.stringify(data);
export const decode = <T = unknown>(str: string): T => JSON.parse(str);

// Block builders
export const blocks = {
  header: (text: string): Block => ({
    type: 'header',
    text: { type: 'plain_text', text, emoji: true },
  }),

  text: (text: string): Block => ({
    type: 'section',
    text: { type: 'mrkdwn', text },
  }),

  textWithAccessory: (text: string, accessory: Button | StaticSelect): Block => ({
    type: 'section',
    text: { type: 'mrkdwn', text },
    accessory,
  }),

  context: (...items: string[]): Block => ({
    type: 'context',
    elements: items.filter(Boolean).map((text) => ({ type: 'mrkdwn', text })),
  }),

  divider: (): Block => ({ type: 'divider' }),

  actions: (...elements: (Button | StaticSelect)[]): Block => ({
    type: 'actions',
    elements,
  }),

  button: (text: string, actionId: string, value?: string, style?: ButtonStyle): Button => ({
    type: 'button',
    text: { type: 'plain_text', text, emoji: true },
    action_id: actionId,
    ...(value && { value }),
    ...(style && { style }),
  }),

  select: (placeholder: string, actionId: string, options: SelectOption[]): StaticSelect => ({
    type: 'static_select',
    placeholder: { type: 'plain_text', text: placeholder, emoji: true },
    action_id: actionId,
    options: options.map((o) => ({
      text: { type: 'plain_text', text: o.label, emoji: true },
      value: o.value,
    })),
  }),

  fields: (...pairs: [string, string][]): Block => ({
    type: 'section',
    fields: pairs.map(([label, value]) => ({
      type: 'mrkdwn',
      text: `*${label}*\n${value}`,
    })),
  }),

  input: (
    blockId: string,
    label: string,
    actionId: string,
    opts?: {
      placeholder?: string;
      multiline?: boolean;
      optional?: boolean;
      initialValue?: string;
    }
  ): Block => ({
    type: 'input',
    block_id: blockId,
    optional: opts?.optional ?? false,
    label: { type: 'plain_text', text: label },
    element: {
      type: 'plain_text_input',
      action_id: actionId,
      ...(opts?.placeholder && { placeholder: { type: 'plain_text', text: opts.placeholder } }),
      ...(opts?.multiline && { multiline: true }),
      ...(opts?.initialValue && { initial_value: opts.initialValue }),
    } as PlainTextInput,
  }),
};

// Shorthand alias
export const b = blocks;
