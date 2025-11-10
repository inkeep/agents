import type { Thing, WithContext } from 'schema-dts';

export function JsonLd({ json }: { json: WithContext<Thing> | WithContext<Thing>[] }) {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }} />
  );
}
