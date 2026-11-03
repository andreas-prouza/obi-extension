/** Copies the values of `from_dict` over `to_dict`, recursively. Empty values (undefined, '', []) don't override anything. */
export function override_dict(from_dict: Record<string, unknown>, to_dict: Record<string, unknown> | undefined): Record<string, unknown> {
  const target = to_dict ?? {};

  for (const [key, from_value] of Object.entries(from_dict)) {
    let value = from_value;
    const existing = target[key];
    if (typeof value === 'object' && value !== null && existing && !(value instanceof Array) && !(value instanceof Date))
      value = override_dict(value as Record<string, unknown>, existing as Record<string, unknown>);

    if (value === undefined || value === null)
      continue;
    if (typeof value === 'string' && value.length === 0)
      continue;
    if (value instanceof Array && value.length === 0)
      continue;

    target[key] = value;
  }
  return target;
}
