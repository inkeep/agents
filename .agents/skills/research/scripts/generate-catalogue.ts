// generate-catalogue.ts
//
// Scans <reports-dir>/*/REPORT.md, validates structure,
// extracts YAML frontmatter via gray-matter, and writes CATALOGUE.md.
//
// Resolution priority:
//   1. --reports-dir flag
//   2. CLAUDE_REPORTS_DIR env var
//   3. <git-root>/reports/ (if in a repo and directory exists)
//   4. ~/reports/
//
// Usage: bun run generate-catalogue.ts [--reports-dir <path>]

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import matter from "gray-matter";
import os from "node:os";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReportFrontmatter {
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  subjects?: string[];
  topics?: string[];
}

const REQUIRED_FIELDS: (keyof ReportFrontmatter)[] = [
  "title",
  "description",
  "createdAt",
  "updatedAt",
];

interface ValidReport {
  slug: string;
  frontmatter: ReportFrontmatter;
  evidenceCount: number;
  reportPath: string;
}

interface ValidationIssue {
  slug: string;
  level: "error" | "warn";
  message: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateReport(
  reportDir: string,
  reportsRoot: string
): { report: ValidReport | null; issues: ValidationIssue[] } {
  const slug = path.basename(reportDir);
  const issues: ValidationIssue[] = [];
  const reportFile = path.join(reportDir, "REPORT.md");

  // 1. REPORT.md must exist
  if (!fs.existsSync(reportFile)) {
    issues.push({ slug, level: "error", message: "Missing REPORT.md" });
    return { report: null, issues };
  }

  const raw = fs.readFileSync(reportFile, "utf-8");

  // 2. Must have YAML frontmatter (starts with ---)
  if (!raw.startsWith("---")) {
    issues.push({
      slug,
      level: "error",
      message:
        "No YAML frontmatter. REPORT.md must start with --- delimited YAML block.",
    });
    return { report: null, issues };
  }

  // 3. Parse frontmatter
  let data: Record<string, unknown>;
  try {
    const parsed = matter(raw);
    data = parsed.data;
  } catch (e) {
    issues.push({
      slug,
      level: "error",
      message: `Invalid YAML frontmatter: ${e instanceof Error ? e.message : String(e)}`,
    });
    return { report: null, issues };
  }

  if (!data || Object.keys(data).length === 0) {
    issues.push({
      slug,
      level: "error",
      message: "YAML frontmatter is empty.",
    });
    return { report: null, issues };
  }

  // 4. Check required fields
  for (const field of REQUIRED_FIELDS) {
    if (!(field in data) || !data[field]) {
      issues.push({
        slug,
        level: "error",
        message: `Missing required frontmatter field: "${field}"`,
      });
    }
  }

  // 5. Validate array field types
  for (const arrayField of ["subjects", "topics"] as const) {
    if (data[arrayField] && !Array.isArray(data[arrayField])) {
      issues.push({
        slug,
        level: "error",
        message: `"${arrayField}" must be a YAML array, got ${typeof data[arrayField]}`,
      });
    }
  }

  // 6. Validate date formats (YYYY-MM-DD)
  for (const dateField of ["createdAt", "updatedAt"] as const) {
    const val = data[dateField];
    if (val) {
      const dateStr = val instanceof Date ? val.toISOString().split("T")[0] : String(val);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        issues.push({
          slug,
          level: "warn",
          message: `"${dateField}" should be YYYY-MM-DD format, got "${dateStr}"`,
        });
      }
    }
  }

  // 7. Validate topics are <=3 words each
  if (Array.isArray(data.topics)) {
    for (const topic of data.topics as string[]) {
      if (typeof topic === "string" && topic.split(/\s+/).length > 3) {
        issues.push({
          slug,
          level: "warn",
          message: `Topic "${topic}" exceeds 3-word limit`,
        });
      }
    }
  }

  // 8. Validate directory structure
  const evidenceDir = path.join(reportDir, "evidence");
  let evidenceCount = 0;

  if (fs.existsSync(evidenceDir)) {
    const evidenceFiles = fs
      .readdirSync(evidenceDir)
      .filter((f) => f.endsWith(".md"));
    evidenceCount = evidenceFiles.length;

    if (evidenceCount === 0) {
      issues.push({
        slug,
        level: "warn",
        message: "evidence/ directory exists but contains no .md files",
      });
    }

    // Check for non-markdown files in evidence/
    const nonMd = fs
      .readdirSync(evidenceDir)
      .filter((f) => !f.endsWith(".md") && !f.startsWith("."));
    if (nonMd.length > 0) {
      issues.push({
        slug,
        level: "warn",
        message: `evidence/ contains non-.md files: ${nonMd.join(", ")}`,
      });
    }
  }

