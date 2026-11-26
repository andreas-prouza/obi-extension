// Rules for profile names. A profile alias becomes part of a file name (.user-app-config-<alias>.toml).
// No vscode imports: this module is unit-tested in plain Node.


/** Allowed for newly created profiles. */
export const NEW_PROFILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;


/** True if the alias can't leave the config folder (no path separators, no '..', no NUL). */
export function is_safe_profile_alias(alias: string): boolean {
  return !/[/\\\0]/.test(alias) && !alias.includes('..');
}


/** Key of the stored SSH password of a profile ('' = default), host and user; `|passphrase` is appended for the key passphrase */
export function ssh_secret_key(profile_alias: string, host: string | undefined, user: string | undefined): string {
  return `obi|${profile_alias || 'default'}|${host ?? ''}|${user ?? ''}`;
}


/** workspaceState key of "Never for this profile" */
export function never_save_key(profile_alias: string, kind: 'password' | 'passphrase'): string {
  return `obi.ssh.never-save-${kind}|${profile_alias || 'default'}`;
}


/** Error text for the input box, or undefined if `value` is a valid new profile name. */
export function validate_new_profile_name(value: string, existing_aliases: string[]): string | undefined {
  if (!NEW_PROFILE_PATTERN.test(value))
    return 'Use letters, digits, "-" and "_" only (start with a letter or digit, max. 64 characters)';
  if (existing_aliases.includes(value))
    return `Profile ${value} already exists`;
  return undefined;
}
