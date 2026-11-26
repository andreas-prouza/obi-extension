// Conditions of extended source processing rules, as the OBI backend matches them
// (match_source_conditions in ../obi/module/app_config_tools.py, ../obi/docs/extended-source-processing.md).
// No vscode imports: this module is unit-tested in plain Node.


/** An invalid regular expression or pattern in a condition; the message names condition and pattern */
export class EspConditionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'EspConditionError';
  }
}


const compiled = new Map<string, RegExp>();


/**
 * Python's fnmatch.translate: the pattern has to match the whole value; `*` matches any text (also `/`),
 * `?` one character, `[abc]` / `[!abc]` one character of / not of the set. Case-sensitive, as on the IBM i.
 */
export function fnmatch_regex(pattern: string): RegExp {
  const n = pattern.length;
  let out = '';
  let i = 0;
  while (i < n) {
    const c = pattern[i++];
    if (c === '*') {
      // Several * in a row are one
      if (pattern[i - 2] !== '*')
        out += '.*';
    }
    else if (c === '?')
      out += '.';
    else if (c === '[') {
      let j = i;
      if (pattern[j] === '!')
        j++;
      if (pattern[j] === ']')
        j++;
      while (j < n && pattern[j] !== ']')
        j++;
      if (j >= n) {
        out += '\\[';   // no closing bracket: a literal [
        continue;
      }
      let set = bracket_set(pattern, i, j);
      i = j + 1;
      if (set === '')
        out += '(?!)';   // only empty ranges: never matches
      else if (set === '!')
        out += '.';
      else {
        if (set[0] === '!')
          set = '^' + set.slice(1);
        else if (set[0] === '^')
          set = '\\' + set;
        out += `[${set}]`;
      }
    }
    else
      out += c.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
  }
  return new RegExp(`^(?:${out})$`, 's');
}


/** Content of a set pattern[start..end) for a JavaScript character class; ranges like z-a are dropped, as in Python */
function bracket_set(pattern: string, start: number, end: number): string {
  const escape = (text: string) => text.replace(/\\/g, '\\\\').replace(/]/g, '\\]');
  if (!pattern.slice(start, end).includes('-'))
    return escape(pattern.slice(start, end));

  const chunks: string[] = [];
  let i = start;
  let k = pattern[start] === '!' ? start + 2 : start + 1;
  for (;;) {
    k = pattern.indexOf('-', k);
    if (k < 0 || k >= end)
      break;
    chunks.push(pattern.slice(i, k));
    i = k + 1;
    k = k + 3;
  }
  const last = pattern.slice(i, end);
  if (last)
    chunks.push(last);
  else
    chunks[chunks.length - 1] += '-';
  for (let c = chunks.length - 1; c > 0; c--) {
    if (chunks[c - 1].slice(-1) > chunks[c][0]) {
      chunks[c - 1] = chunks[c - 1].slice(0, -1) + chunks[c].slice(1);
      chunks.splice(c, 1);
    }
  }
  return chunks.map(chunk => escape(chunk).replace(/-/g, '\\-')).join('-');
}


function compile(pattern: string, use_regex: boolean, condition: string): RegExp {
  const key = `${use_regex ? 're' : 'fn'}:${pattern}`;
  let regex = compiled.get(key);
  if (!regex) {
    try {
      regex = use_regex ? new RegExp(pattern) : fnmatch_regex(pattern);
    }
    catch (e: unknown) {
      throw new EspConditionError(`Extended source processing: invalid ${use_regex ? 'regular expression' : 'pattern'} '${pattern}' in condition ${condition} (${e instanceof Error ? e.message : String(e)})`, { cause: e });
    }
    compiled.set(key, regex);
  }
  return regex;
}


/** Python's fnmatch.fnmatchcase(value, pattern); the pattern is compiled once */
export function fnmatch(value: string, pattern: string): boolean {
  const key = `fn:${pattern}`;
  let regex = compiled.get(key);
  if (!regex) {
    regex = fnmatch_regex(pattern);
    compiled.set(key, regex);
  }
  return regex.test(value);
}


/** Value of a variable as text for a condition: strings and whole numbers; anything else (list, table, true/false, 1.5) never matches */
function as_text(value: unknown): string | undefined {
  if (typeof value === 'string')
    return value;
  if ((typeof value === 'number' && Number.isInteger(value)) || typeof value === 'bigint')
    return String(value);
  return undefined;
}


/**
 * True if all conditions match (no conditions: true). The name of a condition is a variable of the source.
 * - A string is compared with the value of that variable.
 * - A list is compared with the source name (`source`), whatever the name is; one matching entry is enough.
 * With `use_regex` a value matches if the expression is found in it (`re.search`), otherwise the pattern has to
 * match completely (`fnmatch`). An unknown name doesn't match (reported to `on_unknown`).
 * Throws EspConditionError for an invalid expression.
 */
export function match_conditions(conditions: unknown, use_regex: boolean, source: string, properties: Record<string, unknown>, on_unknown: (name: string) => void = () => undefined): boolean {

  if (typeof conditions !== 'object' || conditions === null || Array.isArray(conditions))
    return true;

  for (const [name, value] of Object.entries(conditions)) {
    if (!Object.prototype.hasOwnProperty.call(properties, name)) {
      on_unknown(name);
      return false;
    }

    let found = false;
    if (typeof value === 'string') {
      const text = as_text(properties[name]);
      found = text !== undefined && compile(value, use_regex, name).test(text);
    }
    else if (Array.isArray(value))
      found = value.some(entry => typeof entry === 'string' && compile(entry, use_regex, name).test(source));

    if (!found)
      return false;
  }
  return true;
}
