'use client';

import {
  allCommands,
  isParentCommand,
  type Command,
  type ParentCommand,
  type Option,
  type Example,
} from '@inkeep/agents-cli/schemas/commands';
import { pre as Pre } from '@inkeep/docskit/mdx';

/**
 * Styled code block component using docskit's pre for consistent fumadocs styling
 * with bash syntax highlighting
 */
function CodeBlock({ children }: { children: string }) {
  return (
    <Pre className="my-4">
      <code className="language-bash">{children}</code>
    </Pre>
  );
}

/**
 * Inline code component
 */
function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md bg-fd-secondary px-1.5 py-0.5 text-sm font-mono">
      {children}
    </code>
  );
}

/**
 * Render a single option as a list item
 */
function OptionItem({ opt }: { opt: Option }) {
  const parts: string[] = [];

  if (opt.required) parts.push('(required)');
  if (opt.deprecated) parts.push('(deprecated)');

  const suffix =
    opt.defaultValue !== undefined && opt.defaultValue !== false
      ? ` (default: ${String(opt.defaultValue)})`
      : '';

  return (
    <li className="my-1">
      <InlineCode>{opt.flags}</InlineCode>
      {parts.length > 0 && <span className="text-fd-muted-foreground ml-1">{parts.join(' ')}</span>}
      {' - '}
      {opt.description}
      {suffix && <span className="text-fd-muted-foreground">{suffix}</span>}
    </li>
  );
}

/**
 * Render a single example
 */
function ExampleItem({ example }: { example: Example }) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="text-sm text-fd-muted-foreground mb-1">{example.description}</p>
      <Pre>
        <code className="language-bash">{example.command}</code>
      </Pre>
      {example.output && (
        <p className="text-xs text-fd-muted-foreground mt-1">
          Output: <code className="bg-fd-secondary px-1 rounded">{example.output}</code>
        </p>
      )}
    </div>
  );
}

/**
 * Render examples section
 */
function Examples({ examples }: { examples: Example[] }) {
  if (examples.length === 0) return null;

  return (
    <div className="mt-4">
      <p className="font-semibold mb-2">Examples:</p>
      <div className="space-y-3">
        {examples.map((ex, i) => (
          <ExampleItem key={i} example={ex} />
        ))}
      </div>
    </div>
  );
}

/**
 * Generate syntax string for a command
 */
function getSyntax(cmd: Command, parentName?: string): string {
  const fullName = parentName ? `${parentName} ${cmd.name}` : cmd.name;
  let syntax = `inkeep ${fullName}`;

  for (const arg of cmd.arguments ?? []) {
    if (arg.variadic) {
      syntax += arg.required ? ` <${arg.name}...>` : ` [${arg.name}...]`;
    } else {
      syntax += arg.required ? ` <${arg.name}>` : ` [${arg.name}]`;
    }
  }

  if ((cmd.options?.length ?? 0) > 0) {
    syntax += ' [options]';
  }

  return syntax;
}

/**
 * Command heading with styled code
 */
function CommandHeading({
  name,
  level,
  id,
}: {
  name: string;
  level: 3 | 4;
  id: string;
}) {
  const HeadingTag = level === 3 ? 'h3' : 'h4';

  return (
    <HeadingTag
      id={id}
      className={`scroll-m-20 ${level === 3 ? 'text-xl font-semibold mt-8 mb-4 pb-2 border-b' : 'text-lg font-semibold mt-6 mb-3'}`}
    >
      <InlineCode>inkeep {name}</InlineCode>
    </HeadingTag>
  );
}

/**
 * Section label
 */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="font-semibold mt-4 mb-2">{children}</p>;
}

/**
 * Render a single command
 */
function CommandSection({
  cmd,
  parentName,
  headingLevel = 3,
}: {
  cmd: Command;
  parentName?: string;
  headingLevel?: 3 | 4;
}) {
  const fullName = parentName ? `${parentName} ${cmd.name}` : cmd.name;
  const args = cmd.arguments ?? [];
  const options = cmd.options ?? [];
  const examples = cmd.examples ?? [];
  const seeAlso = cmd.seeAlso ?? [];
  const id = fullName.replace(/\s+/g, '-').toLowerCase();

  return (
    <section className="mb-8">
      <CommandHeading name={fullName} level={headingLevel} id={id} />

      <p className="text-fd-muted-foreground mb-4">{cmd.description}</p>

      {cmd.longDescription && (
        <p className="mb-4">{cmd.longDescription}</p>
      )}

      <CodeBlock>{getSyntax(cmd, parentName)}</CodeBlock>

      {args.length > 0 && (
        <>
          <SectionLabel>Arguments:</SectionLabel>
          <ul className="list-disc list-inside space-y-1 ml-2">
            {args.map((arg) => (
              <li key={arg.name} className="my-1">
                <InlineCode>{arg.name}</InlineCode>
                {arg.required && <span className="text-fd-muted-foreground ml-1">(required)</span>}
                {' - '}
                {arg.description}
              </li>
            ))}
          </ul>
        </>
      )}

      {options.length > 0 && (
        <>
          <SectionLabel>Options:</SectionLabel>
          <ul className="list-disc list-inside space-y-1 ml-2">
            {options.map((opt) => (
              <OptionItem key={opt.name} opt={opt} />
            ))}
          </ul>
        </>
      )}

      <Examples examples={examples} />

      {seeAlso.length > 0 && (
        <p className="mt-4 text-sm text-fd-muted-foreground">
          <span className="font-medium">See also:</span>{' '}
          {seeAlso.map((c, i) => (
            <span key={c}>
              {i > 0 && ', '}
              <InlineCode>{c}</InlineCode>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}

/**
 * Render a parent command with subcommands
 */
function ParentCommandSection({ cmd }: { cmd: ParentCommand }) {
  const examples = cmd.examples ?? [];
  const seeAlso = cmd.seeAlso ?? [];
  const id = cmd.name.toLowerCase();

  return (
    <section className="mb-8">
      <CommandHeading name={cmd.name} level={3} id={id} />

      <p className="text-fd-muted-foreground mb-4">{cmd.description}</p>

      {cmd.longDescription && (
        <p className="mb-4">{cmd.longDescription}</p>
      )}

      <Examples examples={examples} />

      <SectionLabel>Subcommands:</SectionLabel>
      <ul className="list-disc list-inside space-y-1 ml-2 mb-6">
        {Object.keys(cmd.subcommands).map((name) => (
          <li key={name}>
            <InlineCode>inkeep {cmd.name} {name}</InlineCode>
          </li>
        ))}
      </ul>

      {Object.entries(cmd.subcommands).map(([, subCmd]) => (
        <CommandSection
          key={subCmd.name}
          cmd={subCmd}
          parentName={cmd.name}
          headingLevel={4}
        />
      ))}

      {seeAlso.length > 0 && (
        <p className="mt-4 text-sm text-fd-muted-foreground">
          <span className="font-medium">See also:</span>{' '}
          {seeAlso.map((c, i) => (
            <span key={c}>
              {i > 0 && ', '}
              <InlineCode>{c}</InlineCode>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}

/**
 * Main CLI Reference component - renders all commands from schemas
 */
export function CLIReference() {
  const sortedCommands = [...allCommands].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="cli-reference">
      {sortedCommands.map((cmd) =>
        isParentCommand(cmd) ? (
          <ParentCommandSection key={cmd.name} cmd={cmd} />
        ) : (
          <CommandSection key={cmd.name} cmd={cmd} />
        )
      )}
    </div>
  );
}