  // 9. Validate meta/ structure if present
  const metaDir = path.join(reportDir, "meta");
  if (fs.existsSync(metaDir)) {
    const changelog = path.join(metaDir, "_changelog.md");
    if (!fs.existsSync(changelog)) {
      issues.push({
        slug,
        level: "warn",
        message: "meta/ exists but missing _changelog.md",
      });
    }

    const runsDir = path.join(metaDir, "runs");
    if (fs.existsSync(runsDir)) {
      const runDirs = fs
        .readdirSync(runsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory());

      for (const runDir of runDirs) {
        if (!/^\d{4}-\d{2}-\d{2}-.+$/.test(runDir.name)) {
          issues.push({
            slug,
            level: "warn",
            message: `Invalid run ID format: "${runDir.name}" (expected YYYY-MM-DD-<label>)`,
          });
        }

        const runMd = path.join(runsDir, runDir.name, "RUN.md");
        if (!fs.existsSync(runMd)) {
          issues.push({
            slug,
            level: "warn",
            message: `Run directory "${runDir.name}" missing RUN.md`,
          });
        }
      }
    }

    const deprecated = ["_shared-context.md", "_coverage.md"];
    for (const dep of deprecated) {
      if (fs.existsSync(path.join(metaDir, dep))) {
        issues.push({
          slug,
          level: "warn",
          message: `Deprecated artifact found: meta/${dep}`,
        });
      }
    }
  }

  // 10. Check for stray files at report root
  const allowedRootFiles = ["REPORT.md"];
  const allowedRootDirs = ["evidence", "meta"];
  const rootEntries = fs.readdirSync(reportDir, { withFileTypes: true });
  for (const entry of rootEntries) {
    if (entry.name.startsWith(".")) continue;
    if (entry.isFile() && !allowedRootFiles.includes(entry.name)) {
      issues.push({
        slug,
        level: "warn",
        message: `Unexpected file at report root: ${entry.name}`,
      });
    }
    if (entry.isDirectory() && !allowedRootDirs.includes(entry.name)) {
      issues.push({
        slug,
        level: "warn",
        message: `Unexpected directory at report root: ${entry.name}/`,
      });
    }
  }

  // Build valid report if no errors
  const hasErrors = issues.some((i) => i.level === "error");
  if (hasErrors) {
    return { report: null, issues };
  }

  // Normalize date values (gray-matter parses YAML dates as Date objects)
  const toDateStr = (val: unknown): string => {
    if (val instanceof Date) return val.toISOString().split("T")[0];
    return String(val);
  };

  return {
    report: {
      slug,
      frontmatter: {
        title: String(data.title),
        description: String(data.description),
        createdAt: toDateStr(data.createdAt),
        updatedAt: toDateStr(data.updatedAt),
        subjects: Array.isArray(data.subjects) ? data.subjects : undefined,
        topics: Array.isArray(data.topics) ? data.topics : undefined,
      },
      evidenceCount,
      reportPath: path.relative(reportsRoot, reportFile),
    },
    issues,
  };
}

// ---------------------------------------------------------------------------
// Catalogue generation
// ---------------------------------------------------------------------------

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + "\u2026";
}

