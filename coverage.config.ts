/**
 * Unified Coverage Configuration for Monorepo
 *
 * This configuration defines the coverage threshold progression strategy
 * for all packages in the monorepo. Each package can be at different phases
 * of coverage maturity.
 */

export interface CoverageThresholds {
  lines: number;
  statements: number;
  functions: number;
  branches: number;
}

export interface PackageCoverageConfig {
  package: string;
  phase: 'baseline' | 'intermediate' | 'target';
  thresholds: CoverageThresholds;
  customThresholds?: Partial<CoverageThresholds>; // Override specific metrics
}

/**
 * Coverage progression phases
 * - baseline: Minimum acceptable coverage for new/legacy code
 * - intermediate: Mid-term goal for actively developed packages
 * - target: Long-term goal for mature, stable packages
 */
export const COVERAGE_PHASES = {
  baseline: {
    lines: 30,
    statements: 30,
    functions: 40,
    branches: 50,
  },
  intermediate: {
    lines: 60,
    statements: 60,
    functions: 65,
    branches: 65,
  },
  target: {
    lines: 75,
    statements: 75,
    functions: 75,
    branches: 75,
  },
} as const;

/**
 * Package-specific coverage configurations
 * Packages progress through phases based on their maturity and development status
 */
export const PACKAGE_CONFIGS: PackageCoverageConfig[] = [
  {
    package: 'configuration-api',
    phase: 'baseline',
    thresholds: COVERAGE_PHASES.baseline,
    // Custom override based on current coverage
    customThresholds: {
      functions: 50, // Current: 61.62%, set realistic intermediate goal
    },
  },
  {
    package: 'execution-api',
    phase: 'baseline',
    thresholds: COVERAGE_PHASES.baseline,
    // Custom override based on current coverage
    customThresholds: {
      functions: 50, // Current: 61.62%, set realistic intermediate goal
    },
  },
  {
    package: 'agent-builder',
    phase: 'baseline',
    thresholds: COVERAGE_PHASES.baseline,
  },
  {
    package: 'cli',
    phase: 'intermediate',
    thresholds: COVERAGE_PHASES.intermediate,
    // CLI has higher current coverage, aim for target
    customThresholds: {
      lines: 70,
      statements: 70,
      functions: 70,
      branches: 70,
    },
  },
  {
    package: 'packages/core',
    phase: 'target',
    thresholds: COVERAGE_PHASES.target,
  },
];

/**
 * Get coverage thresholds for a specific package
 */
export function getPackageThresholds(packageName: string): CoverageThresholds {
  const config = PACKAGE_CONFIGS.find((c) => c.package === packageName);

  if (!config) {
    // Default to baseline for new packages
    console.warn(`No coverage config for ${packageName}, using baseline thresholds`);
    return COVERAGE_PHASES.baseline;
  }

  // Merge phase thresholds with custom overrides
  return {
    ...config.thresholds,
    ...config.customThresholds,
  };
}

/**
 * Get the overall monorepo thresholds (minimum of all packages)
 */
export function getMonorepoThresholds(): CoverageThresholds {
  const allThresholds = PACKAGE_CONFIGS.map((config) => ({
    ...config.thresholds,
    ...config.customThresholds,
  }));

  return {
    lines: Math.min(...allThresholds.map((t) => t.lines)),
    statements: Math.min(...allThresholds.map((t) => t.statements)),
    functions: Math.min(...allThresholds.map((t) => t.functions)),
    branches: Math.min(...allThresholds.map((t) => t.branches)),
  };
}

/**
 * Generate Vitest coverage config for a package
 * Special handling for 'monorepo' returns minimum thresholds across all packages
 */
export function generateVitestCoverageConfig(packageName: string) {
  // Special case: 'monorepo' uses minimum thresholds across all packages
  const thresholds =
    packageName === 'monorepo' ? getMonorepoThresholds() : getPackageThresholds(packageName);

  return {
    provider: 'v8' as const,
    reporter: ['text', 'html', 'json', 'lcov', 'json-summary'] as const,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/tests/**',
      '**/__tests__/**',
      '**/coverage/**',
      '**/.next/**',
      '**/vitest.config.ts',
      '**/next.config.js',
      '**/postcss.config.js',
      '**/tailwind.config.ts',
      '**/*.d.ts',
      '**/setup.ts',
      '**/setup-files/**',
    ],
    thresholds: {
      lines: thresholds.lines,
      statements: thresholds.statements,
      functions: thresholds.functions,
      branches: thresholds.branches,
    },
  };
}

/**
 * CLI helper to display coverage phase information
 */
export function displayCoveragePhases() {
  console.log('📊 Coverage Progression Phases:\n');

  Object.entries(COVERAGE_PHASES).forEach(([phase, thresholds]) => {
    console.log(`${phase.toUpperCase()}:`);
    console.log(`  Lines:      ${thresholds.lines}%`);
    console.log(`  Statements: ${thresholds.statements}%`);
    console.log(`  Functions:  ${thresholds.functions}%`);
    console.log(`  Branches:   ${thresholds.branches}%\n`);
  });

  console.log('📦 Package Coverage Targets:\n');
  PACKAGE_CONFIGS.forEach((config) => {
    const thresholds = getPackageThresholds(config.package);
    console.log(`${config.package} (${config.phase}):`);
    console.log(`  Lines:      ${thresholds.lines}%`);
    console.log(`  Statements: ${thresholds.statements}%`);
    console.log(`  Functions:  ${thresholds.functions}%`);
    console.log(`  Branches:   ${thresholds.branches}%\n`);
  });
}
