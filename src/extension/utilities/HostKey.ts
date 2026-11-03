// SSH host key fingerprints and known_hosts lookup.
// No vscode imports: this module is unit-tested in plain Node.

import * as crypto from 'crypto';


export type HostKeyDecision = 'trusted' | 'unknown' | 'mismatch';


/** Stored per host and port (globalState) */
export interface StoredHostKey {
  algorithm: string;
  fingerprint: string;
  first_seen: string;
}


/** Fingerprint in OpenSSH format, as printed by `ssh-keygen -lf` */
export function fingerprint(key: Buffer): string {
  return 'SHA256:' + crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/, '');
}


/** Algorithm name from the key blob (first length-prefixed string, e.g. "ssh-ed25519") */
export function key_algorithm(key: Buffer): string {
  if (key.length < 4)
    return 'unknown';
  const length = key.readUInt32BE(0);
  if (length === 0 || length > 64 || key.length < 4 + length)
    return 'unknown';
  return key.subarray(4, 4 + length).toString('latin1');
}


export function decide(stored: string | undefined, presented: string): HostKeyDecision {
  if (!stored)
    return 'unknown';
  return stored === presented ? 'trusted' : 'mismatch';
}


/** Host name as written in known_hosts: "host" for port 22, "[host]:port" otherwise */
export function known_hosts_name(host: string, port: number): string {
  return port === 22 ? host : `[${host}]:${port}`;
}


function host_matches(pattern_list: string, name: string): boolean {
  if (pattern_list.startsWith('|1|')) {
    // Hashed entry: |1|base64(salt)|base64(HMAC-SHA1(salt, name))
    const [, , salt, hash] = pattern_list.split('|');
    if (!salt || !hash)
      return false;
    const expected = crypto.createHmac('sha1', Buffer.from(salt, 'base64')).update(name).digest('base64');
    return expected === hash;
  }
  // Wildcards and negations are not supported: such entries are ignored
  return pattern_list.split(',').some(pattern => !/[*?!]/.test(pattern) && pattern.toLowerCase() === name.toLowerCase());
}


/**
 * Decision based on the content of a known_hosts file.
 * 'trusted': an entry for the host has this key. 'mismatch': an entry for the host has another key of the same algorithm.
 * 'unknown': no entry for the host and this algorithm. Marker lines (@cert-authority, @revoked) are ignored.
 */
export function check_known_hosts(content: string, host: string, port: number, key: Buffer): HostKeyDecision {
  const name = known_hosts_name(host, port);
  const algorithm = key_algorithm(key);
  const presented = key.toString('base64');
  let same_algorithm_seen = false;

  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#') || line.startsWith('@'))
      continue;

    const [hosts, type, data] = line.split(/\s+/);
    if (!hosts || !type || !data || !host_matches(hosts, name))
      continue;

    if (data === presented)
      return 'trusted';
    if (type === algorithm)
      same_algorithm_seen = true;
  }

  return same_algorithm_seen ? 'mismatch' : 'unknown';
}
