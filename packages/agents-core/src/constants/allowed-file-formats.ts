export const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const TEXT_DOCUMENT_MIME_TYPE_TO_EXTENSION: Record<string, string> = {
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/html': 'html',
  'text/csv': 'csv',
  'text/x-log': 'log',
  'application/json': 'json',
  'application/javascript': 'js',
  'application/typescript': 'ts',
  'text/xml': 'xml',
  'text/x-shellscript': 'sh',
  'text/x-rst': 'rst',
  'text/x-makefile': 'makefile',
  'text/x-lisp': 'lisp',
  'text/x-asm': 'asm',
  'text/vbscript': 'vbs',
  'text/css': 'css',
  'message/rfc822': 'eml',
  'application/x-sql': 'sql',
  'application/x-scala': 'scala',
  'application/x-rust': 'rs',
  'application/x-powershell': 'ps1',
  'text/x-diff': 'diff',
  'text/x-patch': 'patch',
  'application/x-patch': 'patch',
  'text/x-java': 'java',
  'text/x-script.python': 'py',
  'text/x-python': 'py',
  'text/x-c': 'c',
  'text/x-c++': 'cpp',
  'text/x-golang': 'go',
  'text/x-php': 'php',
  'application/x-php': 'php',
  'application/x-httpd-php': 'php',
  'application/x-httpd-php-source': 'php',
  'text/x-ruby': 'rb',
  'text/x-sh': 'sh',
  'text/x-bash': 'bash',
  'application/x-bash': 'bash',
  'text/x-zsh': 'zsh',
  'text/x-tex': 'tex',
  'text/x-csharp': 'cs',
  'text/x-typescript': 'ts',
  'text/javascript': 'js',
  'text/x-go': 'go',
  'text/x-rust': 'rs',
  'text/x-scala': 'scala',
  'text/x-kotlin': 'kt',
  'text/x-swift': 'swift',
  'text/x-lua': 'lua',
  'text/x-r': 'r',
  'text/x-R': 'r',
  'text/x-julia': 'jl',
  'text/x-perl': 'pl',
  'text/x-objectivec': 'm',
  'text/x-objectivec++': 'mm',
  'text/x-erlang': 'erl',
  'text/x-elixir': 'ex',
  'text/x-haskell': 'hs',
  'text/x-clojure': 'clj',
  'text/x-groovy': 'groovy',
  'text/x-dart': 'dart',
  'text/x-awk': 'awk',
  'application/x-awk': 'awk',
  'text/jsx': 'jsx',
  'text/tsx': 'tsx',
  'text/x-handlebars': 'hbs',
  'text/x-mustache': 'mustache',
  'text/x-ejs': 'ejs',
  'text/x-jinja2': 'jinja2',
  'text/x-liquid': 'liquid',
  'text/x-erb': 'erb',
  'text/x-twig': 'twig',
  'text/x-pug': 'pug',
  'text/x-jade': 'jade',
  'text/x-tmpl': 'tmpl',
  'text/x-cmake': 'cmake',
  'text/x-dockerfile': 'dockerfile',
  'text/x-gradle': 'gradle',
  'text/x-ini': 'ini',
  'text/x-properties': 'properties',
  'text/x-protobuf': 'proto',
  'application/x-protobuf': 'proto',
  'text/x-sql': 'sql',
  'text/x-sass': 'sass',
  'text/x-scss': 'scss',
  'text/x-less': 'less',
  'text/x-hcl': 'hcl',
  'text/x-terraform': 'tf',
  'application/x-terraform': 'tf',
  'text/x-toml': 'toml',
  'application/x-toml': 'toml',
  'application/graphql': 'graphql',
  'application/x-graphql': 'graphql',
  'text/x-graphql': 'graphql',
  'application/x-ndjson': 'ndjson',
  'application/json5': 'json5',
  'application/x-json5': 'json5',
  'text/x-yaml': 'yaml',
  'application/toml': 'toml',
  'application/x-yaml': 'yaml',
  'application/yaml': 'yaml',
  'text/x-astro': 'astro',
  'text/srt': 'srt',
  'application/x-subrip': 'srt',
  'text/x-subrip': 'srt',
  'text/vtt': 'vtt',
  'text/x-vcard': 'vcf',
  'text/calendar': 'ics',
};

