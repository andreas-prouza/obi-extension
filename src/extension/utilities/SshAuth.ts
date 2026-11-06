import * as path from 'path';
import type { Algorithms } from 'ssh2';
// No vscode imports: this module is unit-tested in plain Node.


/** ssh-compression: on unless set to false (default true) */
export function ssh_compression(value: unknown): boolean {
  return value !== false && value !== 'false';
}


/**
 * Algorithms for ssh2. ssh2 lists `none` first, so without this compression is never negotiated.
 * A server that doesn't support zlib falls back to `none`.
 */
export function ssh_algorithms(compression: boolean): Algorithms | undefined {
  return compression ? { compress: ['zlib@openssh.com', 'zlib', 'none'] } : undefined;
}


/**
 * `debug` function for ssh2 that reports only the compression agreed in the handshake
 * ("Handshake: C->S compression: zlib@openssh.com", then S->C), e.g. "C->S zlib@openssh.com, S->C zlib@openssh.com".
 * Every other debug line is dropped, so nothing of the login gets into the log.
 */
export function compression_reporter(report: (summary: string) => void): (line: string) => void {
  let client_to_server: string | undefined;
  return (line: string) => {
    const match = /^Handshake: (C->S|S->C) compression: (\S+)$/.exec(line);
    if (!match)
      return;
    if (match[1] === 'C->S')
      client_to_server = match[2];
    else
      report(`C->S ${client_to_server ?? '?'}, S->C ${match[2]}`);
  };
}


/** Local path with ~, $VAR / ${VAR} and %VAR% expanded (e.g. the ssh-key setting) */
export function expand_local_path(value: string, env: NodeJS.ProcessEnv, home_dir: string): string {
  let result = value.trim();
  if (result === '~' || result.startsWith('~/') || result.startsWith('~\\'))
    result = path.join(home_dir, result.slice(1));
  result = result.replace(/\$\{(\w+)\}|\$(\w+)/g, (match, braced: string | undefined, plain: string | undefined) => env[braced ?? plain ?? ''] ?? match);
  result = result.replace(/%(\w+)%/g, (match, name: string) => env[name] ?? match);
  return result;
}


/** ssh-port: 1–65535, default 22 */
export function ssh_port(value: unknown): number {
  const port = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof port === 'number' && Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 22;
}


/** Agent for ssh2 (ssh-agent = true): Pageant on Windows, otherwise SSH_AUTH_SOCK; undefined if there is none */
export function ssh_agent(enabled: unknown, platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string | undefined {
  if (enabled !== true && enabled !== 'true')
    return undefined;
  if (platform === 'win32')
    return 'pageant';
  return env.SSH_AUTH_SOCK || undefined;
}


export type AuthMethod = 'none' | 'agent' | 'publickey' | 'password';


/** Methods in the order ssh2 tries them: agent, key, password ('none' first, as ssh2 does by default) */
export function auth_methods(options: { agent?: string; private_key?: boolean; password?: boolean }): AuthMethod[] {
  const methods: AuthMethod[] = ['none'];
  if (options.agent)
    methods.push('agent');
  if (options.private_key)
    methods.push('publickey');
  if (options.password)
    methods.push('password');
  return methods;
}


export type LoginErrorKind = 'passphrase-missing' | 'passphrase-wrong' | 'authentication' | 'unreachable' | 'other';


/** What went wrong in an ssh2 connect, to show a clear message or ask for a passphrase */
export function classify_login_error(error: unknown): { kind: LoginErrorKind; code?: string } {
  const message = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: unknown })?.code;
  const level = (error as { level?: unknown })?.level;

  if (/no passphrase given/i.test(message))
    return { kind: 'passphrase-missing' };
  if (/Cannot parse privateKey/i.test(message) && /bad passphrase|bad decrypt|integrity check/i.test(message))
    return { kind: 'passphrase-wrong' };
  if (level === 'client-authentication' || /All configured authentication methods failed/i.test(message))
    return { kind: 'authentication' };
  if (typeof code === 'string' && ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH', 'ENETUNREACH', 'EAI_AGAIN'].includes(code))
    return { kind: 'unreachable', code };
  if (level === 'client-timeout' || /Timed out while waiting for handshake/i.test(message))
    return { kind: 'unreachable', code: 'ETIMEDOUT' };
  return { kind: 'other' };
}
