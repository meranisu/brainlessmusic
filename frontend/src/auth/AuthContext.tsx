import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiClient, getToken, setToken } from '../lib/apiClient';
import type { User } from '../types/api';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  /** Passwordless entry: mints a new listener and signs in as it. */
  enterAsGuest: (code?: string) => Promise<User>;
  /** Takes over an identity handed across from another device. */
  adoptToken: (token: string) => Promise<User>;
  login: (username: string, password: string) => Promise<User>;
  /** The arcade-card alternative to `login` — a username and a short bound passcode instead of a password. */
  loginWithPasscode: (username: string, passcode: string) => Promise<User>;
  /** Self-registration. Only ever reachable when the server says it's open — see `/auth/registration-status`. */
  register: (username: string, password: string) => Promise<User>;
  /** Creates or replaces the signed-in account's own passcode. */
  setPasscode: (passcode: string) => Promise<void>;
  clearPasscode: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    apiClient
      .get<User>('/auth/me')
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setIsLoading(false));
  }, []);

  /** Store a token and find out who it belongs to. Shared by all three ways in. */
  async function signInWith(token: string): Promise<User> {
    setToken(token);
    const who = await apiClient.get<User>('/auth/me');
    setUser(who);
    return who;
  }

  async function enterAsGuest(code?: string) {
    // The code is only sent when the screen collected one — an unset
    // ENTRY_CODE means the server never looks at the body.
    const { token } = await apiClient.post<{ token: string }>(
      '/auth/guest',
      code ? { code } : {},
    );
    return signInWith(token);
  }

  /**
   * Adopting replaces this browser's identity rather than merging with it. The
   * screen that calls this has to have said so first: whatever this device had
   * favorited or was part-way through is unreachable afterwards, because the
   * token it was reached by is the only key that row ever had.
   */
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

  /**
   * `/auth/register` itself only hands back the new row, not a session — it's
   * the same endpoint the admin-only Users page uses to create an account for
   * someone else, so it has no opinion on signing the caller in. A plain
   * `login` right after is what turns "account exists" into "signed in as it."
   */
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

  function logout() {
    setToken(null);
    setUser(null);
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
        logout,
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
