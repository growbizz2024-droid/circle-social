import { feedIconPaths, type FeedIconName } from "@circle/design-tokens";
export type { FeedIconName } from "@circle/design-tokens";
export default function FeedIcon({
  name,
  filled = false,
  size = 24,
}: {
  name: FeedIconName;
  filled?: boolean;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={feedIconPaths[name]} />
    </svg>
  );
}