function generateCatalogue(
  reports: ValidReport[],
  allIssues: ValidationIssue[]
): string {
  const now = new Date().toISOString().split("T")[0];

  // Sort by updatedAt descending (most recently updated first)
  const sorted = [...reports].sort((a, b) =>
    b.frontmatter.updatedAt.localeCompare(a.frontmatter.updatedAt)
  );

  const lines: string[] = [];

  lines.push("# Research Reports Catalogue");
  lines.push("");
  lines.push(`> Auto-generated on ${now} by \`generate-catalogue.ts\``);
  lines.push(`> ${sorted.length} valid reports indexed`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // Summary table
  lines.push(
    "| Report | Updated | Evidence | Topics | Subjects |"
  );
  lines.push(
    "|--------|---------|----------|--------|----------|"
  );

  for (const r of sorted) {
    const fm = r.frontmatter;
    const link = `[${truncate(fm.title, 55)}](${r.reportPath})`;
    const topics = fm.topics?.length
      ? truncate(fm.topics.join(", "), 35)
      : "\u2014";
    const subjects = fm.subjects?.length
      ? truncate(fm.subjects.join(", "), 35)
      : "\u2014";
    const evidence =
      r.evidenceCount > 0 ? `${r.evidenceCount} files` : "\u2014";

    lines.push(
      `| ${link} | ${fm.updatedAt} | ${evidence} | ${topics} | ${subjects} |`
    );
  }

  lines.push("");
  lines.push("---");
  lines.push("");

  // Detail cards
  lines.push("## Report Details");
  lines.push("");

  for (const r of sorted) {
    const fm = r.frontmatter;
    const reportWarnings = allIssues.filter(
      (i) => i.slug === r.slug && i.level === "warn"
    );

    lines.push(`### [${fm.title}](${r.reportPath})`);
    lines.push("");
    lines.push(`> ${truncate(fm.description, 300)}`);
    lines.push("");
    lines.push(`- **Created:** ${fm.createdAt}`);
    if (fm.createdAt !== fm.updatedAt) {
      lines.push(`- **Updated:** ${fm.updatedAt}`);
    }
    if (fm.topics?.length) {
      lines.push(`- **Topics:** ${fm.topics.join(", ")}`);
    }
    if (fm.subjects?.length) {
      lines.push(`- **Subjects:** ${fm.subjects.join(", ")}`);
    }
    if (r.evidenceCount > 0) {
      lines.push(`- **Evidence files:** ${r.evidenceCount}`);
    }
    if (reportWarnings.length > 0) {
      lines.push(`- **Warnings:** ${reportWarnings.length}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Console output
// ---------------------------------------------------------------------------

function printValidation(allIssues: ValidationIssue[], validCount: number) {
  const errors = allIssues.filter((i) => i.level === "error");
  const warns = allIssues.filter((i) => i.level === "warn");

  if (errors.length > 0) {
    console.log("");
    console.log("INVALID REPORTS:");
    const bySlug = new Map<string, ValidationIssue[]>();
    for (const issue of errors) {
      const existing = bySlug.get(issue.slug) || [];
      existing.push(issue);
      bySlug.set(issue.slug, existing);
    }
    for (const [slug, issues] of bySlug) {
      console.log(`  ${slug}/`);
      for (const issue of issues) {
        console.log(`    \u2718 ${issue.message}`);
      }
    }
  }

  if (warns.length > 0) {
    console.log("");
    console.log("WARNINGS:");
    const bySlug = new Map<string, ValidationIssue[]>();
    for (const issue of warns) {
      const existing = bySlug.get(issue.slug) || [];
      existing.push(issue);
      bySlug.set(issue.slug, existing);
    }
    for (const [slug, issues] of bySlug) {
      console.log(`  ${slug}/`);
      for (const issue of issues) {
        console.log(`    \u26a0 ${issue.message}`);
      }
    }
  }

  console.log("");
  console.log(
    `Summary: ${validCount} valid, ${errors.length} errors, ${warns.length} warnings`
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Resolve the reports directory using the priority chain:
 *   1. --reports-dir flag
 *   2. CLAUDE_REPORTS_DIR env var
 *   3. <git-root>/reports/ (if in a repo and directory exists)
 *   4. ~/reports/
 */
function resolveReportsDir(args: string[]): string {
  // Priority 1: --reports-dir flag
  const dirIdx = args.indexOf("--reports-dir");
  if (dirIdx !== -1 && args[dirIdx + 1]) {
    return path.resolve(args[dirIdx + 1]);
  }

  // Priority 2: env var
  if (process.env.CLAUDE_REPORTS_DIR) {
    return path.resolve(process.env.CLAUDE_REPORTS_DIR);
  }

  // Priority 3: repo-local reports/ (if in a git repo and directory exists)
  try {
    const gitRoot = execSync("git rev-parse --show-toplevel", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    const repoReports = path.join(gitRoot, "reports");
    if (fs.existsSync(repoReports)) {
      return repoReports;
    }
  } catch {
    // Not in a git repo — fall through
  }

  // Priority 4: user-level ~/reports
  return path.join(os.homedir(), "reports");
}

function main() {
  const args = process.argv.slice(2);
  const reportsDir = resolveReportsDir(args);

  if (!fs.existsSync(reportsDir)) {
    console.error(`Reports directory not found: ${reportsDir}`);
    process.exit(1);
  }

  // Scan for report directories
  const entries = fs.readdirSync(reportsDir, { withFileTypes: true });
  const reportDirs = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => path.join(reportsDir, e.name));

  const validReports: ValidReport[] = [];
  const allIssues: ValidationIssue[] = [];

  for (const dir of reportDirs) {
    const { report, issues } = validateReport(dir, reportsDir);
    allIssues.push(...issues);
    if (report) {
      validReports.push(report);
    }
  }

  // Print validation results
  printValidation(allIssues, validReports.length);

  // Generate catalogue from valid reports only
  if (validReports.length > 0) {
    const catalogue = generateCatalogue(validReports, allIssues);
    const outPath = path.join(reportsDir, "CATALOGUE.md");
    fs.writeFileSync(outPath, catalogue, "utf-8");
    console.log(`\nCatalogue written to ${outPath}`);
  } else {
    console.log("\nNo valid reports to catalogue.");
  }

  // Exit with error code if any errors found
  const hasErrors = allIssues.some((i) => i.level === "error");
  if (hasErrors) {
    process.exit(1);
  }
}

main();
