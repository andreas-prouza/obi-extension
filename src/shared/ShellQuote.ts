// Helpers for building shell commands that run on the IBM i (PASE bash).
// No vscode imports: this module is unit-tested in plain Node.

import * as path from 'path';


/** Quotes a value for POSIX sh/bash: the result is always exactly one shell word. */
export function sh_quote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}


/**
 * `mkdir -p` commands that create the folders of `remote_files` (at most `per_command` folders per command).
 * A folder that contains another one of the list is left out: `mkdir -p` creates it anyway.
 * Backslashes become slashes, as node-ssh does for SFTP paths.
 */
export function mkdir_parents_commands(remote_files: string[], per_command: number = 200): string[] {
  const dirs = [...new Set(remote_files.map(file => path.posix.dirname(file.replace(/\\/g, '/'))))]
    .filter(dir => dir !== '.' && dir !== '/');
  const deepest = dirs.filter(dir => !dirs.some(other => other.startsWith(`${dir}/`))).sort();

  const commands: string[] = [];
  for (let i = 0; i < deepest.length; i += per_command)
    commands.push(`mkdir -p -- ${deepest.slice(i, i + per_command).map(sh_quote).join(' ')}`);
  return commands;
}


// lib/file/member.ext with the characters valid in IBM i names. Defense in depth: values are quoted anyway.
const SOURCE_PATH_PATTERN = /^[A-Za-z0-9_$#@.\-/]+$/;


export function is_valid_source_path(source: string): boolean {
  return SOURCE_PATH_PATTERN.test(source) && !source.split('/').includes('..');
}


export function assert_valid_source_path(source: string): void {
  if (!is_valid_source_path(source))
    throw new Error(`Source name '${source}' contains unsupported characters. Allowed: letters, digits, $ # @ _ . - /`);
}
