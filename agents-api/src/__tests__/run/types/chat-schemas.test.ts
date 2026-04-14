import { describe, expect, it } from 'vitest';
import { InlineDocumentDataSchema, VercelFilePartSchema } from '../../../domains/run/types/chat';

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

describe('VercelFilePartSchema - office document URL normalization', () => {
  it('accepts lowercase docx data URI in url field', () => {
    const part = {
      type: 'file',
      url: `data:${DOCX_MIME};base64,${VALID_ZIP_BASE64}`,
      mediaType: DOCX_MIME,
    };
    expect(VercelFilePartSchema.safeParse(part).success).toBe(true);
  });

  it('accepts uppercase docx MIME in url field', () => {
    const part = {
      type: 'file',
      url: `data:${DOCX_MIME.toUpperCase()};base64,${VALID_ZIP_BASE64}`,
      mediaType: DOCX_MIME.toUpperCase(),
    };
    expect(VercelFilePartSchema.safeParse(part).success).toBe(true);
  });

  it('accepts mixed-case docx MIME in url field', () => {
    const part = {
      type: 'file',
      url: `data:Application/Vnd.Openxmlformats-Officedocument.Wordprocessingml.Document;base64,${VALID_ZIP_BASE64}`,
      mediaType: 'Application/Vnd.Openxmlformats-Officedocument.Wordprocessingml.Document',
    };
    expect(VercelFilePartSchema.safeParse(part).success).toBe(true);
  });

  it('rejects office document with external URL', () => {
    const part = {
      type: 'file',
      url: 'https://example.com/file.docx',
      mediaType: DOCX_MIME,
    };
    expect(VercelFilePartSchema.safeParse(part).success).toBe(false);
  });
});
