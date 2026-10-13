import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';

/** Largest file opened for cropping. It is shrunk before upload, so this can be well over the server's 5 MB. */
export const MAX_PICK_BYTES = 20 * 1024 * 1024;
/** Smaller than this on the short side looks blurry at the largest avatar size. */
const MIN_SIDE = 128;
/** The server's own cap (services/avatars.ts); a picture bigger than this is refused here first. */
const MAX_PIXELS = 50_000_000;
/** The size the server stores, so it never has to scale up. */
const OUTPUT_SIZE = 512;
const MAX_ZOOM = 4;

type Loaded = { image: HTMLImageElement; url: string };

/**
 * Checks a picked file before it is opened: a picture, and not so big that opening it hangs the tab. Returns the
 * problem in words, or null. The server checks again; this is only so the message comes before an upload.
 */
export function pickProblem(file: File): string | null {
  if (!file.type.startsWith('image/')) return 'That file is not a picture.';
  if (file.size > MAX_PICK_BYTES) return `That picture is over ${MAX_PICK_BYTES / 1024 / 1024} MB. Pick a smaller one.`;
  return null;
}

/**
 * Move and zoom a picture inside a square the shape of the avatar, then save that square as a 512 px JPEG
 * (profile page plan, Phase 6). Drag or arrow keys move it; pinch, the wheel, the slider or +/- zoom it. The picture
 * always fills the square, so there are never empty edges. The JPEG carries no EXIF, so a photo's location stays here.
 */
