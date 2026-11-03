// Typed errors shared across the extension.
// No vscode imports: this module is unit-tested in plain Node.


/** Message of anything that was thrown (Error, string or other value) */
export function get_error_message(error: unknown): string {
  if (error instanceof Error)
    return error.message;
  if (typeof error === 'string')
    return error;
  try {
    return JSON.stringify(error) ?? String(error);
  }
  catch {
    return String(error);
  }
}


/** Stack (or message) for the log */
export function get_error_details(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : get_error_message(error);
}


/** The user cancelled a prompt in the middle of a longer operation. Never shown as an error. */
export class UserCancelledError extends Error {
  constructor(message: string = 'Cancelled by user') {
    super(message);
    this.name = 'UserCancelledError';
  }
}


/** The SSH host presented a key other than the known one. The user has already been warned. */
export class HostKeyError extends Error {
  constructor(public readonly host: string) {
    super(`Connection refused: the host key of ${host} has changed`);
    this.name = 'HostKeyError';
  }
}


/** A local command ended with an exit code other than 0 (or could not be started: exit_code null). */
export class SystemCmdError extends Error {
  constructor(message: string, public readonly exit_code: number | null, public readonly signal: string | null) {
    super(message);
    this.name = 'SystemCmdError';
  }
}


/** Result of a directory transfer. */
export interface TransferResult {
  transferred: number;
  failed: { path: string; error: string }[];
}


/** Some files of a directory transfer failed. */
export class TransferError extends Error {
  constructor(public readonly result: TransferResult, target: string) {
    const total = result.transferred + result.failed.length;
    const list = result.failed.slice(0, 10).map(f => f.path).join(', ');
    super(`${result.failed.length} of ${total} files could not be transferred to ${target}: ${list}${result.failed.length > 10 ? ', …' : ''}`);
    this.name = 'TransferError';
  }
}


/** A config/data file exists but can't be parsed (line/column 1-based, if known). */
export class ConfigFileError extends Error {
  constructor(
    public readonly file: string,
    public readonly line: number | undefined,
    public readonly column: number | undefined,
    public readonly reason: string
  ) {
    super(`${file}${line !== undefined ? ` (line ${line}${column !== undefined ? `, column ${column}` : ''})` : ''}: ${reason}`);
    this.name = 'ConfigFileError';
  }
}


/** Line/column of a JSON.parse error, from the message ("line 2 column 5" in newer V8, otherwise "position 23"). */
export function json_error_position(text: string, message: string): { line?: number; column?: number } {
  const line_column = message.match(/line (\d+) column (\d+)/);
  if (line_column)
    return { line: Number(line_column[1]), column: Number(line_column[2]) };

  const position = message.match(/position (\d+)/);
  if (position) {
    const lines = text.slice(0, Number(position[1])).split('\n');
    return { line: lines.length, column: lines[lines.length - 1].length + 1 };
  }
  return {};
}
