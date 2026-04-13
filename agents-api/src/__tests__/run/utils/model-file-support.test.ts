import type { FilePart } from '@inkeep/agents-core';
import { describe, expect, it } from 'vitest';
import {
  buildStrippedPartsNote,
  stripIncompatibleOfficeParts,
  supportsOfficeDocuments,
} from '../../../domains/run/utils/model-file-support';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PDF_MIME = 'application/pdf';
const PNG_MIME = 'image/png';

function makeFilePart(mimeType: string, filename?: string): FilePart {
  return {
    kind: 'file',
    file: { mimeType, bytes: 'dGVzdA==' },
    ...(filename ? { metadata: { filename } } : {}),
  } as unknown as FilePart;
}

describe('supportsOfficeDocuments', () => {
  it('returns true for openai/ prefix', () => {
    expect(supportsOfficeDocuments('openai/gpt-4o')).toBe(true);
  });

  it('returns false for google/ prefix (Gemini requires Files API, not inline binary)', () => {
    expect(supportsOfficeDocuments('google/gemini-2.5-pro')).toBe(false);
  });

  it('returns false for bare gemini- prefix', () => {
    expect(supportsOfficeDocuments('gemini-2.5-flash')).toBe(false);
  });

  it('returns false for anthropic/ prefix', () => {
    expect(supportsOfficeDocuments('anthropic/claude-3-5-sonnet-20241022')).toBe(false);
  });

  it('returns false for bare claude- prefix', () => {
    expect(supportsOfficeDocuments('claude-3-5-haiku-20241022')).toBe(false);
  });

  it('returns false for unknown model', () => {
    expect(supportsOfficeDocuments('someunknown/model-x')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(supportsOfficeDocuments('')).toBe(false);
  });
});

describe('stripIncompatibleOfficeParts', () => {
  it('returns all parts compatible for OpenAI model', () => {
    const parts = [makeFilePart(DOCX_MIME, 'report.docx'), makeFilePart(XLSX_MIME, 'data.xlsx')];
    const { compatible, stripped } = stripIncompatibleOfficeParts(parts, 'openai/gpt-4o');
    expect(compatible).toHaveLength(2);
    expect(stripped).toHaveLength(0);
  });

  it('strips docx for Gemini model (requires Files API, not inline binary)', () => {
    const parts = [makeFilePart(DOCX_MIME, 'report.docx')];
    const { compatible, stripped } = stripIncompatibleOfficeParts(parts, 'google/gemini-2.5-flash');
    expect(compatible).toHaveLength(0);
    expect(stripped).toHaveLength(1);
  });

  it('strips docx part for Anthropic model', () => {
    const parts = [makeFilePart(DOCX_MIME, 'report.docx')];
    const { compatible, stripped } = stripIncompatibleOfficeParts(
      parts,
      'anthropic/claude-3-5-sonnet-20241022'
    );
    expect(compatible).toHaveLength(0);
    expect(stripped).toHaveLength(1);
    expect(stripped[0]).toEqual({ mimeType: DOCX_MIME, filename: 'report.docx' });
  });

  it('strips xlsx part for Anthropic model', () => {
    const parts = [makeFilePart(XLSX_MIME, 'data.xlsx')];
    const { compatible, stripped } = stripIncompatibleOfficeParts(
      parts,
      'anthropic/claude-3-5-sonnet-20241022'
    );
    expect(compatible).toHaveLength(0);
    expect(stripped).toHaveLength(1);
    expect(stripped[0]).toEqual({ mimeType: XLSX_MIME, filename: 'data.xlsx' });
  });

  it('keeps PDF and image parts while stripping docx for Anthropic model', () => {
    const docxPart = makeFilePart(DOCX_MIME, 'report.docx');
    const pdfPart = makeFilePart(PDF_MIME);
    const imgPart = makeFilePart(PNG_MIME);
    const { compatible, stripped } = stripIncompatibleOfficeParts(
      [docxPart, pdfPart, imgPart],
      'anthropic/claude-3-5-sonnet-20241022'
    );
    expect(compatible).toHaveLength(2);
    expect(compatible).toContain(pdfPart);
    expect(compatible).toContain(imgPart);
    expect(stripped).toHaveLength(1);
    expect(stripped[0].mimeType).toBe(DOCX_MIME);
  });

  it('returns no-op when there are no file parts', () => {
    const { compatible, stripped } = stripIncompatibleOfficeParts(
      [],
      'anthropic/claude-3-5-sonnet-20241022'
    );
    expect(compatible).toHaveLength(0);
    expect(stripped).toHaveLength(0);
  });

  it('strips for unknown model (safe default)', () => {
    const parts = [makeFilePart(DOCX_MIME, 'report.docx')];
    const { compatible, stripped } = stripIncompatibleOfficeParts(parts, 'unknown/model-x');
    expect(compatible).toHaveLength(0);
    expect(stripped).toHaveLength(1);
  });

  it('sets filename to undefined when no metadata', () => {
    const parts = [makeFilePart(DOCX_MIME)];
    const { stripped } = stripIncompatibleOfficeParts(
      parts,
      'anthropic/claude-3-5-sonnet-20241022'
    );
    expect(stripped[0].filename).toBeUndefined();
  });
});

describe('buildStrippedPartsNote', () => {
  it('includes filename when present', () => {
    const note = buildStrippedPartsNote(
      [{ mimeType: DOCX_MIME, filename: 'report.docx' }],
      'anthropic/claude-3-5-sonnet-20241022'
    );
    expect(note).toContain('"report.docx"');
    expect(note).toContain(DOCX_MIME);
    expect(note).toContain('anthropic/claude-3-5-sonnet-20241022');
  });

  it('uses (unnamed) when filename is absent', () => {
    const note = buildStrippedPartsNote(
      [{ mimeType: DOCX_MIME, filename: undefined }],
      'anthropic/claude-3-5-sonnet-20241022'
    );
    expect(note).toContain('(unnamed)');
  });

  it('produces one line per stripped part', () => {
    const note = buildStrippedPartsNote(
      [
        { mimeType: DOCX_MIME, filename: 'report.docx' },
        { mimeType: XLSX_MIME, filename: 'data.xlsx' },
      ],
      'anthropic/claude-3-5-sonnet-20241022'
    );
    const lines = note.split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('report.docx');
    expect(lines[1]).toContain('data.xlsx');
  });
});
