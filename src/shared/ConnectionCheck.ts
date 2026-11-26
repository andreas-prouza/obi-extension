// Test connection: one read-only script on the IBM i, its output as facts.
// No vscode imports: this module is unit-tested in plain Node.
import { sh_quote } from './ShellQuote';


/** What the script found on the IBM i */
export interface RemoteFacts {
  home?: string;
  home_exists: boolean;
  bashrc: boolean;
  path?: string;
  base_dir_exists: boolean;
  python_exists: boolean;
  /** Output of `python --version`, e.g. "Python 3.12.3" */
  python_version?: string;
  backend_file_exists: boolean;
  /** OBI_BACKEND_VERSION of module/obi_constants.py */
  backend_version?: number;
}


/** Python of the venv in the OBI folder (as the build calls it) */
export function remote_python(obi_dir: string): string {
  return `${obi_dir}/venv/bin/python`;
}


/** File with OBI_BACKEND_VERSION in the OBI folder */
export function remote_backend_constants(obi_dir: string): string {
  return `${obi_dir}/module/obi_constants.py`;
}


/**
 * The script: only tests and reads, changes nothing. Prints `key=value` lines. The backend version is read from
 * the file (sed), the backend itself is not run; only the venv Python prints its version.
 */
export function connection_check_script(base_dir: string, obi_dir: string): string {
  const python = sh_quote(remote_python(obi_dir));
  const constants = sh_quote(remote_backend_constants(obi_dir));
  return [
    `printf 'home=%s\\n' "$HOME"`,
    `if test -d "$HOME"; then echo home_exists=1; fi`,
    `if test -f "$HOME/.bashrc"; then echo bashrc=1; fi`,
    `printf 'path=%s\\n' "$PATH"`,
    `if test -d ${sh_quote(base_dir)}; then echo base_dir_exists=1; fi`,
    `if test -x ${python}; then echo python_exists=1; printf 'python_version=%s\\n' "$(${python} --version 2>&1 | head -1)"; fi`,
    `if test -f ${constants}; then echo backend_file_exists=1; printf 'backend_version=%s\\n' "$(sed -n 's/^[[:space:]]*OBI_BACKEND_VERSION[[:space:]]*=[[:space:]]*\\([0-9][0-9]*\\).*/\\1/p' ${constants} | head -1)"; fi`,
  ].join('; ');
}


/** The facts of the script's output; unknown lines are ignored */
export function parse_facts(stdout: string): RemoteFacts {
  const values = new Map<string, string>();
  for (const line of stdout.split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0)
      values.set(line.slice(0, i), line.slice(i + 1));
  }
  const text = (key: string) => values.get(key) || undefined;
  const flag = (key: string) => values.get(key) === '1';
  const version = Number.parseInt(values.get('backend_version') ?? '', 10);
  return {
    home: text('home'),
    home_exists: flag('home_exists'),
    bashrc: flag('bashrc'),
    path: text('path'),
    base_dir_exists: flag('base_dir_exists'),
    python_exists: flag('python_exists'),
    python_version: text('python_version'),
    backend_file_exists: flag('backend_file_exists'),
    backend_version: Number.isInteger(version) ? version : undefined,
  };
}


/** Version number of "Python 3.12.3"; undefined if there is none */
export function python_version_number(output: string | undefined): string | undefined {
  return /\b(\d+\.\d+(?:\.\d+)?)\b/.exec(output ?? '')?.[1];
}


/** The backend needs Python 3.12 or newer (main.py) */
export function python_version_ok(version: string): boolean {
  const [major, minor] = version.split('.').map(part => Number.parseInt(part, 10));
  return major > 3 || (major === 3 && minor >= 12);
}


/** True if the PATH of the remote shell contains the open source packages */
export function path_has_open_source_packages(path: string | undefined): boolean {
  return (path ?? '').split(':').some(entry => entry.replace(/\/+$/, '') === '/QOpenSys/pkgs/bin');
}
