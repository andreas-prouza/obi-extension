// Helpers for building shell commands that run on the IBM i (PASE bash).
// No vscode imports: this module is unit-tested in plain Node.


/** Quotes a value for POSIX sh/bash: the result is always exactly one shell word. */
export function sh_quote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
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
