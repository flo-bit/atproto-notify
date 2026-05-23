import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { oauthClient, type OAuthSession } from './client';

const LAST_DID_KEY = 'lastDid';

interface SessionContextValue {
  session: OAuthSession | null;
  did: string | null;
  /** True while we attempt to restore a session on launch. */
  restoring: boolean;
  signIn: (handle: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<OAuthSession | null>(null);
  const [restoring, setRestoring] = useState(true);

  // Restore the last-known session on launch.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const lastDid = await SecureStore.getItemAsync(LAST_DID_KEY);
        if (lastDid !== null) {
          const restored = await oauthClient.restore(lastDid);
          if (!cancelled && restored) {
            setSession(restored);
          }
        }
      } catch (err) {
        console.warn('session restore failed', err);
        await SecureStore.deleteItemAsync(LAST_DID_KEY).catch(() => {});
      } finally {
        if (!cancelled) {
          setRestoring(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (handle: string) => {
    // Opens the system browser, authenticates at the user's PDS, and returns via
    // the registered scheme; resolves with an authenticated session.
    const next = await oauthClient.signIn(handle);
    await SecureStore.setItemAsync(LAST_DID_KEY, next.did);
    setSession(next);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await session?.signOut();
    } catch (err) {
      console.warn('signOut error', err);
    }
    await SecureStore.deleteItemAsync(LAST_DID_KEY).catch(() => {});
    setSession(null);
  }, [session]);

  const value = useMemo<SessionContextValue>(
    () => ({ session, did: session?.did ?? null, restoring, signIn, signOut }),
    [session, restoring, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (ctx === null) {
    throw new Error('useSession must be used within <SessionProvider>');
  }
  return ctx;
}
