import { describe, expect, it } from 'vitest';
import {
  HttpHeaderNameSchema,
  HttpHeadersRecordSchema,
  HttpHeaderValueSchema,
} from '../../validation';

describe('HttpHeaderNameSchema', () => {
  const valid = [
    'Content-Type',
    'X-Custom-Header',
    'Authorization',
    'x-api-key',
    'Accept',
    'X-Request-ID',
    'a',
    "!#$%&'*+-.^_`|~",
  ];

  it.each(valid)('accepts valid header name: %s', (name) => {
    expect(() => HttpHeaderNameSchema.parse(name)).not.toThrow();
  });

  it('rejects empty string', () => {
    expect(() => HttpHeaderNameSchema.parse('')).toThrow();
  });

  it('rejects names exceeding 128 characters', () => {
    const longName = 'X'.repeat(129);
    expect(() => HttpHeaderNameSchema.parse(longName)).toThrow();
  });

  it('accepts names at exactly 128 characters', () => {
    const maxName = 'X'.repeat(128);
    expect(() => HttpHeaderNameSchema.parse(maxName)).not.toThrow();
  });

  const invalidChars = ['Header Name', 'Header:Name', 'Header/Name', 'Header(Name', 'Header)Name'];

  it.each(invalidChars)('rejects name with invalid character: %s', (name) => {
    const result = HttpHeaderNameSchema.safeParse(name);
    expect(result.success).toBe(false);
  });
});

describe('HttpHeaderValueSchema', () => {
  it('accepts a normal value', () => {
    expect(() => HttpHeaderValueSchema.parse('application/json')).not.toThrow();
  });

  it('accepts a value with special characters', () => {
    expect(() => HttpHeaderValueSchema.parse('Bearer sk-abc123!@#$%')).not.toThrow();
  });

  it('rejects empty string', () => {
    expect(() => HttpHeaderValueSchema.parse('')).toThrow();
  });

  it('rejects value with carriage return', () => {
    expect(() => HttpHeaderValueSchema.parse('value\r\nInjected: header')).toThrow();
  });

  it('rejects value with newline', () => {
    expect(() => HttpHeaderValueSchema.parse('value\nInjected')).toThrow();
  });

  it('rejects value with null byte', () => {
    expect(() => HttpHeaderValueSchema.parse('value\0rest')).toThrow();
  });

  it('rejects values exceeding 1000 characters', () => {
    const longValue = 'x'.repeat(1001);
    expect(() => HttpHeaderValueSchema.parse(longValue)).toThrow();
  });

  it('accepts values at exactly 1000 characters', () => {
    const maxValue = 'x'.repeat(1000);
    expect(() => HttpHeaderValueSchema.parse(maxValue)).not.toThrow();
  });
});

describe('HttpHeadersRecordSchema', () => {
  it('accepts a valid headers record', () => {
    const result = HttpHeadersRecordSchema.parse({
      'X-Custom': 'value1',
      Authorization: 'Bearer token',
    });
    expect(result).toEqual({
      'X-Custom': 'value1',
      Authorization: 'Bearer token',
    });
  });

  it('accepts an empty record', () => {
    const result = HttpHeadersRecordSchema.parse({});
    expect(result).toEqual({});
  });

  it('rejects when a key has invalid characters', () => {
    const result = HttpHeadersRecordSchema.safeParse({
      'Invalid Header': 'value',
    });
    expect(result.success).toBe(false);
  });

  it('rejects when a value is empty', () => {
    const result = HttpHeadersRecordSchema.safeParse({
      'X-Key': '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects when a value exceeds max length', () => {
    const result = HttpHeadersRecordSchema.safeParse({
      'X-Key': 'x'.repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  const reservedNames = [
    'CONNECTION',
    'connection',
    'Content-Length',
    'Transfer-Encoding',
    'Keep-Alive',
    'Te',
    'Trailer',
    'Upgrade',
    'Proxy-Authorization',
    'proxy-connection',
  ];

  it.each(reservedNames)('rejects reserved header name: %s', (name) => {
    const result = HttpHeadersRecordSchema.safeParse({ [name]: 'value' });
    expect(result.success).toBe(false);
  });

  it('rejects when any key is reserved among valid keys', () => {
    const result = HttpHeadersRecordSchema.safeParse({
      'X-Custom': 'ok',
      connection: 'keep-alive',
    });
    expect(result.success).toBe(false);
  });

  it('works with .optional() at call site', () => {
    const schema = HttpHeadersRecordSchema.optional();
    expect(schema.parse(undefined)).toBeUndefined();
    expect(schema.parse({ 'X-Key': 'val' })).toEqual({ 'X-Key': 'val' });
  });

  it('works with .nullish() at call site', () => {
    const schema = HttpHeadersRecordSchema.nullish();
    expect(schema.parse(undefined)).toBeUndefined();
    expect(schema.parse(null)).toBeNull();
    expect(schema.parse({ 'X-Key': 'val' })).toEqual({ 'X-Key': 'val' });
  });
});
