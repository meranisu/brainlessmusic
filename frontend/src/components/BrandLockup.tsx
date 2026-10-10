interface BrandLockupProps {
  /** The small caps line above the wordmark; pages pass their own context, else the product descriptor. */
  eyebrow?: string;
  className?: string;
}

/** The ringed mark, drawn as two circles. The caller sets size and ring color; the dot stays orange. */
export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-full ${className}`}>
      {/* Sized as a share of the ring, so one number scales the whole mark. */}
      <span className="animate-brand-pulse h-[42%] w-[42%] rounded-full bg-orange-600" />
    </span>
  );
}

/** The two-tone wordmark. The caller colors "brainless"; "music" keeps the accent. */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-brand font-bold tracking-tight ${className}`}>
      brainless<span className="text-orange-600">music</span>
    </span>
  );
}

/** Mark, eyebrow and wordmark for the light-ground auth screens. */
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
