// Migrations of the project files (.obi/...) to Constants.OBI_PROJECT_SCHEMA_VERSION.
// The schema version is stored in the project (.obi/etc/obi-project.json), so a fresh clone of an
// already migrated project changes nothing. Migrations never overwrite values or comments.
// No vscode imports: this module is unit-tested in plain Node.

import * as fs from 'fs';
import * as path from 'path';
import { Constants } from '../../shared/Constants';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const toml = require('smol-toml');


export interface MigrationResult {
  from_version: number;
  to_version: number;
  /** Workspace-relative files written by the migration. */
  changed_files: string[];
  /** Workspace-relative OBI Python config files that differ from the shipped version (the caller decides). */
  differing_files: string[];
}


/** Paths in [general] that older versions didn't have, with their defaults. */
const GENERAL_DEFAULTS: Record<string, string> = {
  'compiled-object-list': Constants.COMPILED_OBJECT_LIST,
  'source-list': Constants.SOURCE_LIST,
  'dependency-list': Constants.DEPENDENCY_LIST,
};

/** OBI Python config files shipped in obi-media. */
const SHIPPED_FILES: string[] = ['.obi/etc/constants.py', '.obi/etc/logger_config.py'];



export function read_schema_version(ws: string): number {
  try {
    const content = JSON.parse(fs.readFileSync(path.join(ws, Constants.OBI_PROJECT_FILE), 'utf8'));
    const version = Number(content['schema-version']);
    return Number.isInteger(version) && version >= 0 ? version : 0;
  }
  catch {
    return 0;
  }
}



/**
 * Inserts `key = "value"` lines into the [general] table of a TOML text, keeping everything else
 * (comments, order, formatting). Adds the table at the end if it doesn't exist.
 */
export function insert_general_keys(text: string, entries: Record<string, string>): string {
  const lines = Object.entries(entries).map(([key, value]) => `${key} = ${JSON.stringify(value)}`);
  if (lines.length == 0)
    return text;

  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const header = /^[ \t]*\[general\][ \t]*(#.*)?$/m.exec(text);

  if (!header) {
    const separator = text.length == 0 || text.endsWith('\n') ? '' : eol;
    return `${text}${separator}${eol}[general]${eol}${lines.join(eol)}${eol}`;
  }

  const insert_at = header.index + header[0].length;
  return `${text.slice(0, insert_at)}${eol}${lines.join(eol)}${text.slice(insert_at)}`;
}



function write_file_atomic(file: string, content: string): void {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, file);
}



/** Step 0 → 1: add missing [general] paths (former "<= 2.2.1" migration), report differing Python config files. */
function migrate_0_to_1(ws: string, media_dir: string, result: MigrationResult): void {

  const config_file = path.join(ws, Constants.OBI_APP_CONFIG_FILE);
  if (fs.existsSync(config_file)) {
    const text = fs.readFileSync(config_file, 'utf8');
    let general: Record<string, unknown> | undefined;
    try {
      general = (toml.parse(text) as Record<string, Record<string, unknown> | undefined>)['general'] ?? {};
    }
    catch {
      general = undefined;   // unreadable: leave the file alone, the config page reports the error
    }

    if (general) {
      const missing = Object.fromEntries(Object.entries(GENERAL_DEFAULTS)
        .filter(([key]) => typeof general?.[key] !== 'string' || (general[key] as string).length == 0));
      if (Object.keys(missing).length > 0) {
        write_file_atomic(config_file, insert_general_keys(text, missing));
        result.changed_files.push(Constants.OBI_APP_CONFIG_FILE);
      }
    }
  }

  for (const file of SHIPPED_FILES) {
    const project_file = path.join(ws, file);
    const shipped_file = path.join(media_dir, file);
    if (fs.existsSync(project_file) && fs.existsSync(shipped_file)
        && !fs.readFileSync(project_file).equals(fs.readFileSync(shipped_file)))
      result.differing_files.push(file);
  }
}



/** Brings the project to Constants.OBI_PROJECT_SCHEMA_VERSION. Does nothing if it is already there. */
export function migrate_project(ws: string, media_dir: string): MigrationResult {

  const from_version = read_schema_version(ws);
  const result: MigrationResult = { from_version, to_version: from_version, changed_files: [], differing_files: [] };

  if (from_version >= Constants.OBI_PROJECT_SCHEMA_VERSION)
    return result;

  if (from_version < 1)
    migrate_0_to_1(ws, media_dir, result);

  const project_file = path.join(ws, Constants.OBI_PROJECT_FILE);
  fs.mkdirSync(path.dirname(project_file), { recursive: true });
  write_file_atomic(project_file, `${JSON.stringify({ 'schema-version': Constants.OBI_PROJECT_SCHEMA_VERSION }, null, 2)}\n`);
  result.changed_files.push(Constants.OBI_PROJECT_FILE);
  result.to_version = Constants.OBI_PROJECT_SCHEMA_VERSION;

  return result;
}



/** Replaces a project file with the shipped version and keeps a backup. Returns the workspace-relative backup path. */
export function replace_with_shipped(ws: string, media_dir: string, file: string, now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const backup = `${file}.bak-${stamp}`;
  fs.copyFileSync(path.join(ws, file), path.join(ws, backup));
  fs.copyFileSync(path.join(media_dir, file), path.join(ws, file));
  return backup;
}
