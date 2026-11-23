// Build packages: a named, explicit list of sources in .obi/build-packages/<name>.json, committed with the project
// (docs/features/build-packages.md). The file name is the package name.
// No vscode imports: this module is unit-tested in plain Node.

import { ConfigFileError, json_error_position } from './Errors';
import { is_valid_source_path } from './ShellQuote';


/** Folder of the package files, relative to the workspace */
export const BUILD_PACKAGE_DIR = '.obi/build-packages';
export const BUILD_PACKAGE_EXTENSION = '.json';

/** The name becomes a file name: no separators, so it can't leave the folder. Same rule in the backend (module/build_package.py). */
export const BUILD_PACKAGE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const MAX_NAME_LENGTH = 100;

// Device names Windows doesn't allow as file names, also with an extension (CON.json)
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;


export interface BuildPackage {
  name: string;
  description?: string;
  /** Sources relative to the source directory, '/'-separated */
  sources: string[];
  /** Done (e.g. merged): hidden in the view unless archived packages are shown. Still buildable. */
  archived?: boolean;
  /** Content of the file as read: other keys and the key order are kept when it is written again */
  extra: Record<string, unknown>;
}


/** What a build list records about its package (`compile-list.json` → `package`) */
export interface BuildPackageInfo {
  name: string;
  description?: string;
}


export function package_info(pkg: BuildPackage): BuildPackageInfo {
  return pkg.description ? { name: pkg.name, description: pkg.description } : { name: pkg.name };
}


export function is_valid_package_name(name: string): boolean {
  return BUILD_PACKAGE_NAME_PATTERN.test(name) && !WINDOWS_RESERVED.test(name);
}


/** File name of a package (without folder) */
export function package_file_name(name: string): string {
  if (!is_valid_package_name(name))
    throw new Error(`Invalid build package name '${name}'`);
  return `${name}${BUILD_PACKAGE_EXTENSION}`;
}


/** Package name of a file name, or undefined if it is no package file */
export function package_name_of_file(file_name: string): string | undefined {
  if (!file_name.endsWith(BUILD_PACKAGE_EXTENSION))
    return undefined;
  const name = file_name.slice(0, -BUILD_PACKAGE_EXTENSION.length);
  return is_valid_package_name(name) ? name : undefined;
}


export type PackageNameProblem = 'invalid' | 'exists';

/**
 * Problem of a new name, or undefined if it is valid. A name that differs from an existing one only in case is taken
 * (Windows and macOS file systems). `current` is the package being renamed: changing only its case is allowed.
 */
export function validate_package_name(value: string, existing: string[], current?: string): PackageNameProblem | undefined {
  if (!is_valid_package_name(value))
    return 'invalid';
  const lower = value.toLowerCase();
  if (existing.some(name => name !== current && name.toLowerCase() === lower))
    return 'exists';
  return undefined;
}


/**
 * Suggestion for a package name from a git branch: invalid characters become '-' (`feature/ABC-123 x` → `feature-ABC-123-x`).
 * If a package of that name exists (a branch can have several), the next free `<name>-2`, `<name>-3`, ...
 */
export function suggest_package_name(branch: string | undefined, existing: string[] = []): string | undefined {
  if (!branch || branch === 'HEAD')
    return undefined;
  const base = branch
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[^A-Za-z0-9]+/, '')
    .slice(0, MAX_NAME_LENGTH)
    .replace(/[-.]+$/, '');
  if (!is_valid_package_name(base))
    return undefined;

  for (let number = 1; number < 100; number++) {
    const suffix = number === 1 ? '' : `-${number}`;
    const name = `${base.slice(0, MAX_NAME_LENGTH - suffix.length).replace(/[-.]+$/, '')}${suffix}`;
    if (validate_package_name(name, existing) === undefined)
      return name;
  }
  return undefined;
}


/** Sources that can't be part of a package (not relative, '..', characters IBM i names don't have) */
export function invalid_source_names(sources: string[]): string[] {
  return sources.filter(source => source.startsWith('/') || !is_valid_source_path(source));
}


/**
 * Package from the content of its file. An empty file is an empty package.
 * Throws ConfigFileError (with line and column for invalid JSON) if the content is not a valid package.
 */
export function parse_build_package(name: string, text: string, file: string): BuildPackage {

  if (text.trim().length === 0)
    return { name, sources: [], extra: {} };

  let data: unknown;
  try {
    data = JSON.parse(text);
  }
  catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const { line, column } = json_error_position(text, message);
    throw new ConfigFileError(file, line, column, message);
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data))
    throw new ConfigFileError(file, undefined, undefined, 'a build package must be a JSON object');
  const extra = data as Record<string, unknown>;

  const description = extra['description'];
  if (description !== undefined && typeof description !== 'string')
    throw new ConfigFileError(file, undefined, undefined, '"description" must be a text');

  const archived = extra['archived'];
  if (archived !== undefined && typeof archived !== 'boolean')
    throw new ConfigFileError(file, undefined, undefined, '"archived" must be true or false');

  const sources = extra['sources'] ?? [];
  if (!Array.isArray(sources) || sources.some(source => typeof source !== 'string'))
    throw new ConfigFileError(file, undefined, undefined, '"sources" must be a list of source names');

  const invalid = invalid_source_names(sources as string[]);
  if (invalid.length > 0)
    throw new ConfigFileError(file, undefined, undefined, `invalid source names (relative to the source directory, '/'-separated): ${invalid.join(', ')}`);

  const pkg: BuildPackage = { name, description: description || undefined, sources: sorted_sources(sources as string[]), extra };
  if (archived)
    pkg.archived = true;
  return pkg;
}


