export const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

const dataUriSubtypes = Array.from(ALLOWED_IMAGE_MIME_TYPES).flatMap((mime) => {
  const subtype = mime.replace('image/', '');
  return subtype === 'jpeg' ? ['jpeg', 'jpg'] : [subtype];
});

export const DATA_URI_IMAGE_BASE64_REGEX = new RegExp(
  `^data:image/(${dataUriSubtypes.join('|')});base64,`
);
