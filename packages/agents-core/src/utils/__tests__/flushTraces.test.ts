import { trace } from '@opentelemetry/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushTraces } from '../tracer-factory';

describe('flushTraces', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call forceFlush on delegate when provider has getDelegate', async () => {
    const mockForceFlush = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(trace, 'getTracerProvider').mockReturnValue({
      getTracer: vi.fn(),
      getDelegate: () => ({ forceFlush: mockForceFlush }),
    } as any);

    await flushTraces();
    expect(mockForceFlush).toHaveBeenCalledOnce();
  });

  it('should call forceFlush directly when provider has it but no getDelegate', async () => {
    const mockForceFlush = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(trace, 'getTracerProvider').mockReturnValue({
      getTracer: vi.fn(),
      forceFlush: mockForceFlush,
    } as any);

    await flushTraces();
    expect(mockForceFlush).toHaveBeenCalledOnce();
  });

  it('should not throw when provider has no forceFlush method', async () => {
    vi.spyOn(trace, 'getTracerProvider').mockReturnValue({
      getTracer: vi.fn(),
    } as any);

    await expect(flushTraces()).resolves.toBeUndefined();
  });

  it('should not throw when forceFlush rejects', async () => {
    const mockForceFlush = vi.fn().mockRejectedValue(new Error('Export failed'));
    vi.spyOn(trace, 'getTracerProvider').mockReturnValue({
      getTracer: vi.fn(),
      forceFlush: mockForceFlush,
    } as any);

    await expect(flushTraces()).resolves.toBeUndefined();
  });

  it('should not throw when getTracerProvider throws', async () => {
    vi.spyOn(trace, 'getTracerProvider').mockImplementation(() => {
      throw new Error('OTEL not initialized');
    });

    await expect(flushTraces()).resolves.toBeUndefined();
  });
});
