import * as fs from 'fs';
import * as path from 'path';
import { Minimatch } from 'minimatch';
import { IQualifiedSource } from '../../shared/Source';
// No vscode imports: this module is unit-tested in plain Node.


export interface InventoryEntry {
  /** Relative to the source folder, with '/' */
  path: string;
  /** An empty folder (shown by filters with show-empty-folders) */
  empty_dir: boolean;
}


/** All files and empty folders below `root`: the files of a folder first, then its subfolders */
export async function walk_sources(root: string): Promise<InventoryEntry[] | undefined> {
  if (!(await fs.promises.stat(root).then(stat => stat.isDirectory(), () => false)))
    return undefined;

  const walk = async (dir: string): Promise<InventoryEntry[]> => {
    const entries = await fs.promises.readdir(path.join(root, dir), { withFileTypes: true }).catch(() => []);
    if (entries.length === 0)
      return dir === '' ? [] : [{ path: dir, empty_dir: true }];

    const files: InventoryEntry[] = [];
    const folders: Promise<InventoryEntry[]>[] = [];
    for (const entry of entries) {
      const relative = dir === '' ? entry.name : `${dir}/${entry.name}`;
      if (entry.isDirectory())
        folders.push(walk(relative));
      else
        files.push({ path: relative, empty_dir: false });
    }
    return files.concat(...await Promise.all(folders));
  };

  return walk('');
}


/** Last three parts of a file (lib/file/member), or lib/file of an empty folder */
export function to_qualified(entry: InventoryEntry): IQualifiedSource {
  const parts = entry.path.split('/');
  if (entry.empty_dir)
    return { 'source-lib': parts[0] ?? '', 'source-file': parts[1] ?? '', 'source-member': '' };
  const [member, file, lib] = parts.reverse();
  return { 'source-lib': lib ?? '', 'source-file': file ?? '', 'source-member': member ?? '' };
}


export function is_supported(file: string, supported_types: string[]): boolean {
  return supported_types.includes(file.split('.').pop() ?? '');
}



export interface CompiledFilter {
  show_empty_folders: boolean;
  matches(lib: string, file: string, member: string): boolean;
}


/** One entry of a source filter file. Throws for an invalid regular expression. */
export function compile_filter(entry: IQualifiedSource): CompiledFilter {
  const patterns = [entry['source-lib'], entry['source-file'], entry['source-member']].map(pattern => String(pattern ?? ''));
  let matchers: ((value: string) => boolean)[];

  if (entry['use-regex']) {
    const regexps = patterns.map(pattern => new RegExp(`^(?:${pattern})$`, 'i'));
    matchers = regexps.map(regexp => (value: string) => regexp.test(value));
  }
  else
    // Only * and ? are wildcards: # @ $ are normal characters of IBM i names
    matchers = patterns.map(pattern => {
      // "*" also matches the empty member of an empty folder
      if (/^\*+$/.test(pattern))
        return () => true;
      const matcher = new Minimatch(pattern, { nocase: true, nocomment: true, nonegate: true, noext: true, nobrace: true, noglobstar: true, dot: true });
      return (value: string) => matcher.match(value);
    });

  return {
    show_empty_folders: entry['show-empty-folders'] === true,
    matches: (lib, file, member) => matchers[0](lib) && matchers[1](file) && matchers[2](member)
  };
}


/** Sources matching at least one entry, each once; invalid entries are reported and skipped */
export function apply_source_filters(
  sources: IQualifiedSource[], entries: IQualifiedSource[], on_invalid: (index: number, message: string) => void
): IQualifiedSource[] {

  const filters: CompiledFilter[] = [];
  entries.forEach((entry, index) => {
    try {
      filters.push(compile_filter(entry));
    }
    catch (e: unknown) {
      on_invalid(index + 1, e instanceof Error ? e.message : String(e));
    }
  });

  const result = new Map<string, IQualifiedSource>();
  for (const source of sources) {
    const lib = source['source-lib'] || '';
    const file = source['source-file'] || '';
    const member = source['source-member'] || '';
    const key = `${lib}/${file}/${member}`;
    if (result.has(key) || (!lib && !file))
      continue;

    const complete = lib !== '' && file !== '' && member !== '';
    if (filters.some(filter => (complete || filter.show_empty_folders) && filter.matches(lib, file, member)))
      result.set(key, { 'source-lib': lib, 'source-file': file, 'source-member': member });
  }
  return Array.from(result.values());
}
