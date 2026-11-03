// Masks secret values before text is written to a log.
// No vscode imports: this module is unit-tested in plain Node.


const MIN_SECRET_LENGTH = 3;   // shorter values would mask normal text


/** Values of secret* variables (global.variables of the config) */
export function secret_values(variables: Record<string, unknown> | undefined): string[] {
  const values: string[] = [];
  for (const [key, value] of Object.entries(variables ?? {})) {
    if (!key.toLowerCase().startsWith('secret'))
      continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      if (typeof item === 'string' && item.length >= MIN_SECRET_LENGTH)
        values.push(item);
    }
  }
  // Longest first: a secret that contains another one is masked as a whole
  return [...new Set(values)].sort((a, b) => b.length - a.length);
}


export function redact(text: string, secrets: string[]): string {
  let result = text;
  for (const secret of secrets)
    result = result.split(secret).join('***');
  return result;
}


/** Copy of a (JSON) config without secret* variables, e.g. for the build history */
export function config_without_secrets<T>(config: T): T {
  const copy = JSON.parse(JSON.stringify(config ?? {}));
  const variables = copy?.global?.variables;
  if (variables && typeof variables === 'object') {
    for (const key of Object.keys(variables)) {
      if (key.toLowerCase().startsWith('secret'))
        delete variables[key];
    }
  }
  // Profiles contain their own variables
  for (const profile of Object.values(copy?.profiles ?? {}) as { global?: { variables?: Record<string, unknown> } }[]) {
    for (const key of Object.keys(profile?.global?.variables ?? {})) {
      if (key.toLowerCase().startsWith('secret'))
        delete profile.global!.variables![key];
    }
  }
  return copy;
}
