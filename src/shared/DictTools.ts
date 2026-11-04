const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);


/** True if `value` overrides another value in override_dict: not undefined, null, '' or [] */
export function is_set(value: unknown): boolean {
  if (value === undefined || value === null)
    return false;
  if (typeof value === 'string' && value.length === 0)
    return false;
  if (value instanceof Array && value.length === 0)
    return false;
  return true;
}


function is_table(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !(value instanceof Array) && !(value instanceof Date);
}


/** Copies the values of `from_dict` over `to_dict`, recursively. Empty values (undefined, '', []) don't override anything. */
export function override_dict(from_dict: Record<string, unknown>, to_dict: Record<string, unknown> | undefined): Record<string, unknown> {
  const target = to_dict ?? {};

  for (const [key, from_value] of Object.entries(from_dict)) {
    let value = from_value;
    const existing = target[key];
    if (typeof value === 'object' && value !== null && existing && !(value instanceof Array) && !(value instanceof Date))
      value = override_dict(value as Record<string, unknown>, existing as Record<string, unknown>);

    if (!is_set(value))
      continue;

    target[key] = value;
  }
  return target;
}


/**
 * Paths ('general|source-dir') of all values in `dict` that override another value (see is_set).
 * A table is listed too, if it contains such a value.
 */
export function set_paths(dict: object | undefined, separator: string = '|'): string[] {
  const result: string[] = [];

  const walk = (table: Record<string, unknown>, prefix: string[]): boolean => {
    let found = false;
    for (const [key, value] of Object.entries(table)) {
      const path = [...prefix, key];
      const set = is_table(value) ? walk(value, path) : is_set(value);
      if (set)
        result.push(path.join(separator));
      found ||= set;
    }
    return found;
  };

  if (is_table(dict))
    walk(dict, []);
  return result;
}


/**
 * Deletes the values at the given paths ('general|source-dir'). Tables stay, even if they become empty.
 * Paths through missing tables or prototype keys are ignored.
 */
export function delete_paths(dict: object, paths: string[], separator: string = '|'): void {
  for (const path of paths) {
    const keys = path.split(separator);
    if (keys.some(key => FORBIDDEN_KEYS.has(key)))
      continue;

    let table: unknown = dict;
    for (const key of keys.slice(0, -1))
      table = is_table(table) && Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;

    const last = keys[keys.length - 1];
    if (is_table(table) && Object.prototype.hasOwnProperty.call(table, last))
      delete table[last];
  }
}
