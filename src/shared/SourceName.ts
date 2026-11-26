// Parts of a source name as the OBI backend computes them (pathlib, properties.get_source_properties).
// No vscode imports: this module is unit-tested in plain Node.


/** Last part of a path with / or \ */
function base_name(source: string): string {
  return source.split(/[\\/]/).pop() ?? '';
}


/** pathlib.PurePath.stem: the name without its last suffix */
export function path_stem(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 && i < name.length - 1 ? name.slice(0, i) : name;
}


/** pathlib.PurePath.suffixes of the last part of `source` (a name ending with "." has none) */
export function path_suffixes(source: string): string[] {
  const name = base_name(source);
  if (name.endsWith('.'))
    return [];
  return name.replace(/^\.+/, '').split('.').slice(1).map(suffix => `.${suffix}`);
}


/** The type of a source: its last two suffixes without the leading "." (`rpgle.pgm`; `pgm` for `x.pgm`) */
export function source_type(source: string): string {
  return path_suffixes(source).slice(-2).join('').replace(/^\./, '');
}


/** OBJ_NAME: the file name without its last two suffixes (`a.b.rpgle.pgm` → `a.b`) */
export function object_name(source: string): string {
  return path_stem(path_stem(base_name(source)));
}


/** SRC_ATTR and SRC_TYPE: the last two parts of the file name split at ".", in lower case */
export function source_attr_and_type(source: string): { attr: string | undefined; type: string | undefined } {
  const parts = base_name(source).split('.');
  return { attr: parts.at(-2)?.toLowerCase(), type: parts.at(-1)?.toLowerCase() };
}


/** SOURCE_DESCRIPTION: the description of the source info, trimmed, at most 50 characters (length of TEXT) */
export function source_description(source_info: unknown): string {
  if (typeof source_info !== 'object' || source_info === null || Array.isArray(source_info))
    return '';
  const description = (source_info as Record<string, unknown>)['description'];
  const text = description ? String(description) : '';
  // Characters, not UTF-16 units, as Python counts them
  return Array.from(text.trim()).slice(0, 50).join('').trimEnd();
}


/** OBJ_TEXT: a text for a CL string inside a double-quoted shell string, e.g. cl -v "CRTBNDRPG ... TEXT('$(OBJ_TEXT)')" */
export function escape_cl_text(text: string): string {
  let result = text.replace(/'/g, "''");
  for (const char of ['\\', '"', '$', '`'])
    result = result.split(char).join(`\\${char}`);
  return result;
}
