// Text-document attachment helpers shared between agents-core's external-fetch
// pipeline and agents-api callers that build text-attachment markers. Lives in
// a sibling subpath because file-content-security depends on it; keeping them
// together avoids a cross-package import cycle.

export {
  buildAttachedFileMarker,
  buildDecodedTextAttachmentBlock,
  buildTextAttachmentBlock,
  buildUnavailableTextAttachmentBlock,
  decodeTextDocumentBytes,
  getDefaultTextDocumentFilename,
  isTextDocumentMimeType,
  UNAVAILABLE_ATTACHMENT_PLACEHOLDER,
} from './text-document-attachments';
