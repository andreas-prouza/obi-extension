// Conversion of local file paths into OBI source names (lib/file/member.ext).
// No vscode imports: this module is unit-tested in plain Node.

import * as path from 'path';


/**
 * `fs_path` relative to `root` with '/' separators, or undefined if `fs_path` is not inside `root`.
 * With path.win32 the comparison is case-insensitive and both separators are accepted.
 */
export function relative_inside(root: string, fs_path: string, p: typeof path = path): string | undefined {
  const rel = p.relative(root, fs_path);
  if (rel === '' || rel === '..' || rel.startsWith(`..${p.sep}`) || p.isAbsolute(rel))
    return undefined;
  return rel.split(p.sep).join('/');
}


/** OBI source names are '/'-separated and relative: 'lib\file\a.pgm' or '/lib/file/a.pgm' becomes 'lib/file/a.pgm' */
export function normalize_source_name(source: string): string {
  return source.replace(/\\/g, '/').replace(/^\/+/, '');
}


/** Source folder relative to the workspace: <local-base-dir>/<source-dir> */
export function local_source_dir(local_base_dir: string | undefined, source_dir: string | undefined, p: typeof path = path): string {
  return p.join(local_base_dir || '.', source_dir || 'src');
}


/** Absolute source folder: <workspace>/<local-base-dir>/<source-dir> */
export function local_source_root(ws: string, local_base_dir: string | undefined, source_dir: string | undefined, p: typeof path = path): string {
  return p.join(ws, local_source_dir(local_base_dir, source_dir, p));
}
