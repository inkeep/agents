interface RelationalDiffProps {
  sourceSubAgentId: string;
  targetSubAgentId: string;
  relationType: string;
}

export const RelationalDiff = ({
  sourceSubAgentId,
  targetSubAgentId,
  relationType,
}: RelationalDiffProps) => {
  return (
    <div className="flex items-center gap-1">
      <div>{sourceSubAgentId}</div>
      <div> can {relationType} to </div>
      <div>{targetSubAgentId}</div>
    </div>
  );
};
