export function TagRow(label: string, value: string, color: 'indigo' | 'emerald' = 'indigo') {
  const palette =
    color === 'emerald'
      ? { bg: 'bg-emerald-100', text: 'text-emerald-900' }
      : { bg: 'bg-indigo-100', text: 'text-indigo-800' };
  return (
    <div className="flex items-center gap-2">
      <span className="font-medium">{label}:</span>
      <span className={`${palette.bg} ${palette.text} px-2 py-1 rounded text-xs font-mono`}>
        {value}
      </span>
    </div>
  );
}
