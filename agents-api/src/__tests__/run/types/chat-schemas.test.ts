import { describe, expect, it } from 'vitest';
import { InlineDocumentDataSchema } from '../../../domains/run/types/chat';

const VALID_ZIP_BASE64 = Buffer.from([0x50, 0x4b, 0x03, 0x04, ...Array(100).fill(0)]).toString(
  'base64'
);

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

describe('InlineDocumentDataSchema - office document MIME normalization', () => {
  it('accepts lowercase docx data URI', () => {
    const input = `data:${DOCX_MIME};base64,${VALID_ZIP_BASE64}`;
    expect(InlineDocumentDataSchema.safeParse(input).success).toBe(true);
  });

  it('accepts uppercase docx MIME in data URI', () => {
    const input = `data:${DOCX_MIME.toUpperCase()};base64,${VALID_ZIP_BASE64}`;
    expect(InlineDocumentDataSchema.safeParse(input).success).toBe(true);
  });

  it('accepts mixed-case docx MIME in data URI', () => {
    const input = `data:Application/Vnd.Openxmlformats-Officedocument.Wordprocessingml.Document;base64,${VALID_ZIP_BASE64}`;
    expect(InlineDocumentDataSchema.safeParse(input).success).toBe(true);
  });

  it('accepts uppercase xlsx MIME in data URI', () => {
    const input = `data:${XLSX_MIME.toUpperCase()};base64,${VALID_ZIP_BASE64}`;
    expect(InlineDocumentDataSchema.safeParse(input).success).toBe(true);
  });

  it('rejects invalid base64 in office data URI', () => {
    const input = `data:${DOCX_MIME};base64,!!!not-base64`;
    expect(InlineDocumentDataSchema.safeParse(input).success).toBe(false);
  });
});
