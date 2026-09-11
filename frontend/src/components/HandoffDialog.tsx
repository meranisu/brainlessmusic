import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useAuth } from '../auth/AuthContext';
import { useScrollLock } from '../hooks/useScrollLock';
import { getToken } from '../lib/apiClient';

/**
 * Hands this browser's identity to another device.
 *
 * There is no endpoint behind this: the token being handed over is the one the
 * client already holds, so asking the server to repeat it back would be a round
 * trip to learn something it just used. (An earlier draft of the plan specified
 * `GET /auth/handoff` for this; it turned out to have nothing to do.)
 *
 * It exists because guest identities are per-device by design ([A13]). That is
 * the right default — nobody wants a friend's pause moving their resume
 * position — but it costs the thing that shipped the day before: the phone and
 * the desktop are different listeners, so neither resumes what the other
 * paused. This is the deliberate way to make them the same listener.
 */
export function HandoffDialog({ onClose }: { onClose: () => void }) {
  const { user, logout } = useAuth();
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmingForget, setConfirmingForget] = useState(false);

  useScrollLock();

  const token = getToken();
  const link = token ? `${window.location.origin}/enter#t=${token}` : '';

  useEffect(() => {
    if (!link) return;
    // Dark-on-light regardless of surroundings: a phone camera wants contrast,
    // not a design that matches the panel it sits in.
    QRCode.toDataURL(link, { margin: 1, width: 240, color: { dark: '#0c1a52', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [link]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access needs a secure context, and this app is plain HTTP on
      // a LAN — so this is the expected path, not the exceptional one. The link
      // is selectable below either way.
      setCopied(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold text-white">Use this account on another device</h2>
        <p className="mt-2 text-xs text-blue-300">
          Scan this on the other device, or open the link there. It will pick up your queue and
          resume position — you'll be the same listener on both.
        </p>

        <div className="mt-4 flex justify-center">
          {qr ? (
            <img src={qr} alt={`QR code linking to ${link}`} className="rounded-md" width={240} height={240} />
          ) : (
            <div className="flex h-[240px] w-[240px] items-center justify-center rounded-md border border-blue-800 text-xs text-blue-400">
              Could not draw the code
            </div>
          )}
        </div>

        {/* Selectable, because clipboard writes need HTTPS and this runs on a
            LAN over plain HTTP — "copy" is the convenience, not the mechanism. */}
        <p className="mt-3 break-all rounded-md border border-blue-800 bg-blue-950/60 px-3 py-2 text-[0.65rem] leading-relaxed text-blue-400 select-all">
          {link}
        </p>

        <p className="mt-3 rounded-md border border-orange-600/40 bg-orange-600/10 px-3 py-2 text-xs text-orange-200">
          Anyone who gets this link becomes you here. Treat it like a password — it is one.
        </p>

        <div className="mt-4 flex justify-between gap-2">
          <button onClick={copyLink} className="btn-secondary btn-sm">
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <button onClick={onClose} className="btn-primary btn-sm">
            Done
          </button>
        </div>

        {user?.isGuest && (
          <div className="mt-5 border-t border-blue-800 pt-4">
            {confirmingForget ? (
              <>
                <p className="text-xs text-red-300">
                  This browser is the only thing holding this listener. Forget it and the favorites,
                  playlists and resume position on it are gone for good — there is no password to
                  sign back in with.
                </p>
                <div className="mt-3 flex justify-end gap-2">
                  <button onClick={() => setConfirmingForget(false)} className="btn-secondary btn-sm">
                    Keep it
                  </button>
                  <button onClick={logout} className="btn-danger btn-sm">
                    Forget anyway
                  </button>
                </div>
              </>
            ) : (
              <button
                onClick={() => setConfirmingForget(true)}
                className="text-xs text-blue-400 underline transition-colors hover:text-blue-200"
              >
                Forget this device
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
