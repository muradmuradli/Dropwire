import type Keycloak from 'keycloak-js';

/**
 * Keycloak's hosted login page is a different origin, so it can't read this app's own
 * localStorage to know which theme to render. Passing it once as a query param lets the login
 * theme's own script (template.ftl) pick it up and persist it to its own origin — see
 * infra/keycloak/themes/dropwire/login/template.ftl.
 */
export async function redirectToLogin(keycloak: Keycloak, theme: string | undefined) {
  const url = new URL(await keycloak.createLoginUrl());
  url.searchParams.set('ui_theme', theme === 'dark' ? 'dark' : 'light');
  window.location.href = url.toString();
}
