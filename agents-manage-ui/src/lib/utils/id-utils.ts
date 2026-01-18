import { customAlphabet } from 'nanoid';

// This ensures IDs are always lowercase and never start with a hyphen
export const generateId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 21);
