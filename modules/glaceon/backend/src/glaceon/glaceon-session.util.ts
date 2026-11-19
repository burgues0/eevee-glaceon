// Reads the HttpOnly eevee_module_glaceon cookie EEVEE set after login
// (platform-api's GET /platform/modules/glaceon/session) and forwards its
// raw value as the Integration API's X-EEVEE-Module-Assertion header — this
// backend never verifies the JWT itself, platform-api does that on every
// call. Mirrors platform-api's own parseCookieHeader (auth-cookie.util.ts).
import { UnauthorizedException } from '@nestjs/common';

const MODULE_SESSION_COOKIE_NAME = 'eevee_module_glaceon';

function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  return (cookieHeader ?? '').split(';').reduce<Record<string, string>>((cookies, pair) => {
    const [name, ...rest] = pair.trim().split('=');
    if (!name) return cookies;
    cookies[name] = rest.length ? decodeURIComponent(rest.join('=')) : '';
    return cookies;
  }, {});
}

export function getUserAssertion(cookieHeader?: string): string {
  const assertion = parseCookieHeader(cookieHeader)[MODULE_SESSION_COOKIE_NAME];
  if (!assertion) {
    throw new UnauthorizedException('Missing or expired module session.');
  }
  return assertion;
}
