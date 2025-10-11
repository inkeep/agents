export const ModelInheritanceInfo = () => {
  return (
    <ul className="space-y-1.5 list-disc list-outside pl-4">
      <li>
        <span className="font-medium">Models</span>: Project → Agent → Agent (partial inheritance -
        missing models only)
      </li>
      <li>
        <span className="font-medium">Individual model types</span> inherit independently (base,
        structuredOutput, summarizer)
      </li>
      <li>
        <span className="font-medium">Explicit settings</span> always take precedence over inherited
        values
      </li>
      <li>
        <span className="font-medium">Provider options</span> are inherited along with the model if
        not explicitly set
      </li>
    </ul>
  );
};