const TEXT_DOCUMENT_EXTENSION_TO_MIME_TYPE: Record<string, string> = {
  txt: 'text/plain',
  text: 'text/plain',
  bat: 'text/plain',
  cfg: 'text/plain',
  conf: 'text/plain',
  def: 'text/plain',
  dic: 'text/plain',
  in: 'text/plain',
  list: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  html: 'text/html',
  htm: 'text/html',
  csv: 'text/csv',
  log: 'text/x-log',
  json: 'application/json',
  js: 'application/javascript',
  mjs: 'application/javascript',
  ts: 'application/typescript',
  jsx: 'text/jsx',
  tsx: 'text/tsx',
  xml: 'text/xml',
  sh: 'text/x-sh',
  bash: 'text/x-bash',
  zsh: 'text/x-zsh',
  ksh: 'text/x-shellscript',
  rst: 'text/x-rst',
  makefile: 'text/x-makefile',
  mk: 'text/x-makefile',
  lisp: 'text/x-lisp',
  asm: 'text/x-asm',
  s: 'text/x-asm',
  vbs: 'text/vbscript',
  css: 'text/css',
  eml: 'message/rfc822',
  mht: 'message/rfc822',
  mhtml: 'message/rfc822',
  mime: 'message/rfc822',
  nws: 'message/rfc822',
  sql: 'text/x-sql',
  scala: 'text/x-scala',
  rs: 'text/x-rust',
  ps1: 'application/x-powershell',
  diff: 'text/x-diff',
  patch: 'text/x-patch',
  java: 'text/x-java',
  py: 'text/x-python',
  c: 'text/x-c',
  h: 'text/x-c',
  cpp: 'text/x-c++',
  cc: 'text/x-c++',
  cxx: 'text/x-c++',
  hh: 'text/x-c++',
  go: 'text/x-go',
  php: 'text/x-php',
  rb: 'text/x-ruby',
  tex: 'text/x-tex',
  cs: 'text/x-csharp',
  kt: 'text/x-kotlin',
  swift: 'text/x-swift',
  lua: 'text/x-lua',
  r: 'text/x-r',
  jl: 'text/x-julia',
  pl: 'text/x-perl',
  m: 'text/x-objectivec',
  mm: 'text/x-objectivec++',
  erl: 'text/x-erlang',
  ex: 'text/x-elixir',
  hs: 'text/x-haskell',
  clj: 'text/x-clojure',
  groovy: 'text/x-groovy',
  dart: 'text/x-dart',
  awk: 'text/x-awk',
  hbs: 'text/x-handlebars',
  mustache: 'text/x-mustache',
  ejs: 'text/x-ejs',
  jinja: 'text/x-jinja2',
  jinja2: 'text/x-jinja2',
  liquid: 'text/x-liquid',
  erb: 'text/x-erb',
  twig: 'text/x-twig',
  pug: 'text/x-pug',
  jade: 'text/x-jade',
  tmpl: 'text/x-tmpl',
  cmake: 'text/x-cmake',
  dockerfile: 'text/x-dockerfile',
  gradle: 'text/x-gradle',
  ini: 'text/x-ini',
  properties: 'text/x-properties',
  proto: 'text/x-protobuf',
  sass: 'text/x-sass',
  scss: 'text/x-scss',
  less: 'text/x-less',
  hcl: 'text/x-hcl',
  tf: 'text/x-terraform',
  toml: 'application/toml',
  graphql: 'application/graphql',
  gql: 'application/graphql',
  ndjson: 'application/x-ndjson',
  json5: 'application/json5',
  yaml: 'application/yaml',
  yml: 'application/yaml',
  astro: 'text/x-astro',
  srt: 'text/srt',
  vtt: 'text/vtt',
  vcf: 'text/x-vcard',
  ics: 'text/calendar',
  ifb: 'text/calendar',
};

