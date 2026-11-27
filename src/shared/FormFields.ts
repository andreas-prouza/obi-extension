// Values of multi-line fields of the configuration page (config.ts). No vscode imports: unit-tested in plain Node.


function lines_of(text: string): string[] {
  return text.split('\n').map(line => line.replace(/\r$/, ''));
}


/** A list field (class type_array): one entry per line; empty lines (also the first one) are skipped */
export function parse_list_field(text: string): string[] {
  return lines_of(text).filter(line => line.length > 0);
}


/**
 * A table field (class type_dict): "key = value" per line, both trimmed. The value is everything after the first
 * "=" (it may contain one). Lines without "=" or without a key are skipped.
 */
export function parse_dict_field(text: string): Record<string, string> {
  const dict: Record<string, string> = {};
  for (const line of lines_of(text)) {
    const at = line.indexOf('=');
    if (at > 0 && line.slice(0, at).trim() !== '')
      dict[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return dict;
}
