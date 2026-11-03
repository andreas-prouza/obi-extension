import { randomBytes } from 'crypto';

/** Nonce for the Content-Security-Policy of a webview: 128 random bits, base64 */
export function getNonce(): string {
  return randomBytes(16).toString('base64');
}
