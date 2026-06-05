import { describe, expect, it } from 'vitest';
import {
  ALLOWED_TEXT_DOCUMENT_MIME_TYPES,
  canonicalizeMimeType,
  DATA_URI_TEXT_BASE64_REGEX,
  getExtensionFromMimeType,
  getMimeTypeFromExtension,
  MIME_ALIAS_TO_CANONICAL_MIME_TYPE,
} from '../../constants/allowed-file-formats';

const CANONICAL_TEXT_DOCUMENT_MIME_TYPES = [
  'application/javascript',
  'application/typescript',
  'text/xml',
  'text/x-shellscript',
  'text/x-rst',
  'text/x-makefile',
  'text/x-lisp',
  'text/x-asm',
  'text/vbscript',
  'text/css',
  'message/rfc822',
  'application/x-powershell',
  'text/x-diff',
  'text/x-patch',
  'text/plain',
  'text/markdown',
  'text/x-java',
  'text/x-python',
  'text/x-c',
  'text/x-c++',
  'text/x-go',
  'text/html',
  'text/x-php',
  'text/x-ruby',
  'text/x-sh',
  'text/x-bash',
  'text/x-zsh',
  'text/x-tex',
  'text/x-csharp',
  'application/json',
  'text/x-rust',
  'text/x-scala',
  'text/x-kotlin',
  'text/x-swift',
  'text/x-lua',
  'text/x-r',
  'text/x-julia',
  'text/x-perl',
  'text/x-objectivec',
  'text/x-objectivec++',
  'text/x-erlang',
  'text/x-elixir',
  'text/x-haskell',
  'text/x-clojure',
  'text/x-groovy',
  'text/x-dart',
  'text/x-awk',
  'text/jsx',
  'text/tsx',
  'text/x-handlebars',
  'text/x-mustache',
  'text/x-ejs',
  'text/x-jinja2',
  'text/x-liquid',
  'text/x-erb',
  'text/x-twig',
  'text/x-pug',
  'text/x-jade',
  'text/x-tmpl',
  'text/x-cmake',
  'text/x-dockerfile',
  'text/x-gradle',
  'text/x-ini',
  'text/x-properties',
  'text/x-protobuf',
  'text/x-sql',
  'text/x-sass',
  'text/x-scss',
  'text/x-less',
  'text/x-hcl',
  'text/x-terraform',
  'application/graphql',
  'application/x-ndjson',
  'application/json5',
  'application/toml',
  'application/yaml',
  'text/x-astro',
  'text/srt',
  'text/vtt',
  'text/x-vcard',
  'text/calendar',
] as const;

const REQUESTED_TEXT_DOCUMENT_EXTENSIONS = [
  'asm',
  'bat',
  'c',
  'cc',
  'cfg',
  'conf',
  'cpp',
  'css',
  'cxx',
  'def',
  'dic',
  'eml',
  'h',
  'hh',
  'htm',
  'html',
  'ics',
  'ifb',
  'in',
  'js',
  'json',
  'ksh',
  'list',
  'log',
  'markdown',
  'md',
  'mht',
  'mhtml',
  'mime',
  'mjs',
  'nws',
  'pl',
  'py',
  'rst',
  's',
  'sql',
  'srt',
  'text',
  'txt',
  'vcf',
  'vtt',
  'xml',
  'yaml',
  'yml',
] as const;

describe('allowed-file-formats', () => {
  it('allows the canonical text document MIME types', () => {
    for (const mime of CANONICAL_TEXT_DOCUMENT_MIME_TYPES) {
      expect(ALLOWED_TEXT_DOCUMENT_MIME_TYPES.has(mime)).toBe(true);
    }
  });

  it('matches canonical MIME types in the text document data URI regex', () => {
    for (const mime of CANONICAL_TEXT_DOCUMENT_MIME_TYPES) {
      expect(DATA_URI_TEXT_BASE64_REGEX.test(`data:${mime};base64,SGVsbG8=`)).toBe(true);
    }
  });

  it('maps the requested extensions to supported text document MIME types', () => {
    for (const extension of REQUESTED_TEXT_DOCUMENT_EXTENSIONS) {
      const mimeType = getMimeTypeFromExtension(extension);

      expect(mimeType).not.toBe('application/octet-stream');
      expect(ALLOWED_TEXT_DOCUMENT_MIME_TYPES.has(mimeType)).toBe(true);
    }
  });

  it('maps representative MIME types to the expected default extensions', () => {
    for (const [mimeType, extension] of [
      ['application/javascript', 'js'],
      ['application/typescript', 'ts'],
      ['text/xml', 'xml'],
      ['message/rfc822', 'eml'],
      ['application/yaml', 'yaml'],
      ['text/x-protobuf', 'proto'],
      ['text/x-terraform', 'tf'],
      ['text/x-dockerfile', 'dockerfile'],
      ['text/calendar', 'ics'],
      ['text/x-vcard', 'vcf'],
    ] as const) {
      expect(getExtensionFromMimeType(mimeType)).toBe(extension);
    }
  });

  it('treats .yaml and .yml as the same YAML MIME type', () => {
    expect(getMimeTypeFromExtension('yaml')).toBe('application/yaml');
    expect(getMimeTypeFromExtension('yml')).toBe('application/yaml');
  });

  describe('canonicalizeMimeType', () => {
    it('returns the canonical MIME for a known extension, ignoring the incoming MIME', () => {
      expect(canonicalizeMimeType('text/x-python-script', 'script.py')).toBe('text/x-python');
      expect(canonicalizeMimeType('text/x-golang', 'main.go')).toBe('text/x-go');
      expect(canonicalizeMimeType('application/x-bash', 'deploy.bash')).toBe('text/x-bash');
      expect(canonicalizeMimeType('text/javascript', 'app.js')).toBe('application/javascript');
      expect(canonicalizeMimeType('text/x-typescript', 'types.ts')).toBe('application/typescript');
    });

    it('canonicalizes iWork MIME types from filename extension', () => {
      expect(canonicalizeMimeType('application/x-iwork-keynote-sffkey', 'slides.key')).toBe(
        'application/vnd.apple.keynote'
      );
      expect(canonicalizeMimeType('application/x-iwork-pages-sffpages', 'doc.pages')).toBe(
        'application/vnd.apple.pages'
      );
      expect(canonicalizeMimeType('application/x-iwork-numbers-sffnumbers', 'data.numbers')).toBe(
        'application/vnd.apple.numbers'
      );
    });

    it('normalizes the MIME type when no filename is provided', () => {
      expect(canonicalizeMimeType('TEXT/X-PYTHON')).toBe('text/x-python');
      expect(canonicalizeMimeType('application/json; charset=utf-8')).toBe('application/json');
    });

    it.each(
      Object.entries(MIME_ALIAS_TO_CANONICAL_MIME_TYPE)
    )('canonicalizeMimeType(%s) -> %s (accepted)', (alias, expected) => {
      expect(canonicalizeMimeType(alias)).toBe(expected);
      expect(ALLOWED_TEXT_DOCUMENT_MIME_TYPES.has(expected)).toBe(true);
    });

    it('normalizes the MIME type when the extension is unknown', () => {
      expect(canonicalizeMimeType('text/x-python', 'script.unknownext')).toBe('text/x-python');
    });

    it('handles filenames without extensions', () => {
      expect(canonicalizeMimeType('text/x-python', 'Makefile')).toBe('text/x-python');
    });

    it('is case-insensitive for extensions', () => {
      expect(canonicalizeMimeType('text/x-python-script', 'SCRIPT.PY')).toBe('text/x-python');
    });
  });
});
