// Helpers for streamed command output.
// No vscode imports: this module is unit-tested in plain Node.


/** Splits streamed chunks into lines; a partial last line is kept until the next chunk (or flush). */
export class LineSplitter {
  private rest = '';

  push(chunk: string): string[] {
    const parts = (this.rest + chunk).split(/\r?\n/);
    this.rest = parts.pop() ?? '';
    return parts;
  }

  flush(): string[] {
    const last = this.rest;
    this.rest = '';
    return last.length > 0 ? [last] : [];
  }
}


/** Line the remote build prints first, so it can be stopped: "OBI_PID:12345" */
export const OBI_PID_PREFIX = 'OBI_PID:';

export function parse_obi_pid(line: string): number | undefined {
  const match = /^OBI_PID:(\d{1,10})\s*$/.exec(line);
  return match ? Number(match[1]) : undefined;
}


/** "1:05" for 65 seconds */
export function format_elapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}


export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
