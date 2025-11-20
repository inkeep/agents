export declare const consoleLoggerLevels: readonly ["debug", "warning", "info", "error"];
export type ConsoleLoggerLevel = (typeof consoleLoggerLevels)[number];
export type ConsoleLogger = {
    [key in ConsoleLoggerLevel]: (message: string, data?: Record<string, unknown>) => void;
} & {
    level: ConsoleLoggerLevel;
};
export declare function createConsoleLogger(level: ConsoleLoggerLevel): ConsoleLogger;
//# sourceMappingURL=console-logger.d.ts.map