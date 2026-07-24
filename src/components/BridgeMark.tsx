// components/BridgeMark.tsx
//
// The logo mark: a hollow source node, a span, and a solid destination node —
// the product distilled (match/bridge two catalogs). Ring + span take
// currentColor so the mark adapts to its surface; the destination node stays
// the signal red.

export function BridgeMark({
  size = 30,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* source — hollow */}
      <circle cx="9.5" cy="20" r="5.5" stroke="currentColor" strokeWidth="3" />
      {/* span */}
      <rect x="15" y="18.4" width="11" height="3.2" rx="1.6" fill="currentColor" />
      {/* destination — resolved, lit. Brand red hardcoded: var() doesn't work
          in SVG presentation attributes. */}
      <circle cx="30.5" cy="20" r="5.5" fill="#ec3323" />
    </svg>
  );
}