/**
 * File content of a package: sources sorted and without duplicates, one per line, 2 spaces, trailing newline.
 * Other keys keep their place; a new file gets `description` before `sources`.
 */
export function serialize_build_package(pkg: BuildPackage): string {
  const content: Record<string, unknown> = { ...pkg.extra };
  if (pkg.description)
    content['description'] = pkg.description;
  else
    delete content['description'];
  content['sources'] = sorted_sources(pkg.sources);
  // Only written when set: files of packages that were never archived stay as they are
  if (pkg.archived)
    content['archived'] = true;
  else
    delete content['archived'];
  return `${JSON.stringify(content, null, 2)}\n`;
}


function sorted_sources(sources: string[]): string[] {
  return [...new Set(sources)].sort();
}


/** The package with `sources` added; `added` are the ones it didn't have yet */
export function with_sources(pkg: BuildPackage, sources: string[]): { pkg: BuildPackage; added: string[] } {
  const invalid = invalid_source_names(sources);
  if (invalid.length > 0)
    throw new Error(`Invalid source names: ${invalid.join(', ')}`);
  const existing = new Set(pkg.sources);
  const added = sorted_sources(sources.filter(source => !existing.has(source)));
  return { pkg: { ...pkg, sources: sorted_sources([...pkg.sources, ...added]) }, added };
}


/** The package without `sources`; `removed` are the ones it had */
export function without_sources(pkg: BuildPackage, sources: string[]): { pkg: BuildPackage; removed: string[] } {
  const remove = new Set(sources);
  const removed = pkg.sources.filter(source => remove.has(source));
  return { pkg: { ...pkg, sources: pkg.sources.filter(source => !remove.has(source)) }, removed };
}


/** The package with `old_source` renamed, or undefined if it doesn't contain it */
export function with_source_renamed(pkg: BuildPackage, old_source: string, new_source: string): BuildPackage | undefined {
  if (!pkg.sources.includes(old_source) || old_source === new_source)
    return undefined;
  if (invalid_source_names([new_source]).length > 0)
    throw new Error(`Invalid source name: ${new_source}`);
  return { ...pkg, sources: sorted_sources(pkg.sources.map(source => source === old_source ? new_source : source)) };
}


/** True if the package matches a text filter: name, description or one of its sources contains it (not case-sensitive) */
export function package_matches(pkg: Pick<BuildPackage, 'name' | 'description' | 'sources'>, filter: string): boolean {
  const text = filter.trim().toLowerCase();
  if (text === '')
    return true;
  return [pkg.name, pkg.description ?? '', ...pkg.sources].some(value => value.toLowerCase().includes(text));
}


/** Mime type of OBI sources dragged from the Source filters or the Build packages view: a JSON list of source names */
export const SOURCES_MIME_TYPE = 'application/vnd.obi.sources';


/** Source names of a drag (JSON list of strings); invalid entries are left out */
export function parse_dragged_sources(json: string): string[] {
  let data: unknown;
  try {
    data = JSON.parse(json);
  }
  catch {
    return [];
  }
  if (!Array.isArray(data))
    return [];
  const strings = data.filter((value): value is string => typeof value === 'string');
  const invalid = new Set(invalid_source_names(strings));
  return [...new Set(strings.filter(source => !invalid.has(source)))];
}


/**
 * Sources of a build list (compile-list.json) in build order, without duplicates and invalid names, and those of them
 * that are unchecked in the build summary (`ignore`): to add the sources of a build to a build package.
 *
 * Level 0 is left out: it holds the related copybooks (ALWAYS_TRANSFER_RELATED_COPYBOOKS), which are only transferred.
 * In a package they would be forced sources and pull in every object that uses them; the build of the package adds
 * them on level 0 again anyway.
 */
export function sources_of_build_list(compile_list: unknown): { sources: string[]; unchecked: Set<string> } {
  const is_object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
  if (!is_object(compile_list) || !Array.isArray(compile_list.compiles))
    return { sources: [], unchecked: new Set() };
  const sources: string[] = [];
  const checked = new Set<string>();
  for (const level of compile_list.compiles)
    for (const entry of is_object(level) && level.level !== 0 && Array.isArray(level.sources) ? level.sources : [])
      if (is_object(entry) && typeof entry.source === 'string') {
        sources.push(entry.source);
        if (!entry.ignore)
          checked.add(entry.source);
      }
  const invalid = new Set(invalid_source_names(sources));
  const valid = [...new Set(sources.filter(source => !invalid.has(source)))];
  // A source that is in the list more than once counts as checked if one of its entries is
  return { sources: valid, unchecked: new Set(valid.filter(source => !checked.has(source))) };
}
