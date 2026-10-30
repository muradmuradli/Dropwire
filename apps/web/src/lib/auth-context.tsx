'use client';

import Keycloak from 'keycloak-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

// Module-level singleton — not component state. React's Strict Mode intentionally runs effects
// twice in development to catch missing cleanup, which would otherwise call `.init()` on the same
// Keycloak instance twice and throw ("A 'Keycloak' instance can only be initialized once"). Storing
// the init promise outside the component means the second effect run just gets the same promise
// back instead of re-initializing.
let keycloak: Keycloak | null = null;
let initPromise: Promise<boolean> | null = null;

function getKeycloak(): Keycloak {
  if (!keycloak) {
    keycloak = new Keycloak({
      url: process.env.NEXT_PUBLIC_KEYCLOAK_URL ?? 'http://localhost:8080',
      realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM ?? 'dropwire',
      clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? 'dropwire-web',
    });
  }
  return keycloak;
}

interface AuthContextValue {
  keycloak: Keycloak | null;
  initialized: boolean;
  authenticated: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  keycloak: null,
  initialized: false,
  authenticated: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initialized, setInitialized] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const kc = getKeycloak();

    kc.onAuthSuccess = () => setAuthenticated(true);
    kc.onAuthLogout = () => setAuthenticated(false);
    kc.onAuthRefreshSuccess = () => setAuthenticated(true);
    kc.onAuthRefreshError = () => setAuthenticated(false);
    // Fires when the locally-tracked token expiry passes. Try a silent refresh; if the refresh
    // token itself is also no longer valid, there's nothing left to do but ask the user to log in
    // again.
    kc.onTokenExpired = () => {
      kc.updateToken(30).catch(() => kc.login());
    };

    if (!initPromise) {
      // Without `onLoad`, keycloak-js only authenticates right after a redirect back from the
      // login page — a plain reload has no login code in the URL, so the session would otherwise
      // look logged-out every time. `check-sso` re-checks Keycloak's own SSO session cookie via a
      // hidden iframe on every load instead of a full-page redirect.
      initPromise = kc.init({
        pkceMethod: 'S256',
        onLoad: 'check-sso',
        silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`,
      });
    }

    initPromise
      .then((isAuthenticated) => {
        setInitialized(true);
        setAuthenticated(isAuthenticated);
      })
      .catch((error: unknown) => {
        console.error('Keycloak init failed', error);
        setInitialized(true);
      });
  }, []);

  return (
    <AuthContext.Provider value={{ keycloak, initialized, authenticated }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
