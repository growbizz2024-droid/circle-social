export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 128 128"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M61 25a46 46 0 1 0 15 89"
        stroke="currentColor"
        strokeWidth="14"
        strokeLinecap="round"
      />
      <circle cx="96" cy="23" r="14" stroke="currentColor" strokeWidth="11" />
    </svg>
  );
}
export function Wordmark() {
  return (
    <span className="brand-wordmark">
      Circle<span>.social</span>
    </span>
  );
}
export function BrandScribble() {
  return (
    <svg
      className="brand-scribble"
      viewBox="0 0 130 35"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m8 22 93-16L30 29l88-15-45 17"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