export const ALLOWED_TEXT_DOCUMENT_MIME_TYPES = new Set(
  Object.keys(TEXT_DOCUMENT_MIME_TYPE_TO_EXTENSION)
);
const ZIP_DOCUMENT_MIME_TYPE_TO_EXTENSION: Record<string, string> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/vnd.oasis.opendocument.spreadsheet': 'ods',
  'application/vnd.oasis.opendocument.presentation': 'odp',
  'application/vnd.apple.pages': 'pages',
  'application/vnd.apple.numbers': 'numbers',
  'application/vnd.apple.keynote': 'key',
};

export const ZIP_DOCUMENT_EXTENSIONS = Object.values(ZIP_DOCUMENT_MIME_TYPE_TO_EXTENSION);
export const ZIP_DOCUMENT_EXTENSIONS_LABEL = ZIP_DOCUMENT_EXTENSIONS.map((ext) => `.${ext}`).join(
  ', '
);

export const ALLOWED_OFFICE_DOCUMENT_MIME_TYPES = new Set(
  Object.keys(ZIP_DOCUMENT_MIME_TYPE_TO_EXTENSION)
);

const FILE_MIME_TYPE_TO_EXTENSION: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  ...TEXT_DOCUMENT_MIME_TYPE_TO_EXTENSION,
  ...ZIP_DOCUMENT_MIME_TYPE_TO_EXTENSION,
};

const FILE_EXTENSION_TO_MIME_TYPE: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  pdf: 'application/pdf',
  ...TEXT_DOCUMENT_EXTENSION_TO_MIME_TYPE,
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  pages: 'application/vnd.apple.pages',
  numbers: 'application/vnd.apple.numbers',
  key: 'application/vnd.apple.keynote',
};

const dataUriSubtypes = Array.from(ALLOWED_IMAGE_MIME_TYPES).flatMap((mime) => {
  const subtype = mime.replace('image/', '');
  return subtype === 'jpeg' ? ['jpeg', 'jpg'] : [subtype];
});

const escapeForRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const officeDataUriMimePattern = Object.keys(ZIP_DOCUMENT_MIME_TYPE_TO_EXTENSION)
  .map(escapeForRegex)
  .join('|');
const textDocumentDataUriMimePattern = Array.from(ALLOWED_TEXT_DOCUMENT_MIME_TYPES)
  .map(escapeForRegex)
  .join('|');

export const DATA_URI_IMAGE_BASE64_REGEX = new RegExp(
  `^data:image/(${dataUriSubtypes.join('|')});base64,`
);
export const DATA_URI_PDF_BASE64_REGEX = /^data:application\/pdf;base64,/;
export const DATA_URI_TEXT_BASE64_REGEX = new RegExp(
  `^data:(?:${textDocumentDataUriMimePattern});base64,`
);
export const DATA_URI_OFFICE_BASE64_REGEX = new RegExp(
  `^data:(?:${officeDataUriMimePattern});base64,`
);

export function normalizeMimeType(mimeType: string): string {
  return mimeType.split(';')[0]?.trim().toLowerCase() || '';
}

export function getExtensionFromMimeType(mimeType?: string): string {
  if (!mimeType) return 'bin';
  const normalizedMimeType = normalizeMimeType(mimeType);
  return (
    FILE_MIME_TYPE_TO_EXTENSION[normalizedMimeType] || normalizedMimeType.split('/')[1] || 'bin'
  );
}

export function isOfficeDocumentMimeType(mimeType?: string): boolean {
  if (!mimeType) return false;
  return ALLOWED_OFFICE_DOCUMENT_MIME_TYPES.has(normalizeMimeType(mimeType));
}

export function getMimeTypeFromExtension(extension?: string): string {
  if (!extension) return 'application/octet-stream';
  const normalizedExtension = extension.replace(/^\./, '').trim().toLowerCase();
  return FILE_EXTENSION_TO_MIME_TYPE[normalizedExtension] || 'application/octet-stream';
}
