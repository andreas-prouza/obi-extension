// Which local files a directory upload to the IBM i must skip.
// No vscode imports: this module is unit-tested in plain Node.

import * as path from 'path';
import { minimatch } from 'minimatch';


/** Workspace-relative, '/'-separated patterns of files that are never uploaded with a directory. */
export const TRANSFER_EXCLUDES: string[] = [
  '.git', '.vscode', '.theia', '.project', '.gitignore',
  '.obi/build-history',                      // config snapshots of old builds
  '.obi/log',                                // local extension logs (commands, remote output)
  '.obi/tmp',
  '.obi/cache',
  '.obi/etc/workspace-settings.json',        // selected profile of this developer
  '.obi/etc/.user-app-config*.toml',         // personal configs; the active one is uploaded separately (private)
  '**/*.pyc',
  '**/*.tmp',                                // temp files of atomic writes
];


function matches(rel: string, pattern: string): boolean {
  // The pattern itself or anything below it
  return minimatch(rel, pattern, { dot: true }) || minimatch(rel, `${pattern}/**`, { dot: true });
}


/**
 * True if `item_path` must not be uploaded when the directory `local_root` is transferred.
 * Patterns that match `local_root` itself are ignored: transferring e.g. .obi/tmp explicitly is intended.
 */
export function is_transfer_excluded(workspace: string, local_root: string, item_path: string, p: typeof path = path): boolean {
  const to_rel = (abs: string) => p.relative(workspace, abs).split(p.sep).join('/');
  const root_rel = to_rel(local_root);
  const item_rel = to_rel(item_path);

  return TRANSFER_EXCLUDES
    .filter(pattern => root_rel === '' || !matches(root_rel, pattern))
    .some(pattern => matches(item_rel, pattern));
}
