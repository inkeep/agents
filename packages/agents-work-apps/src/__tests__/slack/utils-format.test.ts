import { describe, expect, it } from 'vitest';
import { formatMessageTimestamp, formatSlackQuery } from '../../slack/services/events/utils';

const CHANNEL = 'the Slack channel #general';
const USER = 'Alice';
const MESSAGE_TS = '1614556800.000100';
const TIMEZONE = 'America/New_York';

describe('formatSlackQuery', () => {
  describe('standard message (no thread, no attachments)', () => {
    it('wraps text with channel and user context', () => {
      const result = formatSlackQuery({
        text: 'hello world',
        channelContext: CHANNEL,
        userName: USER,
      });
      expect(result).toBe(
        `The following is a message from ${CHANNEL} from ${USER}: """hello world"""`
      );
    });

    it('handles empty text', () => {
      const result = formatSlackQuery({ text: '', channelContext: CHANNEL, userName: USER });
      expect(result).toBe(`The following is a message from ${CHANNEL} from ${USER}: """"""`);
    });

    it('preserves special characters in text', () => {
      const text = 'what does <tool> & "config" mean?';
      const result = formatSlackQuery({ text, channelContext: CHANNEL, userName: USER });
      expect(result).toContain(`"""${text}"""`);
    });

    it('preserves newlines in text', () => {
      const text = 'line one\nline two';
      const result = formatSlackQuery({ text, channelContext: CHANNEL, userName: USER });
      expect(result).toContain(`"""${text}"""`);
    });
  });

  describe('message with attachments (no thread)', () => {
    it('appends attached_content block', () => {
      const result = formatSlackQuery({
        text: 'check this',
        channelContext: CHANNEL,
        userName: USER,
        attachmentContext: 'forwarded message body',
      });

      expect(result).toBe(
        `The following is a message from ${CHANNEL} from ${USER}: """check this"""\n\n` +
          'The message also includes the following shared/forwarded content:\n\n' +
          '<attached_content>\nforwarded message body\n</attached_content>'
      );
    });

    it('produces well-formed XML tags', () => {
      const result = formatSlackQuery({
        text: 'x',
        channelContext: CHANNEL,
        userName: USER,
        attachmentContext: 'content',
      });

      expect(result).toContain('<attached_content>');
      expect(result).toContain('</attached_content>');
      const openCount = (result.match(/<attached_content>/g) || []).length;
      const closeCount = (result.match(/<\/attached_content>/g) || []).length;
      expect(openCount).toBe(1);
      expect(closeCount).toBe(1);
    });
  });

  describe('thread with query (threadContext present, not auto-execute)', () => {
    it('wraps thread context and appends user message', () => {
      const result = formatSlackQuery({
        text: 'my follow-up',
        channelContext: CHANNEL,
        userName: USER,
        threadContext: 'User1: hi\nUser2: hello',
      });

      expect(result).toBe(
        `The following is thread context from ${CHANNEL}:\n\n` +
          '<slack_thread_context>\nUser1: hi\nUser2: hello\n</slack_thread_context>\n\n' +
          `Message from ${USER}: my follow-up`
      );
    });

    it('includes attachments inside the message content', () => {
      const result = formatSlackQuery({
        text: 'see attached',
        channelContext: CHANNEL,
        userName: USER,
        threadContext: 'context msgs',
        attachmentContext: 'shared link content',
      });

      expect(result).toContain('<slack_thread_context>\ncontext msgs\n</slack_thread_context>');
      expect(result).toContain(
        `Message from ${USER}: see attached\n\n<attached_content>\nshared link content\n</attached_content>`
      );
    });

    it('produces well-formed XML tags', () => {
      const result = formatSlackQuery({
        text: 'q',
        channelContext: CHANNEL,
        userName: USER,
        threadContext: 'ctx',
        attachmentContext: 'att',
      });

      for (const tag of ['slack_thread_context', 'attached_content']) {
        const opens = (result.match(new RegExp(`<${tag}>`, 'g')) || []).length;
        const closes = (result.match(new RegExp(`</${tag}>`, 'g')) || []).length;
        expect(opens).toBe(1);
        expect(closes).toBe(1);
      }
    });
  });

  describe('auto-execute (thread, no user query)', () => {
    it('produces the auto-execute prompt with thread context', () => {
      const result = formatSlackQuery({
        text: '',
        channelContext: CHANNEL,
        userName: USER,
        threadContext: 'the full thread',
        isAutoExecute: true,
      });

      expect(result).toContain(`A user mentioned you in a thread in ${CHANNEL}.`);
      expect(result).toContain('<slack_thread_context>\nthe full thread\n</slack_thread_context>');
      expect(result).toContain('Based on the thread above, provide a helpful response.');
      expect(result).toContain("Respond naturally as if you're joining the conversation to help.");
    });

    it('falls back to standard message when threadContext is missing', () => {
      const result = formatSlackQuery({
        text: 'some text',
        channelContext: CHANNEL,
        userName: USER,
        isAutoExecute: true,
      });

      expect(result).toBe(
        `The following is a message from ${CHANNEL} from ${USER}: """some text"""`
      );
    });

    it('ignores attachmentContext in auto-execute mode', () => {
      const result = formatSlackQuery({
        text: '',
        channelContext: CHANNEL,
        userName: USER,
        threadContext: 'ctx',
        attachmentContext: 'should not appear',
        isAutoExecute: true,
      });

      expect(result).not.toContain('attached_content');
      expect(result).not.toContain('should not appear');
    });
  });

  describe('timestamp and timezone', () => {
    it('includes inline timestamp in standard message', () => {
      const result = formatSlackQuery({
        text: 'hello',
        channelContext: CHANNEL,
        userName: USER,
        messageTs: MESSAGE_TS,
        senderTimezone: TIMEZONE,
      });

      const formatted = formatMessageTimestamp(MESSAGE_TS, TIMEZONE);
      expect(result).toContain(`(sent ${formatted})`);
      expect(result).toBe(
        `The following is a message from ${CHANNEL} from ${USER} (sent ${formatted}): """hello"""`
      );
    });

    it('includes inline timestamp in attachment message', () => {
      const result = formatSlackQuery({
        text: 'check this',
        channelContext: CHANNEL,
        userName: USER,
        attachmentContext: 'forwarded body',
        messageTs: MESSAGE_TS,
        senderTimezone: TIMEZONE,
      });

      const formatted = formatMessageTimestamp(MESSAGE_TS, TIMEZONE);
      expect(result).toContain(`from ${USER} (sent ${formatted}): """check this"""`);
      expect(result).toContain('<attached_content>');
    });

    it('includes inline timestamp in thread with query', () => {
      const result = formatSlackQuery({
        text: 'my follow-up',
        channelContext: CHANNEL,
        userName: USER,
        threadContext: 'User1: hi\nUser2: hello',
        messageTs: MESSAGE_TS,
        senderTimezone: TIMEZONE,
      });

      const formatted = formatMessageTimestamp(MESSAGE_TS, TIMEZONE);
      expect(result).toContain(`Message from ${USER} (sent ${formatted}): my follow-up`);
    });

    it('includes inline timestamp in auto-execute', () => {
      const result = formatSlackQuery({
        text: '',
        channelContext: CHANNEL,
        userName: USER,
        threadContext: 'the full thread',
        isAutoExecute: true,
        messageTs: MESSAGE_TS,
        senderTimezone: TIMEZONE,
      });

      const formatted = formatMessageTimestamp(MESSAGE_TS, TIMEZONE);
      expect(result).toContain(
        `A user mentioned you in a thread in ${CHANNEL} (sent ${formatted}).`
      );
    });

    it('omits timestamp when messageTs is missing', () => {
      const result = formatSlackQuery({
        text: 'hello',
        channelContext: CHANNEL,
        userName: USER,
        senderTimezone: TIMEZONE,
      });
      expect(result).not.toContain('(sent');
      expect(result).toBe(`The following is a message from ${CHANNEL} from ${USER}: """hello"""`);
    });

    it('omits timestamp when senderTimezone is missing', () => {
      const result = formatSlackQuery({
        text: 'hello',
        channelContext: CHANNEL,
        userName: USER,
        messageTs: MESSAGE_TS,
      });
      expect(result).not.toContain('(sent');
      expect(result).toBe(`The following is a message from ${CHANNEL} from ${USER}: """hello"""`);
    });
  });

  describe('formatMessageTimestamp', () => {
    it('formats a known timestamp in a known timezone', () => {
      const result = formatMessageTimestamp('1614556800.000100', 'America/New_York');
      expect(result).toContain('2021');
      expect(result).toMatch(/EST|ET/);
    });

    it('formats in a different timezone', () => {
      const result = formatMessageTimestamp('1614556800.000100', 'Europe/London');
      expect(result).toContain('2021');
      expect(result).toMatch(/GMT/);
    });
  });

  describe('edge cases', () => {
    it('handles very long text without truncation', () => {
      const longText = 'a'.repeat(10_000);
      const result = formatSlackQuery({ text: longText, channelContext: CHANNEL, userName: USER });
      expect(result).toContain(longText);
    });

    it('handles unicode and emoji in all fields', () => {
      const result = formatSlackQuery({
        text: 'こんにちは 👋',
        channelContext: 'the Slack channel #日本語',
        userName: '太郎',
      });
      expect(result).toContain('こんにちは 👋');
      expect(result).toContain('#日本語');
      expect(result).toContain('太郎');
    });

    it('handles triple-quote characters in text', () => {
      const text = 'he said """wow"""';
      const result = formatSlackQuery({ text, channelContext: CHANNEL, userName: USER });
      expect(result).toContain(`"""${text}"""`);
    });
  });
});
