export const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

const FILE_MIME_TYPE_TO_EXTENSION: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

const FILE_EXTENSION_TO_MIME_TYPE: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

const dataUriSubtypes = Array.from(ALLOWED_IMAGE_MIME_TYPES).flatMap((mime) => {
  const subtype = mime.replace('image/', '');
  return subtype === 'jpeg' ? ['jpeg', 'jpg'] : [subtype];
});

export const DATA_URI_IMAGE_BASE64_REGEX = new RegExp(
  `^data:image/(${dataUriSubtypes.join('|')});base64,`
);
export const DATA_URI_PDF_BASE64_REGEX = /^data:application\/pdf;base64,/;

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

export function getMimeTypeFromExtension(extension?: string): string {
  if (!extension) return 'application/octet-stream';
  const normalizedExtension = extension.replace(/^\./, '').trim().toLowerCase();
  return FILE_EXTENSION_TO_MIME_TYPE[normalizedExtension] || 'application/octet-stream';
}
