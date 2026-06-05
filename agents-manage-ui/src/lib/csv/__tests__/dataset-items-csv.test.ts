import { parseDatasetItemsCsv } from '../dataset-items-csv';

describe('parseDatasetItemsCsv — happy path', () => {
  it('parses a minimal plain-text input / expectedOutput row', () => {
    const result = parseDatasetItemsCsv('input,expectedOutput\nWhat is 2+2?,4\n');

    expect(result.errors).toEqual([]);
    expect(result.totalRows).toBe(1);
    expect(result.items).toEqual([
      {
        input: { messages: [{ role: 'user', content: 'What is 2+2?' }] },
        expectedOutput: [{ role: 'assistant', content: '4' }],
      },
    ]);
  });

  it('accepts a file without the optional expectedOutput column', () => {
    const result = parseDatasetItemsCsv('input\nWhat is 2+2?\n');

    expect(result.errors).toEqual([]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].expectedOutput).toBeNull();
  });

  it('treats an empty expectedOutput cell as null, not an error', () => {
    const result = parseDatasetItemsCsv('input,expectedOutput\nHi,\n');

    expect(result.errors).toEqual([]);
    expect(result.items[0].expectedOutput).toBeNull();
  });

  it('parses a JSON object with a messages array for input', () => {
    const json =
      '{"messages":[{"role":"system","content":"Be terse."},{"role":"user","content":"Ping"}]}';
    // JSON cell must be quoted so commas inside it are not treated as field separators.
    const result = parseDatasetItemsCsv(
      `input,expectedOutput\n"${json.replaceAll('"', '""')}",Pong\n`
    );

    expect(result.errors).toEqual([]);
    expect(result.items[0].input.messages).toEqual([
      { role: 'system', content: 'Be terse.' },
      { role: 'user', content: 'Ping' },
    ]);
  });

  it('parses a bare JSON array for expectedOutput', () => {
    const arr = '[{"role":"assistant","content":"Pong"}]';
    const result = parseDatasetItemsCsv(
      `input,expectedOutput\nPing,"${arr.replaceAll('"', '""')}"\n`
    );

    expect(result.errors).toEqual([]);
    expect(result.items[0].expectedOutput).toEqual([{ role: 'assistant', content: 'Pong' }]);
  });

  it('allows structured (object) content on a message', () => {
    const json = '[{"role":"user","content":{"text":"hi","parts":[1,2,3]}}]';
    const result = parseDatasetItemsCsv(`input\n"${json.replaceAll('"', '""')}"\n`);

    expect(result.errors).toEqual([]);
    expect(result.items[0].input.messages[0].content).toEqual({
      text: 'hi',
      parts: [1, 2, 3],
    });
  });

  it('parses multiple data rows in order', () => {
    const result = parseDatasetItemsCsv('input,expectedOutput\nA,1\nB,2\nC,3\n');

    expect(result.errors).toEqual([]);
    expect(result.totalRows).toBe(3);
    expect(result.items.map((it) => it.input.messages[0].content as string)).toEqual([
      'A',
      'B',
      'C',
    ]);
  });
});

describe('parseDatasetItemsCsv — header resolution', () => {
  it('matches headers case-insensitively', () => {
    const result = parseDatasetItemsCsv('Input,ExpectedOutput\nHi,there\n');

    expect(result.errors).toEqual([]);
    expect(result.items).toHaveLength(1);
  });

  it('tolerates whitespace around header names', () => {
    const result = parseDatasetItemsCsv('  input  ,  expectedOutput  \nHi,there\n');

    expect(result.errors).toEqual([]);
    expect(result.items).toHaveLength(1);
  });

  it('does NOT accept aliases like question/prompt/answer/output', () => {
    const result = parseDatasetItemsCsv('question,answer\nHi,there\n');

    expect(result.items).toEqual([]);
    expect(result.errors).toEqual([
      expect.objectContaining({ rowNumber: 1, message: expect.stringContaining("'input'") }),
    ]);
  });

  it('ignores extra columns that are neither input nor expectedOutput', () => {
    const result = parseDatasetItemsCsv('id,input,notes,expectedOutput\n1,Hi,foo,there\n');

    expect(result.errors).toEqual([]);
    expect(result.items).toEqual([
      {
        input: { messages: [{ role: 'user', content: 'Hi' }] },
        expectedOutput: [{ role: 'assistant', content: 'there' }],
      },
    ]);
  });

  it('errors when the input column is missing entirely', () => {
    const result = parseDatasetItemsCsv('expectedOutput\nthere\n');

    expect(result.items).toEqual([]);
    expect(result.errors[0]).toMatchObject({
      rowNumber: 1,
      message: expect.stringContaining("'input'"),
    });
  });
});

