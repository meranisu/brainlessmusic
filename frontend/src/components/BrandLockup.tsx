interface BrandLockupProps {
  /**
   * The small tracked-caps line above the wordmark. Pages pass their own
   * context here ("Create an account"); the product descriptor is the
   * fallback for anywhere that has nothing more specific to say.
   */
  eyebrow?: string;
  className?: string;
}

/**
 * The brand lockup: ringed mark, eyebrow, two-tone wordmark.
 *
 * Drawn rather than imported as an image — it's two circles and a line of
 * type, so an SVG/PNG would only cost a request and go fuzzy when scaled.
 * Built for a light background; the app header's dark-navy variant still
 * lives in AppShell.
 */
export function BrandLockup({ eyebrow = 'Self-hosted · Personal audio', className = '' }: BrandLockupProps) {
  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <span
        aria-hidden
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-[3px] border-blue-950"
      >
        <span className="animate-brand-pulse h-6 w-6 rounded-full bg-orange-600" />
      </span>
      <span className="min-w-0">
        <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-blue-950/60">
          {eyebrow}
        </span>
        <h1 className="font-brand text-3xl font-bold leading-tight tracking-tight text-blue-950">
          brainless<span className="text-orange-600">music</span>
        </h1>
      </span>
    </div>
  );
}