export function AvatarCropper({
  file,
  busy,
  onCancel,
  onSave,
}: {
  file: File;
  busy: boolean;
  onCancel: () => void;
  onSave: (picture: Blob) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [frameSize, setFrameSize] = useState(0);
  const [zoom, setZoom] = useState(1);
  // The picture's top-left corner relative to the frame's, in screen pixels. Always zero or negative.
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null);

  // Open the file. The browser turns a phone photo upright from its EXIF, both here and when drawing it.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    let cancelled = false;
    image.onload = () => {
      if (cancelled) return;
      const { naturalWidth: w, naturalHeight: h } = image;
      if (Math.min(w, h) < MIN_SIDE) setProblem(`That picture is too small. It needs at least ${MIN_SIDE} px on each side.`);
      else if (w * h > MAX_PIXELS) setProblem('That picture has too many pixels to use. Pick a smaller one.');
      else setLoaded({ image, url });
    };
    image.onerror = () => {
      if (!cancelled) setProblem("That file couldn't be opened as a picture.");
    };
    image.src = url;
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // Track the frame's size, and centre the picture at no zoom whenever it opens or the frame changes size.
  useEffect(() => {
    const element = frame.current;
    if (!element || !loaded) return;
    const { naturalWidth: w, naturalHeight: h } = loaded.image;
    const observer = new ResizeObserver(([entry]) => {
      const size = entry!.contentRect.width;
      const s = size / Math.min(w, h);
      setFrameSize(size);
      setZoom(1);
      setOffset({ x: (size - w * s) / 2, y: (size - h * s) / 2 });
    });
    observer.observe(element);
    // React's wheel handler can't stop the dialog scrolling, so this one does.
    const keepStill = (event: globalThis.WheelEvent) => event.preventDefault();
    element.addEventListener('wheel', keepStill, { passive: false });
    return () => {
      observer.disconnect();
      element.removeEventListener('wheel', keepStill);
    };
  }, [loaded]);

  const width = loaded?.image.naturalWidth ?? 1;
  const height = loaded?.image.naturalHeight ?? 1;
  // At zoom 1 the short side just fills the frame.
  const scaleFor = (z: number) => (frameSize / Math.min(width, height)) * z;
  const scale = scaleFor(zoom);

  const clamp = (x: number, y: number, s: number) => ({
    x: Math.min(0, Math.max(frameSize - width * s, x)),
    y: Math.min(0, Math.max(frameSize - height * s, y)),
  });

  /** Zooms to [next], keeping the point at ([cx], [cy]) in the frame where it is. */
  const zoomTo = (next: number, cx = frameSize / 2, cy = frameSize / 2) => {
    const z = Math.min(MAX_ZOOM, Math.max(1, next));
    const ratio = scaleFor(z) / scale;
    setZoom(z);
    setOffset(clamp(cx - (cx - offset.x) * ratio, cy - (cy - offset.y) * ratio, scaleFor(z)));
  };

  // Functional, so several moves between two renders all count.
  const moveBy = (dx: number, dy: number) => setOffset((o) => clamp(o.x + dx, o.y + dy, scale));

  const framePoint = (event: { clientX: number; clientY: number }) => {
    const box = frame.current!.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = { distance: Math.hypot(a!.x - b!.x, a!.y - b!.y), zoom };
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const last = pointers.current.get(event.pointerId);
    if (!last) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) {
      moveBy(event.clientX - last.x, event.clientY - last.y);
    } else if (pointers.current.size === 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()];
      const mid = framePoint({ clientX: (a!.x + b!.x) / 2, clientY: (a!.y + b!.y) / 2 });
      const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      zoomTo((pinchStart.current.zoom * distance) / pinchStart.current.distance, mid.x, mid.y);
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
  };

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    const point = framePoint(event);
    zoomTo(zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1), point.x, point.y);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 40 : 10;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      moveBy(...move);
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomTo(zoom * 1.1);
    } else if (event.key === '-') {
      event.preventDefault();
      zoomTo(zoom / 1.1);
    }
  };

  const save = () => {
    if (!loaded || frameSize === 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const context = canvas.getContext('2d');
    if (!context) return setProblem("This browser can't crop pictures.");
    // A see-through PNG turns black as a JPEG anyway; this makes it black on purpose.
    context.fillStyle = '#000';
    context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    context.imageSmoothingQuality = 'high';
    const side = frameSize / scale;
    context.drawImage(loaded.image, -offset.x / scale, -offset.y / scale, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    canvas.toBlob((blob) => (blob ? onSave(blob) : setProblem("That picture couldn't be cropped.")), 'image/jpeg', 0.9);
  };

  if (problem) {
    return (
      <div className="flex flex-col gap-3">
        <p role="alert" className="text-sm text-red-300">
          {problem}
        </p>
        <div className="flex justify-end">
          <button type="button" onClick={onCancel} className="btn-secondary btn-sm">
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={frame}
        role="img"
        tabIndex={0}
        aria-label="Picture to crop. Arrow keys move it, plus and minus zoom."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
        className="relative mx-auto aspect-square w-full max-w-72 cursor-grab touch-none select-none overflow-hidden rounded-md border-2 border-blue-700 bg-black outline-none focus-visible:ring-2 focus-visible:ring-blue-300 active:cursor-grabbing"
      >
        {loaded && frameSize > 0 ? (
          <img
            src={loaded.url}
            alt=""
            draggable={false}
            className="pointer-events-none absolute left-0 top-0 max-w-none"
            style={{ width: width * scale, height: height * scale, transform: `translate(${offset.x}px, ${offset.y}px)` }}
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-sm text-blue-300">Opening…</span>
        )}
      </div>
      <label className="flex items-center gap-3 text-sm text-blue-200">
        Zoom
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          disabled={!loaded}
          onChange={(e) => zoomTo(Number(e.target.value))}
          className="h-11 flex-1 accent-blue-400"
        />
      </label>
      <p className="-mt-2 text-xs text-blue-400">
        Drag to move, pinch or scroll to zoom. What's in the square is what people see.
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className="btn-secondary btn-sm">
          Cancel
        </button>
        <button type="button" onClick={save} disabled={!loaded || busy} className="btn-primary btn-sm">
          {busy ? 'Uploading…' : 'Use this picture'}
        </button>
      </div>
    </div>
  );
}
