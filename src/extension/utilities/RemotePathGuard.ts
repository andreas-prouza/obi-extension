// Guards for destructive operations on the IBM i (e.g. "rm -rf" of the remote project folder).
// No vscode imports: this module is unit-tested in plain Node.

import * as path from 'path';


// Compared case-insensitively: the IFS root file system is case-insensitive.
const DENY_EXACT: string[] = ['/', '/home', '/tmp', '/var', '/etc', '/usr', '/bin', '/dev', '/qopensys', '/qopensys/pkgs', '/qopensys/usr', '/qopensys/etc'];
const DENY_PREFIX: string[] = ['/qsys.lib', '/qibm', '/qdls', '/qfilesvr.400', '/qopt', '/qntc'];


function normalize(p: string): string {
  return path.posix.normalize(p).replace(/\/+$/, '') || '/';
}


/**
 * Returns a reason why `abs_path` must not be deleted recursively, or undefined if it may be deleted.
 * `abs_path` is the resolved absolute path on the IBM i (e.g. output of `pwd -P`).
 */
export function check_remote_delete_target(abs_path: string, remote_home: string): string | undefined {

  if (!abs_path.startsWith('/'))
    return `'${abs_path}' is not an absolute path`;

  if (abs_path.split('/').includes('..'))
    return `'${abs_path}' contains '..'`;

  const target = normalize(abs_path);
  const lower = target.toLowerCase();

  if (DENY_EXACT.includes(lower))
    return `'${target}' is a system directory`;

  if (DENY_PREFIX.some(prefix => lower === prefix || lower.startsWith(`${prefix}/`)))
    return `'${target}' is inside a system file system`;

  if (remote_home) {
    const home = normalize(remote_home).toLowerCase();
    if (lower === home || home.startsWith(`${lower}/`))
      return `'${target}' is the home directory of the SSH user or contains it`;
  }

  if (target.split('/').filter(segment => segment.length > 0).length < 2)
    return `'${target}' is too close to the root directory`;

  return undefined;
}


/** Values of `remote-base-dir` that always point to the home directory (or above) and are rejected early. */
export function is_home_like_remote_base_dir(value: string): boolean {
  const v = value.trim().replace(/\/+$/, '');
  return ['~', '$HOME', '${HOME}', '/home', '/home/$USER', '/home/${USER}', '.', './'].includes(v);
}
