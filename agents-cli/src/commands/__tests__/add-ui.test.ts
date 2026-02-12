import { describe, it, expect } from 'vitest';
import { ensureExported } from '../add-ui';

describe('ensureExported', () => {
  it('adds export to unexported function component', () => {
    const code = `import { Clock } from 'lucide-react';

function Weatherforecast(props: { value: string }) {
  return <span>{props.value}</span>;
}
`;
    const out = ensureExported(code);
    expect(out).toContain('export function Weatherforecast');
    expect(out).not.toMatch(/export\s+import/);
  });

  it('adds export to unexported const component (PascalCase)', () => {
    const code = `import React from 'react';

const MyCard = (props: { title: string }) => {
  return <div>{props.title}</div>;
};
`;
    const out = ensureExported(code);
    expect(out).toContain('export const MyCard');
  });

  it('leaves already exported function unchanged', () => {
    const code = `export function Foo() {
  return null;
}
`;
    const out = ensureExported(code);
    expect(out).toBe(code);
  });

  it('leaves already exported const unchanged', () => {
    const code = `export const Bar = () => null;
`;
    const out = ensureExported(code);
    expect(out).toBe(code);
  });

  it('does not add export to lowercase const (not treated as component)', () => {
    const code = `const config = { foo: 1 };
`;
    const out = ensureExported(code);
    expect(out).toBe(code);
  });

  it('exports first component when both function and const exist', () => {
    const code = `function First() { return null; }
const Second = () => null;
`;
    const out = ensureExported(code);
    expect(out).toContain('export function First');
    expect(out).not.toContain('export const Second');
  });

  it('returns code unchanged on parse error', () => {
    const broken = `function broken( no closing paren `;
    const out = ensureExported(broken);
    expect(out).toBe(broken);
  });
});
