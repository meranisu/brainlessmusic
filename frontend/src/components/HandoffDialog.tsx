import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useAuth } from '../auth/AuthContext';
import { useDialogA11y } from '../hooks/useDialogA11y';
import { useScrollLock } from '../hooks/useScrollLock';
import { copyText } from '../lib/copyText';

/**
 * Hands this browser's identity to another device. Guests are per-device by design (A13); this is how a phone and a
 * desktop become the same listener. Making the link signs every other session out first (Q202), so a link or device
 * from before can't outlive the one just handed out; this browser stays in on a fresh token.
 */
export function HandoffDialog({ onClose }: { onClose: () => void }) {
  const { user, logout, rotateSession } = useAuth();
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmingForget, setConfirmingForget] = useState(false);
  const [link, setLink] = useState('');
  const [creating, setCreating] = useState(false);
  const [failed, setFailed] = useState(false);

  useScrollLock();
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  async function createLink() {
    setCreating(true);
    setFailed(false);
    try {
      setLink(`${window.location.origin}/#t=${await rotateSession()}`);
    } catch {
      setFailed(true);
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    if (!link) return;
    let cancelled = false;
    // Dark-on-light regardless of surroundings: a phone camera wants contrast,
    // not a design that matches the panel it sits in.
    QRCode.toDataURL(link, { margin: 1, width: 240, color: { dark: '#0c1a52', light: '#ffffff' } })
      .then((url) => {
        if (!cancelled) setQr(url);
      })
      .catch(() => {
        if (!cancelled) setQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [link]);

  async function copyLink() {
    if (await copyText(link)) {
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } else {
      // The LAN is plain HTTP, so this is the usual path; the link stays selectable.
      setCopied(false);
    }
  }

  return (
    <div className="motion-scrim fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="handoff-title"
        tabIndex={-1}
        className="motion-pop card w-full max-w-sm p-5 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="handoff-title" className="text-sm font-semibold text-white">Use this account on another device</h2>
        <p className="mt-2 text-xs text-blue-300">
          Scan the code on the other device, or open the link there. It will pick up your queue and
          resume position, and you'll be the same listener on both.
        </p>

        {!link && (
          <>
            <p className="mt-3 rounded-md border border-orange-600/40 bg-orange-600/10 px-3 py-2 text-xs text-orange-200">
              Making a link signs you out of every other device and ends any link made before. This browser stays
              signed in.
            </p>
            {failed && <p className="mt-2 text-xs text-red-300">Could not make a link. Check the connection and try again.</p>}
            <div className="mt-4 flex justify-between gap-2">
              <button onClick={createLink} disabled={creating} className="btn-primary btn-sm">
                {creating ? 'Making link…' : 'Make link'}
              </button>
              <button onClick={onClose} className="btn-secondary btn-sm">
                Cancel
              </button>
            </div>
          </>
        )}

        {link && (
          <>
            <div className="mt-4 flex justify-center">
              {qr ? (
                <img src={qr} alt="QR code for the handoff link" className="rounded-md" width={240} height={240} />
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
          </>
        )}

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
