'use client';

import { useAuth } from './auth-context';
import { API_BASE_URL } from './config';

export function useApiClient() {
  const { keycloak } = useAuth();

  return async (path: string, init?: RequestInit): Promise<Response> => {
    if (!keycloak) {
      throw new Error('Keycloak is not initialized yet');
    }

    // Refreshes only if the token has less than 5s of validity left — a cheap no-op otherwise.
    await keycloak.updateToken(5);

    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${keycloak.token}`);

    return fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  };
}
