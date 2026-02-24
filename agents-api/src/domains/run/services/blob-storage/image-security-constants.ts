/**
 * Shared limits and allowlists for image safety checks.
 * Allowed image MIME types come from run/constants/allowed-image-formats (single source of truth).
 */
import { ALLOWED_IMAGE_MIME_TYPES } from '../../constants/allowed-image-formats';

export const MAX_EXTERNAL_IMAGE_BYTES = 10 * 1024 * 1024;

export const EXTERNAL_FETCH_TIMEOUT_MS = 10_000;

export const MAX_EXTERNAL_REDIRECTS = 3;

export const ALLOWED_EXTERNAL_IMAGE_MIME_TYPES = ALLOWED_IMAGE_MIME_TYPES;

export const ALLOWED_HTTP_PORTS = new Set(['', '80', '443']);
