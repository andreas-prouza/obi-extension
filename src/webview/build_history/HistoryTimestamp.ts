// Names of build history folders: the compile-list timestamp with ':' replaced by '.' (Windows).
// Two formats occur: ISO with zone from the TypeScript build list ("2026-10-22T12:05:01.123Z")
// and local time without zone from the Python OBI ("2026-08-14T19:48:46.664582").
// No vscode imports: this module is unit-tested in plain Node.


const HISTORY_DIR = /^(\d{4}-\d{2}-\d{2})[T_ ](\d{2})\.(\d{2})\.(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}\.?\d{2})?$/;


/** Folder name for a compile-list timestamp. */
export function history_dir_name(timestamp: string): string {
  return timestamp.replace(/:/g, '.').replace(' ', '_');
}


/** Folder name → Date. Timestamps without zone are local time; undefined if the name is not a timestamp. */
export function parse_history_dir(dir: string): Date | undefined {
  const match = HISTORY_DIR.exec(dir);
  if (!match)
    return undefined;

  const [, day, hours, minutes, seconds, fraction = '0', zone = ''] = match;
  const milliseconds = fraction.padEnd(3, '0').substring(0, 3);
  const iso_zone = zone.length > 1 && !zone.includes('.') ? `${zone.slice(0, 3)}:${zone.slice(3)}` : zone.replace('.', ':');
  const date = new Date(`${day}T${hours}:${minutes}:${seconds}.${milliseconds}${iso_zone}`);

  return isNaN(date.getTime()) ? undefined : date;
}


/** Local calendar date (YYYY-MM-DD) used for grouping and for "delete by date". */
export function local_date_label(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
