import { describe, expect, it } from 'vitest';
import {
  ALLOWED_TEXT_DOCUMENT_MIME_TYPES,
  DATA_URI_TEXT_BASE64_REGEX,
  getExtensionFromMimeType,
  getMimeTypeFromExtension,
} from '../../constants/allowed-file-formats';

const REQUESTED_TEXT_DOCUMENT_MIME_TYPES = [
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
  'application/x-sql',
  'application/x-scala',
  'application/x-rust',
  'application/x-powershell',
  'text/x-diff',
  'text/x-patch',
  'application/x-patch',
  'text/plain',
  'text/markdown',
  'text/x-java',
  'text/x-script.python',
  'text/x-python',
  'text/x-c',
  'text/x-c++',
  'text/x-golang',
  'text/html',
  'text/x-php',
  'application/x-php',
  'application/x-httpd-php',
  'application/x-httpd-php-source',
  'text/x-ruby',
  'text/x-sh',
  'text/x-bash',
  'application/x-bash',
  'text/x-zsh',
  'text/x-tex',
  'text/x-csharp',
  'application/json',
  'text/x-typescript',
  'text/javascript',
  'text/x-go',
  'text/x-rust',
  'text/x-scala',
  'text/x-kotlin',
  'text/x-swift',
  'text/x-lua',
  'text/x-r',
  'text/x-R',
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
  'application/x-awk',
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
  'application/x-protobuf',
  'text/x-sql',
  'text/x-sass',
  'text/x-scss',
  'text/x-less',
  'text/x-hcl',
  'text/x-terraform',
  'application/x-terraform',
  'text/x-toml',
  'application/x-toml',
  'application/graphql',
  'application/x-graphql',
  'text/x-graphql',
  'application/x-ndjson',
  'application/json5',
  'application/x-json5',
  'text/x-yaml',
  'application/toml',
  'application/x-yaml',
  'application/yaml',
  'text/x-astro',
  'text/srt',
  'application/x-subrip',
  'text/x-subrip',
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
  it('allows the requested text document MIME types', () => {
    for (const mime of REQUESTED_TEXT_DOCUMENT_MIME_TYPES) {
      expect(ALLOWED_TEXT_DOCUMENT_MIME_TYPES.has(mime)).toBe(true);
    }
  });

  it('matches the requested MIME types in the text document data URI regex', () => {
    for (const mime of REQUESTED_TEXT_DOCUMENT_MIME_TYPES) {
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
});
