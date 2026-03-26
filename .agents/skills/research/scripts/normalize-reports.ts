#!/usr/bin/env bun
/**
 * Batch normalizer for research reports.
 * Adds YAML frontmatter, renames directories (drops "best-" filler),
 * creates meta/_changelog.md, removes stray files.
 *
 * NEVER changes report substance — only structural/metadata fixes.
 *
 * Resolution priority:
 *   1. --reports-dir flag
 *   2. CLAUDE_REPORTS_DIR env var
 *   3. <git-root>/reports/ (if in a repo and directory exists)
 *   4. ~/reports/
 *
 * Usage: bun run normalize-reports.ts [--reports-dir <path>] [--dry-run]
 */

import { readdir, readFile, writeFile, mkdir, rename, unlink, stat } from "fs/promises";
import { join, basename, resolve } from "path";
import { existsSync } from "fs";
import { execSync } from "child_process";
import { homedir } from "os";

/**
 * Resolve the reports directory using the priority chain:
 *   1. --reports-dir flag
 *   2. CLAUDE_REPORTS_DIR env var
 *   3. <git-root>/reports/ (if in a repo and directory exists)
 *   4. ~/reports/
 */
function resolveReportsDir(): string {
  // Priority 1: --reports-dir flag
  const args = process.argv.slice(2);
  const dirIdx = args.indexOf("--reports-dir");
  if (dirIdx !== -1 && args[dirIdx + 1]) {
    return resolve(args[dirIdx + 1]);
  }

  // Priority 2: env var
  if (process.env.CLAUDE_REPORTS_DIR) {
    return resolve(process.env.CLAUDE_REPORTS_DIR);
  }

  // Priority 3: repo-local reports/ (if in a git repo and directory exists)
  try {
    const gitRoot = execSync("git rev-parse --show-toplevel", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    const repoReports = join(gitRoot, "reports");
    if (existsSync(repoReports)) {
      return repoReports;
    }
  } catch {
    // Not in a git repo — fall through
  }

  // Priority 4: user-level ~/reports
  return join(homedir(), "reports");
}

const REPORTS_DIR = resolveReportsDir();
const DRY_RUN = process.argv.includes("--dry-run");
const TODAY = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

interface ExtractedMeta {
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  subjects: string[];
  topics: string[];
}

// Reports that should be renamed (drop "best-" filler)
const RENAME_MAP: Record<string, string> = {
  "sre-best-practices": "sre-practices",
  "release-engineering-best-practices": "release-engineering-practices",
  "devtools-product-devex-best-practices": "devtools-product-devex-practices",
  "engineering-design-doc-best-practices": "engineering-design-doc-practices",
  "ai-llm-infrastructure-best-practices": "ai-llm-infrastructure-practices",
  "pr-review-output-best-practices": "pr-review-output-practices",
  "llm-best-practices": "llm-practices",
  "devops-best-practices": "devops-practices",
  "product-spec-best-practices": "product-spec-practices",
  "secret-management-best-practices": "secret-management-practices",
};

function extractDate(line: string): string {
  // Match YYYY-MM-DD pattern
  const match = line.match(/(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  // Match "Month DD, YYYY" or "DD Month YYYY"
  const dateStr = line.replace(/\*\*(Date|Last [Uu]pdated|Last updated):\*\*\s*/, "").trim();
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split("T")[0];
    }
  } catch {}
  return "";
}

function extractProperNouns(text: string): string[] {
  // Extract proper nouns from Sources line and content
  const nouns = new Set<string>();

  // Common proper nouns to look for in reports
  const knownSubjects = [
    "Claude", "Claude Code", "Anthropic", "OpenAI", "GPT", "ChatGPT",
    "GitHub", "GitLab", "Bitbucket", "Azure", "AWS", "GCP", "Google Cloud",
    "Docker", "Kubernetes", "Terraform", "Ansible", "Jenkins", "CircleCI",
    "Datadog", "PagerDuty", "Splunk", "Grafana", "Prometheus",
    "LangChain", "LangSmith", "LangGraph", "HuggingFace",
    "React", "Next.js", "Vue", "Angular", "Svelte",
    "Node.js", "Bun", "Deno", "Python", "TypeScript", "JavaScript",
    "PostgreSQL", "MongoDB", "Redis", "Supabase", "Firebase",
    "Vercel", "Netlify", "Cloudflare", "Fastly",
    "Slack", "Discord", "Linear", "Jira", "Notion",
    "MCP", "Model Context Protocol",
    "Cursor", "Windsurf", "Cody", "Copilot", "GitHub Copilot",
    "OpenHands", "SWE-agent", "Devin", "Codex",
    "Better Auth", "Auth.js", "NextAuth",
    "Temporal", "Inngest", "pg-boss", "BullMQ",
    "Hono", "Express", "Fastify", "Nitro",
    "SARIF", "OWASP", "NIST", "SOC 2",
    "Apollo", "LinkedIn", "Twilio",
    "HashiCorp Vault", "Doppler", "Infisical",
    "n8n", "Figma", "shadcn/ui",
    "Inkeep",
    "SRE", "DevOps", "CI/CD",
    "PLG", "SaaS",
  ];

  for (const noun of knownSubjects) {
    if (text.includes(noun)) {
      nouns.add(noun);
    }
  }

  return Array.from(nouns).slice(0, 15);
}

function deriveTopics(content: string, title: string): string[] {
  const topics: string[] = [];
  const lowerContent = (content + " " + title).toLowerCase();

  const topicMap: Record<string, string> = {
    "pr review": "PR review",
    "code review": "code review",
    "security": "security",
    "authentication": "authentication",
    "multi-tenant": "multi-tenancy",
    "developer experience": "developer experience",
    "devex": "developer experience",
    "best practice": "engineering practices",
    "architecture": "architecture",
    "design pattern": "design patterns",
    "agent": "AI agents",
    "prompt engineering": "prompt engineering",
    "context management": "context management",
    "orchestrat": "orchestration",
    "human-in-the-loop": "human-in-the-loop",
    "hitl": "human-in-the-loop",
    "supply chain": "supply chain",
    "secret management": "secrets management",
    "mcp": "MCP protocol",
    "model context protocol": "MCP protocol",
    "plugin": "plugin systems",
    "skill": "skills architecture",
    "subagent": "subagent patterns",
    "headless": "headless automation",
    "cli": "CLI tooling",
    "ci/cd": "CI/CD",
    "continuous integration": "CI/CD",
    "sre": "site reliability",
    "reliability": "site reliability",
    "observability": "observability",
    "incident": "incident management",
    "deployment": "deployment",
    "release": "release engineering",
    "infrastructure": "infrastructure",
    "llm": "LLM operations",
    "outbound": "outbound sales",
    "cold email": "cold email",
    "deliverability": "email deliverability",
    "linkedin": "social selling",
    "b2b": "B2B sales",
    "product-led": "product-led growth",
    "plg": "product-led growth",
    "expansion": "revenue expansion",
    "viral": "viral distribution",
    "product spec": "product specs",
    "design doc": "design documents",
    "interview": "user research",
    "codebase navigation": "codebase navigation",
    "cross-repo": "cross-repo access",
    "config": "repo configuration",
  };

  for (const [pattern, topic] of Object.entries(topicMap)) {
    if (lowerContent.includes(pattern) && !topics.includes(topic)) {
      topics.push(topic);
      if (topics.length >= 5) break;
    }
  }

  return topics;
}

function extractMetadata(content: string, slug: string): ExtractedMeta {
  const lines = content.split("\n");

  let title = "";
  let description = "";
  let createdAt = "";
  let updatedAt = "";
  let sourcesLine = "";
  let purposeLine = "";
  let execSummaryStart = -1;

  for (let i = 0; i < Math.min(lines.length, 50); i++) {
    const line = lines[i].trim();

    // H1 title
    if (line.startsWith("# ") && !title) {
      title = line.replace(/^#\s+/, "").trim();
    }

    // Date
    if (line.match(/^\*\*Date:\*\*/i)) {
      createdAt = extractDate(line);
    }

    // Last updated
    if (line.match(/^\*\*Last [Uu]pdated?:\*\*/i)) {
      updatedAt = extractDate(line);
    }

    // Sources
    if (line.match(/^\*\*Sources?:\*\*/i)) {
      sourcesLine = line;
    }

    // Purpose
    if (line.match(/^\*\*Purpose:\*\*/i)) {
      purposeLine = line.replace(/^\*\*Purpose:\*\*\s*/, "").trim();
    }

    // Executive Summary
    if (line.match(/^##\s+Executive Summary/i)) {
      execSummaryStart = i;
    }
  }

  // Derive description from Purpose or Executive Summary
  if (purposeLine) {
    description = purposeLine;
  } else if (execSummaryStart >= 0) {
    // Get first non-empty paragraph after exec summary heading
    const paras: string[] = [];
    for (let i = execSummaryStart + 1; i < Math.min(lines.length, execSummaryStart + 20); i++) {
      const line = lines[i].trim();
      if (line.startsWith("##")) break; // next section
      if (line && !line.startsWith("---")) {
        paras.push(line);
        if (paras.join(" ").length > 150) break;
      }
    }
    description = paras.join(" ").slice(0, 300);
    // Trim to last complete sentence
    const lastPeriod = description.lastIndexOf(". ");
    if (lastPeriod > 100) {
      description = description.slice(0, lastPeriod + 1);
    }
  }

  if (!description) {
    description = `Research report on ${title || slug}`;
  }

  if (!updatedAt) updatedAt = createdAt;
  if (!createdAt) createdAt = TODAY;
  if (!updatedAt) updatedAt = TODAY;

  // Extract subjects
  const searchText = sourcesLine + " " + title + " " + content.slice(0, 3000);
  const subjects = extractProperNouns(searchText);

  // Extract topics
  const topics = deriveTopics(content.slice(0, 5000), title);

  return { title, description, createdAt, updatedAt, subjects, topics };
}

function buildFrontmatter(meta: ExtractedMeta): string {
  let fm = "---\n";
  fm += `title: "${meta.title.replace(/"/g, '\\"')}"\n`;
  fm += `description: "${meta.description.replace(/"/g, '\\"')}"\n`;
  fm += `createdAt: ${meta.createdAt}\n`;
  fm += `updatedAt: ${meta.updatedAt}\n`;

  if (meta.subjects.length > 0) {
    fm += "subjects:\n";
    for (const s of meta.subjects) {
      fm += `  - ${s}\n`;
    }
  }

  if (meta.topics.length > 0) {
    fm += "topics:\n";
    for (const t of meta.topics) {
      fm += `  - ${t}\n`;
    }
  }

  fm += "---\n";
  return fm;
}

function stripBoldTextMeta(content: string): string {
  const lines = content.split("\n");
  const filtered = lines.filter(line => {
    const trimmed = line.trim();
    if (trimmed.match(/^\*\*Date:\*\*/i)) return false;
    if (trimmed.match(/^\*\*Last [Uu]pdated?:\*\*/i)) return false;
    if (trimmed.match(/^\*\*Sources?:\*\*/i)) return false;
    if (trimmed.match(/^\*\*Purpose:\*\*/i)) return false;
    if (trimmed.match(/^\*\*Status:\*\*/i)) return false;
    return true;
  });

  // Clean up consecutive blank lines that might result from removal
  let result = filtered.join("\n");
  result = result.replace(/\n{3,}/g, "\n\n");
  return result;
}

const CHANGELOG_TEMPLATE = (oldSlug: string, newSlug: string | null) => `# Changelog

## ${TODAY} — Structure normalization
**Update type:** Structural
**Why this pass happened:** Normalization to add YAML frontmatter, apply naming convention, and standardize report directory structure.

### What changed (current-state)
- REPORT.md — added YAML frontmatter, removed bold-text metadata headers
${newSlug ? `- Directory renamed: ${oldSlug} → ${newSlug}` : "- Directory: not renamed"}
- meta/_changelog.md — created
`;

async function processReport(slug: string): Promise<string> {
  const reportDir = join(REPORTS_DIR, slug);
  const reportFile = join(reportDir, "REPORT.md");

  // Check if REPORT.md exists
  if (!existsSync(reportFile)) {
    return `[SKIPPED] ${slug} — no REPORT.md`;
  }

  // Read content
  let content = await readFile(reportFile, "utf-8");

  // Check if already has frontmatter
  if (content.trimStart().startsWith("---")) {
    return `[SKIPPED] ${slug} — already has frontmatter`;
  }

  // Extract metadata
  const meta = extractMetadata(content, slug);

  // Build frontmatter
  const frontmatter = buildFrontmatter(meta);

  // Strip old bold-text metadata
  const cleanedContent = stripBoldTextMeta(content);

  // Combine
  const newContent = frontmatter + "\n" + cleanedContent;

  const changes: string[] = [];

  if (!DRY_RUN) {
    await writeFile(reportFile, newContent, "utf-8");
    changes.push("Frontmatter: added");
  } else {
    changes.push("Frontmatter: would add (dry-run)");
  }

  // Handle rename
  let newSlug: string | null = null;
  if (RENAME_MAP[slug]) {
    newSlug = RENAME_MAP[slug];
    const newDir = join(REPORTS_DIR, newSlug);

    if (existsSync(newDir)) {
      // Check if it was already renamed (maybe by a previous agent run)
      changes.push(`Directory: collision at ${newSlug}, keeping ${slug}`);
      newSlug = null;
    } else if (!DRY_RUN) {
      // Search for cross-references before renaming
      try {
        const grepResult = execSync(
          `grep -r "${slug}" "${REPORTS_DIR}" --include="*.md" -l 2>/dev/null || true`,
          { encoding: "utf-8" }
        ).trim();

        const refFiles = grepResult ? grepResult.split("\n").filter(f => f && !f.includes(`/${slug}/`)) : [];

        // Rename directory
        await rename(reportDir, newDir);
        changes.push(`Directory: renamed ${slug} → ${newSlug}`);

        // Fix cross-references
        for (const refFile of refFiles) {
          try {
            let refContent = await readFile(refFile, "utf-8");
            refContent = refContent.replaceAll(slug, newSlug);
            await writeFile(refFile, refContent, "utf-8");
            changes.push(`Cross-ref fixed: ${basename(refFile)}`);
          } catch {}
        }
      } catch (e) {
        changes.push(`Directory: rename failed — ${e}`);
        newSlug = null;
      }
    } else {
      changes.push(`Directory: would rename ${slug} → ${newSlug} (dry-run)`);
    }
  } else {
    changes.push("Directory: not renamed");
  }

  // Determine working directory (may have been renamed)
  const workDir = newSlug ? join(REPORTS_DIR, newSlug) : reportDir;
  const finalSlug = newSlug || slug;

  // Create meta/ and _changelog.md
  const metaDir = join(workDir, "meta");
  const changelogFile = join(metaDir, "_changelog.md");

  if (!existsSync(metaDir)) {
    if (!DRY_RUN) {
      await mkdir(metaDir, { recursive: true });
    }
    changes.push("meta/: created");
  } else {
    changes.push("meta/: already existed");
  }

  if (!existsSync(changelogFile)) {
    if (!DRY_RUN) {
      await writeFile(changelogFile, CHANGELOG_TEMPLATE(slug, newSlug), "utf-8");
    }
    changes.push("meta/_changelog.md: created");
  } else {
    changes.push("meta/_changelog.md: already existed");
  }

  // Remove stray files
  const strayExtensions = [".bak", ".backup", ".new"];
  try {
    const files = await readdir(workDir);
    for (const file of files) {
      if (strayExtensions.some(ext => file.endsWith(ext))) {
        if (!DRY_RUN) {
          await unlink(join(workDir, file));
        }
        changes.push(`Stray file removed: ${file}`);
      }
    }
  } catch {}

  return `[OK] ${finalSlug} — ${changes.join("; ")}`;
}

async function main() {
  console.log(`Normalize Reports Script${DRY_RUN ? " (DRY RUN)" : ""}`);
  console.log("=".repeat(60));

  const dirs = await readdir(REPORTS_DIR);
  const reportDirs = dirs.filter(d => {
    try {
      return existsSync(join(REPORTS_DIR, d, "REPORT.md")) || existsSync(join(REPORTS_DIR, d));
    } catch { return false; }
  }).sort();

  const results: string[] = [];

  for (const slug of reportDirs) {
    const dirPath = join(REPORTS_DIR, slug);
    try {
      const s = await stat(dirPath);
      if (!s.isDirectory()) continue;
    } catch { continue; }

    // Skip CATALOGUE.md and other non-directory items
    if (slug === "CATALOGUE.md") continue;

    try {
      const result = await processReport(slug);
      results.push(result);
      console.log(result);
    } catch (e) {
      const result = `[ERROR] ${slug} — ${e}`;
      results.push(result);
      console.log(result);
    }
  }

  console.log("\n" + "=".repeat(60));
  const ok = results.filter(r => r.startsWith("[OK]")).length;
  const skipped = results.filter(r => r.startsWith("[SKIPPED]")).length;
  const errors = results.filter(r => r.startsWith("[ERROR]")).length;
  console.log(`Summary: ${ok} normalized, ${skipped} skipped, ${errors} errors`);
}

main().catch(console.error);
