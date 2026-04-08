import { vi } from 'vitest';

export interface MockLogger {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  child: ReturnType<typeof vi.fn>;
  with: ReturnType<typeof vi.fn>;
  getPinoInstance: ReturnType<typeof vi.fn>;
}

export interface MockLoggerModule {
  getLogger: ReturnType<typeof vi.fn>;
  runWithLogContext: ReturnType<typeof vi.fn>;
}

export interface MockLoggerResult {
  mockLogger: MockLogger;
  module: MockLoggerModule;
  /** Clear all mock call data. Use in beforeEach when asserting on logger calls. */
  clearAll: () => void;
}

export function createMockLogger(): MockLogger {
  const mockLogger: MockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
    with: vi.fn(),
    getPinoInstance: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    }),
  };
  mockLogger.child.mockReturnValue(mockLogger);
  mockLogger.with.mockReturnValue(mockLogger);
  return mockLogger;
}

export function createMockLoggerModule(): MockLoggerResult {
  const mockLogger = createMockLogger();
  const module: MockLoggerModule = {
    getLogger: vi.fn(() => mockLogger),
    runWithLogContext: vi.fn((_bindings: any, fn: any) => fn()),
  };
  return {
    mockLogger,
    module,
    clearAll: () => {
      for (const fn of Object.values(mockLogger)) {
        if (typeof fn === 'function' && 'mockClear' in fn) {
          (fn as ReturnType<typeof vi.fn>).mockClear();
        }
      }
      for (const fn of Object.values(module)) {
        if (typeof fn === 'function' && 'mockClear' in fn) {
          (fn as ReturnType<typeof vi.fn>).mockClear();
        }
      }
    },
  };
}