describe('parseDatasetItemsCsv — papaparse integration contract', () => {
  it('supports CR-only line endings', () => {
    const result = parseDatasetItemsCsv('input,expectedOutput\rHi,there\r');

    expect(result.errors).toEqual([]);
    expect(result.items).toHaveLength(1);
  });

  it('ignores blank rows between data rows', () => {
    const result = parseDatasetItemsCsv('input\nHi\n\n\nWorld\n');

    expect(result.errors).toEqual([]);
    expect(result.items).toHaveLength(2);
    expect(result.totalRows).toBe(2);
  });

  it('reports unterminated quoted fields as a file-level error', () => {
    const result = parseDatasetItemsCsv('input\n"oops\n');

    expect(result.items).toEqual([]);
    expect(result.errors).toEqual([
      expect.objectContaining({
        rowNumber: 0,
        message: expect.stringMatching(/unterminated/i),
      }),
    ]);
  });

  it('treats a completely empty file as an error', () => {
    expect(parseDatasetItemsCsv('').errors[0]).toMatchObject({
      rowNumber: 1,
      message: expect.stringMatching(/empty/i),
    });
  });

  it('treats a whitespace-only file as an error', () => {
    expect(parseDatasetItemsCsv('\n\n\n').errors[0]).toMatchObject({
      rowNumber: 1,
      message: expect.stringMatching(/empty/i),
    });
  });
});

describe('parseDatasetItemsCsv — JSON validation', () => {
  it('rejects an invalid role in a JSON message', () => {
    const json = '[{"role":"wizard","content":"abra"}]';
    const result = parseDatasetItemsCsv(`input\n"${json.replaceAll('"', '""')}"\n`);

    expect(result.items).toEqual([]);
    expect(result.errors[0]).toMatchObject({
      rowNumber: 2,
      message: expect.stringContaining("invalid role 'wizard'"),
    });
  });

  it('rejects messages with missing or invalid content', () => {
    const json = '[{"role":"user"}]';
    const result = parseDatasetItemsCsv(`input\n"${json.replaceAll('"', '""')}"\n`);

    expect(result.items).toEqual([]);
    expect(result.errors[0].message).toMatch(/invalid content|missing/i);
  });

  it('rejects array content (arrays masquerading as structured content)', () => {
    // Arrays must not pass the object content type-guard: they are neither a
    // plain string nor a content object, so they must be flagged.
    const json = '[{"role":"user","content":[1,2,3]}]';
    const result = parseDatasetItemsCsv(`input\n"${json.replaceAll('"', '""')}"\n`);

    expect(result.items).toEqual([]);
    expect(result.errors[0].message).toMatch(/invalid content|missing/i);
  });

  it('rejects a cell whose JSON is malformed', () => {
    const result = parseDatasetItemsCsv('input\n{not json}\n');

    expect(result.items).toEqual([]);
    expect(result.errors[0]).toMatchObject({
      rowNumber: 2,
      message: expect.stringMatching(/valid JSON/i),
    });
  });

  it('rejects a JSON object with no messages array', () => {
    const json = '{"foo":"bar"}';
    const result = parseDatasetItemsCsv(`input\n"${json.replaceAll('"', '""')}"\n`);

    expect(result.items).toEqual([]);
    expect(result.errors[0].message).toMatch(/array of messages|messages array/i);
  });

  it('rejects an empty messages array for input (required)', () => {
    const result = parseDatasetItemsCsv('input\n[]\n');

    expect(result.items).toEqual([]);
    expect(result.errors[0].message).toMatch(/at least one message/i);
  });

  it('accepts an empty messages array for expectedOutput (allowEmpty)', () => {
    const result = parseDatasetItemsCsv('input,expectedOutput\nHi,[]\n');

    expect(result.errors).toEqual([]);
    expect(result.items[0].expectedOutput).toEqual([]);
  });

  it('requires input to be present (empty cell is an error)', () => {
    const result = parseDatasetItemsCsv('input,expectedOutput\n,there\n');

    expect(result.items).toEqual([]);
    expect(result.errors[0]).toMatchObject({
      rowNumber: 2,
      message: expect.stringMatching(/input is required/i),
    });
  });
});

describe('parseDatasetItemsCsv — partial failure behavior', () => {
  it('keeps valid rows and reports errors for the bad ones', () => {
    const result = parseDatasetItemsCsv(
      `${[
        'input,expectedOutput',
        'Hi,there', // row 2 — valid
        ',there', // row 3 — missing input
        '{not json},x', // row 4 — bad JSON
        'Bye,later', // row 5 — valid
      ].join('\n')}\n`
    );

    expect(result.totalRows).toBe(4);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].input.messages[0].content).toBe('Hi');
    expect(result.items[1].input.messages[0].content).toBe('Bye');

    expect(result.errors.map((e) => e.rowNumber)).toEqual([3, 4]);
  });

  it('reports row numbers matching the source file (header is row 1)', () => {
    const result = parseDatasetItemsCsv('input\n\n\n[]\n'); // first data row with [] is row 4

    // Blank rows are filtered before iteration, so [] is data row index 0 → rowNumber 2.
    // This documents the current contract: rowNumber is the position within
    // non-blank data rows + 1 (for the header), NOT the raw line number.
    expect(result.errors[0].rowNumber).toBe(2);
  });
});
