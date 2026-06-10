import { describe, expect, test } from 'vitest';
import {
  currentTurnTextForDedup,
  isCurrentTurnLastMessage,
} from '../../../domains/run/data/conversations';

// R5: the current-turn dedup must strip the current turn from history even when it carries
// structured data, so it doesn't leak into history (double-inclusion) and poison the history cache.
const DATA = '\n\n<structured_data (source: x)>\n{"k":"v"}\n</structured_data>';

describe('conversations dedup (R5)', () => {
  describe('currentTurnTextForDedup', () => {
    test('plain text is returned unchanged', () => {
      expect(currentTurnTextForDedup('hello world')).toBe('hello world');
    });

    test('strips appended structured_data suffix', () => {
      expect(currentTurnTextForDedup(`hello world${DATA}`)).toBe('hello world');
    });

    test('strips multiple structured_data blocks', () => {
      expect(currentTurnTextForDedup(`hi${DATA}${DATA}`)).toBe('hi');
    });

    test('data-only message (no text) yields empty text', () => {
      expect(currentTurnTextForDedup(DATA)).toBe('');
    });
  });

  describe('isCurrentTurnLastMessage', () => {
    test('plain-text turn matches (no regression)', () => {
      expect(isCurrentTurnLastMessage('hello', 'hello')).toBe(true);
    });

    test('structured-data turn matches when stored text is text-only (the bug fix)', () => {
      // stored content.text = bare user text; currentMessage = text + dataContext
      expect(isCurrentTurnLastMessage('hello', `hello${DATA}`)).toBe(true);
    });

    test('matches when stored text already includes the full form', () => {
      expect(isCurrentTurnLastMessage(`hello${DATA}`, `hello${DATA}`)).toBe(true);
    });

    test('non-matching text does not dedup', () => {
      expect(isCurrentTurnLastMessage('different', `hello${DATA}`)).toBe(false);
    });

    test('undefined stored text does not dedup', () => {
      expect(isCurrentTurnLastMessage(undefined, 'hello')).toBe(false);
    });
  });
});
