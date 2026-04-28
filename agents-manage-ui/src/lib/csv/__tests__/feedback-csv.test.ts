import { parseFeedbackCsv } from '../feedback-csv';

describe('parseFeedbackCsv — happy path', () => {
  it('parses a minimal row with conversationId and type', () => {
    const result = parseFeedbackCsv('conversationId,type\nconv_abc123,positive\n');

    expect(result.errors).toEqual([]);
    expect(result.totalRows).toBe(1);
    expect(result.items).toEqual([{ conversationId: 'conv_abc123', type: 'positive' }]);
  });

  it('parses all four columns', () => {
    const result = parseFeedbackCsv(
      'conversationId,type,messageId,details\nconv_abc,negative,msg_xyz,Not helpful\n'
    );

    expect(result.errors).toEqual([]);
    expect(result.items).toEqual([
      {
        conversationId: 'conv_abc',
        type: 'negative',
        messageId: 'msg_xyz',
        details: 'Not helpful',
      },
    ]);
  });

  it('treats empty messageId and details as omitted', () => {
    const result = parseFeedbackCsv('conversationId,type,messageId,details\nconv_abc,positive,,\n');

    expect(result.errors).toEqual([]);
    expect(result.items).toEqual([{ conversationId: 'conv_abc', type: 'positive' }]);
  });

  it('parses multiple data rows in order', () => {
    const result = parseFeedbackCsv(
      'conversationId,type\nconv_a,positive\nconv_b,negative\nconv_c,positive\n'
    );

    expect(result.errors).toEqual([]);
    expect(result.totalRows).toBe(3);
    expect(result.items.map((it) => it.conversationId)).toEqual(['conv_a', 'conv_b', 'conv_c']);
  });
});

describe('parseFeedbackCsv — header resolution', () => {
  it('matches headers case-insensitively', () => {
    const result = parseFeedbackCsv('ConversationId,Type\nconv_abc,positive\n');

    expect(result.errors).toEqual([]);
    expect(result.items).toHaveLength(1);
  });

  it('tolerates whitespace around header names', () => {
    const result = parseFeedbackCsv('  conversationId  ,  type  \nconv_abc,positive\n');

    expect(result.errors).toEqual([]);
    expect(result.items).toHaveLength(1);
  });

  it('accepts underscore/hyphen/space separated headers', () => {
    const result = parseFeedbackCsv(
      'conversation_id,type,message_id,details\nconv_abc,positive,msg_1,Great\n'
    );

    expect(result.errors).toEqual([]);
    expect(result.items[0]).toEqual({
      conversationId: 'conv_abc',
      type: 'positive',
      messageId: 'msg_1',
      details: 'Great',
    });
  });

  it('ignores extra columns', () => {
    const result = parseFeedbackCsv(
      'id,conversationId,type,notes\n1,conv_abc,positive,some note\n'
    );

    expect(result.errors).toEqual([]);
    expect(result.items).toEqual([{ conversationId: 'conv_abc', type: 'positive' }]);
  });

  it('errors when conversationId column is missing', () => {
    const result = parseFeedbackCsv('type,details\npositive,Great\n');

    expect(result.items).toEqual([]);
    expect(result.errors[0]).toMatchObject({
      rowNumber: 1,
      message: expect.stringContaining('conversationId'),
    });
  });

  it('errors when type column is missing', () => {
    const result = parseFeedbackCsv('conversationId,details\nconv_abc,Great\n');

    expect(result.items).toEqual([]);
    expect(result.errors[0]).toMatchObject({
      rowNumber: 1,
      message: expect.stringContaining('type'),
    });
  });
});

describe('parseFeedbackCsv — validation', () => {
  it('rejects empty conversationId', () => {
    const result = parseFeedbackCsv('conversationId,type\n,positive\n');

    expect(result.items).toEqual([]);
    expect(result.errors[0]).toMatchObject({
      rowNumber: 2,
      message: expect.stringMatching(/conversationId is required/i),
    });
  });

  it('rejects invalid type value', () => {
    const result = parseFeedbackCsv('conversationId,type\nconv_abc,neutral\n');

    expect(result.items).toEqual([]);
    expect(result.errors[0]).toMatchObject({
      rowNumber: 2,
      message: expect.stringContaining("'positive' or 'negative'"),
    });
  });

  it('rejects empty type value', () => {
    const result = parseFeedbackCsv('conversationId,type\nconv_abc,\n');

    expect(result.items).toEqual([]);
    expect(result.errors[0]).toMatchObject({
      rowNumber: 2,
      message: expect.stringContaining("'positive' or 'negative'"),
    });
  });

  it('normalizes type to lowercase', () => {
    const result = parseFeedbackCsv('conversationId,type\nconv_abc,Positive\nconv_def,NEGATIVE\n');

    expect(result.errors).toEqual([]);
    expect(result.items[0].type).toBe('positive');
    expect(result.items[1].type).toBe('negative');
  });
});

describe('parseFeedbackCsv — papaparse integration', () => {
  it('supports CR-only line endings', () => {
    const result = parseFeedbackCsv('conversationId,type\rconv_abc,positive\r');

    expect(result.errors).toEqual([]);
    expect(result.items).toHaveLength(1);
  });

  it('ignores blank rows between data rows', () => {
    const result = parseFeedbackCsv('conversationId,type\nconv_a,positive\n\n\nconv_b,negative\n');

    expect(result.errors).toEqual([]);
    expect(result.items).toHaveLength(2);
    expect(result.totalRows).toBe(2);
  });

  it('reports unterminated quoted fields', () => {
    const result = parseFeedbackCsv('conversationId,type\n"oops\n');

    expect(result.items).toEqual([]);
    expect(result.errors).toEqual([
      expect.objectContaining({
        rowNumber: 0,
        message: expect.stringMatching(/unterminated/i),
      }),
    ]);
  });

  it('treats a completely empty file as an error', () => {
    expect(parseFeedbackCsv('').errors[0]).toMatchObject({
      rowNumber: 1,
      message: expect.stringMatching(/empty/i),
    });
  });

  it('treats a whitespace-only file as an error', () => {
    expect(parseFeedbackCsv('\n\n\n').errors[0]).toMatchObject({
      rowNumber: 1,
      message: expect.stringMatching(/empty/i),
    });
  });
});

describe('parseFeedbackCsv — partial failure behavior', () => {
  it('keeps valid rows and reports errors for bad ones', () => {
    const result = parseFeedbackCsv(
      `${[
        'conversationId,type',
        'conv_a,positive',
        ',positive',
        'conv_c,invalid',
        'conv_d,negative',
      ].join('\n')}\n`
    );

    expect(result.totalRows).toBe(4);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].conversationId).toBe('conv_a');
    expect(result.items[1].conversationId).toBe('conv_d');
    expect(result.errors.map((e) => e.rowNumber)).toEqual([3, 4]);
  });
});
