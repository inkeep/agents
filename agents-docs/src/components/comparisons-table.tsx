import type { ReactElement } from 'react';
import { toJsxRuntime } from 'hast-util-to-jsx-runtime';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { renderMarkdownToHast } from '@/lib/markdown';

interface ComparisonRow {
  feature: string;
  inkeep: boolean | string | { value: boolean | string; note?: string };
  competitor: boolean | string | { value: boolean | string; note?: string };
}

interface ComparisonSection {
  title: string;
  rows: ComparisonRow[];
}

interface ComparisonData {
  title: string;
  summary: string;
  author: string;
  authorImage: string;
  date: string;
  thumbnail: string;
  competitor: string;
  competitorLogo: string;
  tag: string;
  heroCTALink: string;
  heroCTAText: string;
  tldr: {
    description: string;
    keyTakeaways: string[];
  };
  comparison: {
    sections: ComparisonSection[];
  };
  _meta: {
    path: string;
  };
}

async function getComparison(competitor: string): Promise<ComparisonData | null> {
  try {
    const res = await fetch(`https://inkeep.com/api/comparisons/${competitor}`, {
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch comparison for ${competitor}`);
    }

    return res.json();
  } catch (error) {
    console.error(`Error fetching comparison for ${competitor}:`, error);
    return null;
  }
}

async function renderCell(
  value: boolean | string | { value: boolean | string; note?: string }
): Promise<ReactElement> {
  // Handle object with note
  if (typeof value === 'object' && value !== null && 'value' in value) {
    const cellValue = value.value;
    const note = value.note;

    // Convert note to JSX if it's markdown
    const noteElement = note
      ? toJsxRuntime(await renderMarkdownToHast(note), {
          Fragment,
          jsx,
          jsxs,
          components: {},
        })
      : null;

    const displayValue = typeof cellValue === 'boolean' ? (cellValue ? '✓' : '—') : cellValue;

    // If there's a note, wrap in a tooltip
    if (noteElement) {
      return (
        <abbr title={note}>
          {displayValue}
        </abbr>
      );
    }

    return <span>{displayValue}</span>;
  }

  // Handle boolean
  if (typeof value === 'boolean') {
    return <span>{value ? '✓' : '—'}</span>;
  }

  // Handle string - render as markdown
  const markdownElement = toJsxRuntime(await renderMarkdownToHast(value), {
    Fragment,
    jsx,
    jsxs,
    components: {},
  });

  return <div>{markdownElement}</div>;
}

export async function ComparisonTable({
  competitor,
  sectionTitle,
}: {
  competitor: string;
  sectionTitle?: string;
}): Promise<ReactElement> {
  const comparison = await getComparison(competitor);

  if (!comparison) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 p-4">
        <p className="text-amber-800 dark:text-amber-200">
          Comparison with {competitor} not available at the moment.
        </p>
      </div>
    );
  }

  // Filter sections if sectionTitle is provided
  const sectionsToRender = sectionTitle
    ? (comparison.comparison?.sections || []).filter(
        (section) => section.title === sectionTitle
      )
    : comparison.comparison?.sections || [];

  if (sectionTitle && sectionsToRender.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 p-4">
        <p className="text-amber-800 dark:text-amber-200">
          Section "{sectionTitle}" not found for {competitor}.
        </p>
      </div>
    );
  }

  // Pre-process filtered sections and rows
  const processedSections = await Promise.all(
    sectionsToRender.map(async (section) => ({
      ...section,
      processedRows: await Promise.all(
        section.rows.map(async (row) => ({
          feature: row.feature,
          inkeepCell: await renderCell(row.inkeep),
          competitorCell: await renderCell(row.competitor),
        }))
      ),
    }))
  );

  // If rendering a single section, don't wrap in extra divs
  if (sectionTitle) {
    const section = processedSections[0];
    return (
        <table className="w-full border-collapse rounded-md">
          <thead>
            <tr className="border-b border-fd-border bg-fd-muted/50">
              <th className="p-4 text-left font-semibold">Feature</th>
              <th className="p-4 text-center font-semibold w-32">Inkeep</th>
              <th className="p-4 text-center font-semibold w-32">
                {comparison.competitor}
              </th>
            </tr>
          </thead>
          <tbody>
            {section.processedRows.map((row, idx) => (
              <tr
                key={idx}
                className={`border-b border-fd-border last:border-b-0 hover:bg-fd-muted/30 transition-colors ${
                  idx % 2 === 0 ? 'bg-white dark:bg-transparent' : 'bg-fd-muted/10'
                }`}
              >
                <td className="p-4 font-medium">{row.feature}</td>
                <td className="p-4 text-center align-top">{row.inkeepCell}</td>
                <td className="p-4 text-center align-top">{row.competitorCell}</td>
              </tr>
            ))}
          </tbody>
        </table>
    );
  }

  // Render all sections (legacy behavior when no sectionTitle provided)
  return (
    <div className="space-y-8">
      {processedSections.map((section) => (
        <div key={section.title} className="space-y-4">
          <h3 className="text-xl font-semibold">{section.title}</h3>
          <div className="overflow-x-auto rounded-lg border border-fd-border">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-fd-border bg-fd-muted/50">
                  <th className="p-4 text-left font-semibold">Feature</th>
                  <th className="p-4 text-center font-semibold w-32">Inkeep</th>
                  <th className="p-4 text-center font-semibold w-32">
                    {comparison.competitor}
                  </th>
                </tr>
              </thead>
              <tbody>
                {section.processedRows.map((row, idx) => (
                  <tr
                    key={idx}
                    className={`border-b border-fd-border last:border-b-0 hover:bg-fd-muted/30 transition-colors ${
                      idx % 2 === 0 ? 'bg-white dark:bg-transparent' : 'bg-fd-muted/10'
                    }`}
                  >
                    <td className="p-4 font-medium">{row.feature}</td>
                    <td className="p-4 text-center align-top">{row.inkeepCell}</td>
                    <td className="p-4 text-center align-top">{row.competitorCell}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}