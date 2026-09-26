import * as oidc from 'openid-client';

import type { OidcSettings } from '../config';

/**
 * wechart's API as its own OIDC client (T316, AC-252; the user's R20,
 * research/openid-client.md): discovery, lazy and cached per provider, so the
 * API starts while the provider is still booting and retries on the next
 * sign-in if it isn't up yet.
 */
const pending = new Map<string, Promise<oidc.Configuration>>();

export function oidcConfig(settings: OidcSettings): Promise<oidc.Configuration> {
  const key = `${settings.issuer}\u0000${settings.clientId}`;
  let config = pending.get(key);
  if (config === undefined) {
    config = discover(settings).catch((error: unknown) => {
      pending.delete(key);
      throw error;
    });
    pending.set(key, config);
  }
  return config;
}

function discover(settings: OidcSettings): Promise<oidc.Configuration> {
  // ID tokens are verified against the provider's keys even though they come
  // straight from its token endpoint: in development that hop is plain HTTP,
  // where the "TLS says it's the provider" argument doesn't hold (research).
  const execute: ((config: oidc.Configuration) => void)[] = [oidc.enableNonRepudiationChecks];
  if (settings.allowHttp) execute.push(oidc.allowInsecureRequests);
  const options: oidc.DiscoveryRequestOptions = { execute };

  const backchannel = settings.backchannelUrl;
  if (backchannel !== undefined) {
    // The browser reaches the provider at the issuer's origin, this service at
    // another; only the origin is rewritten, so `iss` still matches (Gotcha 1).
    const issuerOrigin = new URL(settings.issuer).origin;
    const internal = new URL(backchannel);
    options[oidc.customFetch] = (url, init) => {
      const target = new URL(url);
      if (target.origin === issuerOrigin) {
        target.protocol = internal.protocol;
        target.host = internal.host;
      }
      return fetch(target, init as RequestInit);
    };
  }
  return oidc.discovery(
    new URL(settings.issuer),
    settings.clientId,
    settings.clientSecret,
    undefined,
    options,
  );
}

/** The groups the configured claim carries: a list of strings, a single string, or none. */
export function groupsFrom(claims: Record<string, unknown>, claim: string): string[] {
  const value = claims[claim];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value))
    return value.filter((group): group is string => typeof group === 'string');
  return [];
}

/** What the top bar shows: the name, else the username, else the email, else the subject. */
export function displayNameFrom(claims: Record<string, unknown>): string {
  for (const key of ['name', 'preferred_username', 'email', 'sub']) {
    const value = claims[key];
    if (typeof value === 'string' && value !== '') return value;
  }
  return 'unknown';
}
