import { Link, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ShellBackdrop } from '../components/BackdropDepth';
import { BrandMark, Wordmark } from '../components/BrandLockup';
import { NowLoading } from '../components/NowLoading';
import { ANDROID_DOWNLOAD_URL, cleanRoomCode, rememberRoomLink } from '../lib/roomLink';

/**
 * Where a room link lands without the Android app (see `lib/roomLink.ts`), reachable signed out. Signed in, it goes
 * straight to Listen together with the code filled in; signed out, sign-in comes first and then the same.
 */
export function JoinPage() {
  const { code: raw = '' } = useParams();
  const { user, isLoading } = useAuth();
  const code = cleanRoomCode(raw);

  if (isLoading) return <NowLoading />;
  if (code) rememberRoomLink(code);
  if (user) return <Navigate to="/together" replace />;

  return (
    <div className="app-ground relative min-h-screen overflow-hidden text-white">
      <ShellBackdrop vivid />
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-6 sm:px-6">
        <span className="mb-6 flex items-center gap-3">
          <BrandMark className="h-10 w-10 border-2 border-blue-300 sm:h-12 sm:w-12" />
          <Wordmark className="text-2xl text-white sm:text-3xl" />
        </span>
        <div className="card w-full max-w-md p-6 sm:p-7">
          {code ? (
            <>
              <h2 className="text-lg font-semibold text-white">You're invited to listen together</h2>
              <p className="mt-1 text-sm text-blue-300">Everyone in the room hears the same song at the same moment.</p>
              <p
                className="font-display mt-5 text-4xl font-extrabold tracking-[0.3em] text-white"
                aria-label={`Room code ${code.split('').join(' ')}`}
              >
                {code}
              </p>
              <Link to="/login" className="btn-primary btn-md mt-5 block w-full text-center">
                Sign in to join
              </Link>
              <p className="mt-2 text-xs text-blue-400">You'll land in the room once you're in. Guests can join too.</p>
              <a href={ANDROID_DOWNLOAD_URL} className="btn-secondary btn-md mt-5 block w-full text-center">
                Get the Android app
              </a>
              <p className="mt-2 text-xs text-blue-400">With the app installed, links like this one open in it.</p>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-white">That link isn't a room</h2>
              <p className="mt-2 text-sm text-blue-300">Room codes are six letters. Ask for the link again.</p>
              <Link to="/" className="btn-secondary btn-md mt-5 block w-full text-center">
                Go to brainlessmusic
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
