export const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
export const ALLOWED_TEXT_DOCUMENT_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/html',
  'text/csv',
  'text/x-log',
  'application/json',
]);
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
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/html': 'html',
  'text/csv': 'csv',
  'text/x-log': 'log',
  'application/json': 'json',
  ...ZIP_DOCUMENT_MIME_TYPE_TO_EXTENSION,
};

const FILE_EXTENSION_TO_MIME_TYPE: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  pdf: 'application/pdf',
  txt: 'text/plain',
  text: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  html: 'text/html',
  htm: 'text/html',
  csv: 'text/csv',
  log: 'text/x-log',
  json: 'application/json',
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

export const DATA_URI_IMAGE_BASE64_REGEX = new RegExp(
  `^data:image/(${dataUriSubtypes.join('|')});base64,`
);
export const DATA_URI_PDF_BASE64_REGEX = /^data:application\/pdf;base64,/;
export const DATA_URI_TEXT_BASE64_REGEX =
  /^data:(text\/(plain|markdown|html|csv|x-log)|application\/json);base64,/;
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
