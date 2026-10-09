import fs from 'node:fs';
import type { Browser } from '@playwright/test';
import { lightningReady } from '../pages/components/lightning';
import { config, type JwtAuthConfig } from '../config/env';
import { logger as rootLogger } from '../utils/logger';
import { signClientAssertion } from './clientAssertion';
import { loginOrVerification, type OpenSession } from './validateSession';
import { SessionStateError, writeStorageState } from './sessionStore';

const log = rootLogger.child({ component: 'jwt' });

interface TokenResponse {
  access_token?: string;
  instance_url?: string;
  error?: string;
  error_description?: string;
}

interface FrontdoorResponse {
  frontdoor_uri?: string;
  error?: string;
  error_description?: string;
}

function privateKeyPem(jwt: JwtAuthConfig): string {
  if (jwt.privateKeyPem) return jwt.privateKeyPem;
  if (!jwt.privateKeyPath || !fs.existsSync(jwt.privateKeyPath)) {
    throw new SessionStateError(`No JWT private key at ${jwt.privateKeyPath || 'SF_JWT_KEY_PATH'}.`);
  }
  return fs.readFileSync(jwt.privateKeyPath, 'utf8');
}

function salesforceFault(body: { error?: string; error_description?: string }, fallback: string): string {
  return [body.error, body.error_description].filter(Boolean).join(': ') || fallback;
}

/** Lightning origin for a my.salesforce.com instance URL. */
export function lightningOriginFromInstance(instanceUrl: string): string {
  return instanceUrl.replace('.my.salesforce.com', '.lightning.force.com').replace(/\/$/, '');
}

/**
 * Asks Salesforce for a fresh browser session and saves it.
 * The email verification page is not used. The External Client App must
 * include the web scope, and the user must already be pre-authorized.
 */
export async function refreshSession(browser: Browser): Promise<OpenSession> {
  const jwt = config.jwt;
  if (!jwt) throw new SessionStateError('JWT refresh is not configured.');

  const assertion = signClientAssertion(
    {
      iss: jwt.clientId,
      sub: jwt.username,
      aud: jwt.loginUrl,
      exp: Math.floor(Date.now() / 1000) + 180,
    },
    privateKeyPem(jwt),
  );
  const tokenRes = await fetch(`${jwt.loginUrl}/services/oauth2/token`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const token = (await tokenRes.json().catch(() => ({}))) as TokenResponse;
  if (!tokenRes.ok || !token.access_token || !token.instance_url) {
    throw new SessionStateError(`JWT token request failed (${tokenRes.status}). ${salesforceFault(token, 'No access token was returned.')}`);
  }

  const lightningUrl = lightningOriginFromInstance(token.instance_url);
  const doorRes = await fetch(`${token.instance_url.replace(/\/$/, '')}/services/oauth2/singleaccess`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token.access_token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    // A relative path is accepted. An absolute Lightning URL is rejected as Invalid_Param.
    body: new URLSearchParams({ redirect_uri: '/lightning/page/home' }),
  });
  const doorText = await doorRes.text();
  const door = (() => {
    try {
      return JSON.parse(doorText) as FrontdoorResponse;
    } catch {
      return { error_description: doorText.slice(0, 180) };
    }
  })();
  if (!doorRes.ok || !door.frontdoor_uri) {
    throw new SessionStateError(`UI bridge request failed (${doorRes.status}). ${salesforceFault(door, 'No frontdoor URL was returned. The app needs the web scope.')}`);
  }

  const context = await browser.newContext();
  const page = await context.newPage();
  const close = () => context.close();
  try {
    await page.goto(door.frontdoor_uri, { waitUntil: 'domcontentloaded', timeout: config.timeouts.navigation });
    await lightningReady(page).or(loginOrVerification(page)).first().waitFor({
      state: 'visible',
      timeout: config.timeouts.navigation,
    });
    const blocked = await loginOrVerification(page).isVisible();
    const ready = await lightningReady(page).isVisible();
    if (blocked || !ready) {
      throw new SessionStateError('The UI bridge did not open Lightning. Pre-authorize this user on the External Client App.');
    }
    writeStorageState(config.storageStatePath, await context.storageState());
    log.info('saved a new session file', { lightningUrl });
    return { lightningUrl, page, close };
  } catch (err) {
    await close();
    throw err;
  }
}
