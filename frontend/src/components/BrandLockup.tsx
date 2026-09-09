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
 * The ringed mark. Sizing and ring color come from the caller so it can sit on
 * either ground; the dot stays orange, the one accent that reads on both.
 *
 * Drawn rather than imported as an image — it's two circles, so an SVG/PNG
 * would only cost a request and go fuzzy when scaled.
 */
export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-full ${className}`}>
      {/* Sized as a share of the ring, so one number scales the whole mark. */}
      <span className="animate-brand-pulse h-[42%] w-[42%] rounded-full bg-orange-600" />
    </span>
  );
}

/**
 * The two-tone wordmark. The caller sets the size and the color of
 * "brainless"; "music" keeps the accent whatever ground it lands on.
 */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-brand font-bold tracking-tight ${className}`}>
      brainless<span className="text-orange-600">music</span>
    </span>
  );
}

/**
 * The full lockup — mark, eyebrow, wordmark — as the auth screens use it.
 * Built for a light ground; the app header composes the same two pieces at
 * small size in its own colors.
 */
export function BrandLockup({ eyebrow = 'Self-hosted · Personal audio', className = '' }: BrandLockupProps) {
  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <BrandMark className="h-14 w-14 border-[3px] border-blue-950" />
      <span className="min-w-0">
        <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-blue-950/60">
          {eyebrow}
        </span>
        <h1>
          <Wordmark className="text-3xl leading-tight text-blue-950" />
        </h1>
      </span>
    </div>
  );
}
