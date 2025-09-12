export function SelectedMarker() {
  return (
    <svg style={{ position: 'absolute', top: 0, left: 0 }}>
      <title>arrow</title>
      <defs>
        <marker
          className="react-flow__arrowhead !stroke-primary"
          id="marker-selected"
          markerWidth="12.5"
          markerHeight="12.5"
          viewBox="-10 -10 20 20"
          markerUnits="strokeWidth"
          orient="auto-start-reverse"
          refX="0"
          refY="0"
        >
          <polyline
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            points="-5,-4 0,0 -5,4"
            strokeWidth={1.5}
          />
        </marker>
      </defs>
    </svg>
  );
}
