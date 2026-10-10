import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useAuth } from '../auth/AuthContext';
import { useScrollLock } from '../hooks/useScrollLock';
import { getToken } from '../lib/apiClient';

/**
 * Hands this browser's identity to another device, from the token already held (no endpoint). Guests are per-device by
 * design (A13); this is how a phone and a desktop become the same listener.
 */
export function HandoffDialog({ onClose }: { onClose: () => void }) {
  const { user, logout } = useAuth();
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmingForget, setConfirmingForget] = useState(false);

  useScrollLock();

  const token = getToken();
  const link = token ? `${window.location.origin}/#t=${token}` : '';

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
      // Clipboard needs a secure context and the LAN is plain HTTP, so this is the usual path; the link stays selectable.
      setCopied(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold text-white">Use this account on another device</h2>
        <p className="mt-2 text-xs text-blue-300">
          Scan this on the other device, or open the link there. It will pick up your queue and
          resume position, and you'll be the same listener on both.
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

        {/* Selectable, since copying needs HTTPS. */}
        <p className="mt-3 break-all rounded-md border border-blue-800 bg-blue-950/60 px-3 py-2 text-[0.65rem] leading-relaxed text-blue-400 select-all">
          {link}
        </p>

        <p className="mt-3 rounded-md border border-orange-600/40 bg-orange-600/10 px-3 py-2 text-xs text-orange-200">
          Anyone who gets this link becomes you here. Treat it like a password, because it is one.
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
                  playlists and resume position on it are gone for good. There is no password to
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
