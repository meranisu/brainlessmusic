import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiClient, getToken, onSessionRefused, onTokenChangedElsewhere, setToken } from '../lib/apiClient';
import { clearLibraryPages } from '../lib/libraryPageCache';
import { applyTheme, clearTheme, hasLocalTheme, isTheme, loadTheme } from '../lib/theme';
import type { User } from '../types/api';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  /**
   * Passwordless entry. A new guest is named `name` (blank: `Guest 1234`); a code already in use signs in as its guest
   * and the name is ignored (A68/A69).
   */
  enterAsGuest: (options: { code?: string; name?: string }) => Promise<User>;
  /** Takes over an identity handed across from another device. */
  adoptToken: (token: string) => Promise<User>;
  login: (username: string, password: string) => Promise<User>;
  /** Sign in with a username and a short bound passcode instead of a password. */
  loginWithPasscode: (username: string, passcode: string) => Promise<User>;
  /** Self-registration, offered only when `/auth/registration-status` says it's open. */
  register: (username: string, password: string) => Promise<User>;
  /** Creates or replaces the signed-in account's own passcode. */
  setPasscode: (passcode: string) => Promise<void>;
  clearPasscode: () => Promise<void>;
  /** Renames the signed-in user (A68). Blank: a guest gets a new `Guest 1234`, an account its username back. */
  setDisplayName: (name: string) => Promise<void>;
  /** Reloads `user`, after something else changed it (a new profile picture). */
  refreshUser: () => Promise<void>;
  logout: () => void;
  /**
   * Ends every other session of this user (other devices, old handoff links) and keeps this one on a fresh token,
   * which it returns (Q202).
   */
  rotateSession: () => Promise<string>;
  /** `rotateSession`, then signs this device out too. */
  signOutEverywhere: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * The profile's theme wins over the browser's (A55). A profile that never chose one takes the browser's own choice,
 * uploaded once; with neither, nothing changes. Not awaited: a failed upload just tries again next sign-in.
 */
function syncTheme(user: User) {
  if (isTheme(user.theme)) {
    applyTheme(user.theme);
  } else if (user.theme === null && hasLocalTheme()) {
    void apiClient.put('/me/theme', { theme: loadTheme() }).catch(() => {});
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  // An expired or revoked session goes back to the login screen, as a logout would, instead of a signed-in shell
  // where every request fails.
  useEffect(
    () =>
      onSessionRefused(() => {
        setUser(null);
        clearTheme();
        clearLibraryPages();
        queryClient.clear();
      }),
    [queryClient],
  );

  // Another tab signed out or switched account: this one follows, instead of staying on the old person's screen
  // while every request goes out as the new one (or as nobody).
  useEffect(
    () =>
      onTokenChangedElsewhere((token) => {
        queryClient.clear();
        if (!token) {
          setUser(null);
          clearTheme();
          clearLibraryPages();
          return;
        }
        apiClient
          .get<User>('/auth/me')
          .then((who) => setUser(who))
          // A 401 has already ended the session through `onSessionRefused`; anything else leaves things as they are.
          .catch(() => {});
      }),
    [queryClient],
  );

  // Per sign-in, not per `/auth/me` refresh: a passcode change re-reads the user and must not undo a theme picked since.
  const userId = user?.id;
  useEffect(() => {
    if (user) syncTheme(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    apiClient
      .get<User>('/auth/me')
      .then((who) => {
        if (!cancelled) setUser(who);
      })
      // A 401 has already cleared the token. Anything else (no signal, the server down) keeps it for the next load:
      // clearing it lost a guest's identity for good.
      .catch(() => {})
      .finally(() => setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  /** Store a token and find out who it belongs to. Shared by all three ways in. */
  async function signInWith(token: string): Promise<User> {
    setToken(token);
    // Nothing cached for the last person in this tab may show for the next.
    queryClient.clear();
    let who: User;
    try {
      who = await apiClient.get<User>('/auth/me');
    } catch (err) {
      // No identity came back, so don't leave a token that would sign in silently on the next load.
      setToken(null);
      throw err;
    }
    setUser(who);
    return who;
  }

  async function enterAsGuest({ code, name }: { code?: string; name?: string }) {
    // The code only if the screen collected one: the server refuses a wrong code even with the door open.
    const { token } = await apiClient.post<{ token: string }>('/auth/guest', {
      ...(code ? { code } : {}),
      name: name ?? '',
      platform: 'web',
    });
    return signInWith(token);
  }

  /** Replaces this browser's identity, not merges: what it had is unreachable after. The caller must warn first. */
  async function adoptToken(token: string) {
    return signInWith(token);
  }

  async function login(username: string, password: string) {
    const { token } = await apiClient.post<{ token: string }>('/auth/login', { username, password });
    return signInWith(token);
  }

  async function loginWithPasscode(username: string, passcode: string) {
    const { token } = await apiClient.post<{ token: string }>('/auth/passcode-login', {
      username,
      passcode,
    });
    return signInWith(token);
  }

  /** `/auth/register` returns the new row, not a session (admins use it too), so this logs in after. */
  async function register(username: string, password: string) {
    await apiClient.post('/auth/register', { username, password });
    return login(username, password);
  }

  async function setPasscode(passcode: string) {
    await apiClient.post('/auth/passcode', { passcode });
    setUser(await apiClient.get<User>('/auth/me'));
  }

  async function clearPasscode() {
    await apiClient.delete('/auth/passcode');
    setUser(await apiClient.get<User>('/auth/me'));
  }

  async function setDisplayName(name: string) {
    await apiClient.put('/me/name', { name });
    setUser(await apiClient.get<User>('/auth/me'));
  }

  async function refreshUser() {
    setUser(await apiClient.get<User>('/auth/me'));
  }

  async function rotateSession(): Promise<string> {
    const { token } = await apiClient.post<{ token: string }>('/auth/sessions/revoke');
    setToken(token);
    return token;
  }

  async function signOutEverywhere() {
    await apiClient.post('/auth/sessions/revoke');
    logout();
  }

  function logout() {
    setToken(null);
    setUser(null);
    clearTheme();
    clearLibraryPages();
    queryClient.clear();
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        enterAsGuest,
        adoptToken,
        login,
        loginWithPasscode,
        register,
        setPasscode,
        clearPasscode,
        setDisplayName,
        refreshUser,
        logout,
        rotateSession,
        signOutEverywhere,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
