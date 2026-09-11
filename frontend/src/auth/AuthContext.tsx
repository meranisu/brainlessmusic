import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiClient, getToken, setToken } from '../lib/apiClient';
import type { User } from '../types/api';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  /** Passwordless entry: mints a new listener and signs in as it. */
  enterAsGuest: (code?: string) => Promise<void>;
  /** Takes over an identity handed across from another device. */
  adoptToken: (token: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
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
  async function signInWith(token: string) {
    setToken(token);
    setUser(await apiClient.get<User>('/auth/me'));
  }

  async function enterAsGuest(code?: string) {
    // The code is only sent when the screen collected one — an unset
    // ENTRY_CODE means the server never looks at the body.
    const { token } = await apiClient.post<{ token: string }>(
      '/auth/guest',
      code ? { code } : {},
    );
    await signInWith(token);
  }

  /**
   * Adopting replaces this browser's identity rather than merging with it. The
   * screen that calls this has to have said so first: whatever this device had
   * favorited or was part-way through is unreachable afterwards, because the
   * token it was reached by is the only key that row ever had.
   */
  async function adoptToken(token: string) {
    await signInWith(token);
  }

  async function login(username: string, password: string) {
    // Carries the unlock ticket when one is held. The server ignores it unless
    // ADMIN_ENTRY_CODE is set, and refuses the login without it when it is.
    const { token } = await apiClient.postUnlocked<{ token: string }>('/auth/login', {
      username,
      password,
    });
    await signInWith(token);
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, enterAsGuest, adoptToken, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
