/**
 * Shared utilities for sandbox executors
 */

/**
 * Create an execution wrapper that handles input/output for function tools
 * This is used by both Native and Vercel sandbox executors
 */
export function createExecutionWrapper(executeCode: string, args: Record<string, unknown>): string {
  return `
// Function tool execution wrapper
const args = ${JSON.stringify(args, null, 2)};

// User's function code
const execute = ${executeCode}

// Execute the function and output the result
(async () => {
  try {
    const result = await execute(args);
    // Output result as JSON on the last line
    console.log(JSON.stringify({ success: true, result }));
  } catch (error) {
    console.error(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    }));
    process.exit(1);
  }
})();
`;
}

/**
 * Parse execution result from stdout
 * Returns the parsed result or the raw stdout if parsing fails
 */
export function parseExecutionResult(
  stdout: string,
  functionId: string,
  logger?: { warn: (obj: unknown, msg: string) => void }
): unknown {
  try {
    // The last line of stdout should contain the JSON result
    const outputLines = stdout.split('\n').filter((line: string) => line.trim());
    const resultLine = outputLines[outputLines.length - 1];
    return JSON.parse(resultLine);
  } catch (parseError) {
    if (logger) {
      logger.warn(
        {
          functionId,
          stdout,
          parseError,
        },
        'Failed to parse execution result'
      );
    }
    return stdout;
  }
}
