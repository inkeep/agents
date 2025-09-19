export function SectionTitle({ title }: { title: string }) {
  return <h3 className="text-sm font-semibold">{title}</h3>;
}

export function SectionDescription({ description }: { description: string }) {
  return <p className="text-sm text-muted-foreground">{description}</p>;
}

export function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-1.5">
      <SectionTitle title={title} />
      <SectionDescription description={description} />
    </div>
  );
}
