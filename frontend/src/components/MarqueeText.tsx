import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

/** Scroll speed of a title too long for its line, in px per second. */
const SPEED = 40;

/**
 * One line of text that scrolls sideways only when it doesn't fit, as two copies sliding by half their width so the
 * loop has no seam. Fits: plain text. Reduced motion: truncated (index.css).
 */
export function MarqueeText({ text, className = '' }: { text: string; className?: string }) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const firstRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const first = firstRef.current;
    if (!box || !first) return;
    // The first copy alone, so adding the second copy doesn't change the answer.
    const measure = () => setWidth(first.scrollWidth > box.clientWidth + 1 ? first.scrollWidth : 0);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [text]);

  const scrolling = width > 0;
  return (
    <span ref={boxRef} className={`marquee ${className}`} title={scrolling ? text : undefined}>
      <span
        className={scrolling ? 'marquee-track' : undefined}
        style={scrolling ? ({ '--marquee-duration': `${Math.round(width / SPEED)}s` } as CSSProperties) : undefined}
      >
        <span ref={firstRef} className={scrolling ? 'marquee-copy' : undefined}>
          {text}
        </span>
        {scrolling && (
          <span aria-hidden className="marquee-copy">
            {text}
          </span>
        )}
      </span>
    </span>
  );
}
