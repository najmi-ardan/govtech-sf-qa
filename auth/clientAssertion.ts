import crypto from 'node:crypto';

export interface ClientAssertionClaims {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
}

function base64url(value: Buffer | string): string {
  const buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return buf.toString('base64url');
}

/** RS256 client assertion for the Salesforce JWT bearer flow. */
export function signClientAssertion(claims: ClientAssertionClaims, privateKeyPem: string): string {
  const encoded = `${base64url(JSON.stringify({ alg: 'RS256' }))}.${base64url(JSON.stringify(claims))}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(encoded), privateKeyPem);
  return `${encoded}.${base64url(signature)}`;
}
