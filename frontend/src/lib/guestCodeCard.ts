import QRCode from 'qrcode';

/** `ABCDEFGH` → `ABCD-EFGH`: the dash is only for reading aloud; the server ignores it. */
export function prettyGuestCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/** What the QR opens: the guest card on the title screen, code already typed in. */
export function guestCodeLink(code: string): string {
  return `${window.location.origin}/login?code=${code}`;
}

const INK = '#080e28';
const MUTED = '#4a5578';
const WIDTH = 600;
const HEIGHT = 820;

/** A printable card for a guest code: a QR and the code in large letters. Light ground, for printing. */
export async function downloadGuestCodeCard(code: string, expiresLabel: string): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // The canvas uses whatever the page already loaded; Fredoka is the wordmark face.
  await document.fonts?.ready;

  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  ctx.font = '600 40px Fredoka, system-ui, sans-serif';
  ctx.fillText('brainlessmusic', WIDTH / 2, 82);

  ctx.fillStyle = MUTED;
  ctx.font = '500 20px system-ui, sans-serif';
  ctx.fillText('Guest pass', WIDTH / 2, 118);

  const qr = new Image();
  qr.src = await QRCode.toDataURL(guestCodeLink(code), {
    margin: 1,
    width: 400,
    color: { dark: INK, light: '#ffffff' },
  });
  await qr.decode();
  ctx.drawImage(qr, (WIDTH - 400) / 2, 150, 400, 400);

  ctx.fillStyle = INK;
  ctx.font = '700 64px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  ctx.fillText(prettyGuestCode(code), WIDTH / 2, 640);

  ctx.fillStyle = MUTED;
  ctx.font = '500 22px system-ui, sans-serif';
  ctx.fillText(window.location.host, WIDTH / 2, 690);
  ctx.font = '400 18px system-ui, sans-serif';
  ctx.fillText(`Lets one device in. Unused, it stops working on ${expiresLabel}.`, WIDTH / 2, 740);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not draw the card');

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `guest-code-${code}.png`;
  a.click();
  // Some browsers start the download after `click()` returns; revoking at once can leave them nothing to save (C35).
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
