import { create_dependency_graph } from './dependency';
import { getSourceBuildCmds } from './build_cmds';
import { getSourceVariables } from './properties';
import { getActiveExtendedSourcesConfig } from './app_config_tools';
import { BuildListContext, create_build_list_context } from './context';

// Same behaviour as `add_source` of the OBI backend (module/compile_list.py: merge_source), which the
// extension calls instead when a local OBI is configured.

interface CompileCmd { status?: string; [key: string]: unknown }
interface CompileEntry { source: string; status?: string; hash?: unknown; cmds?: CompileCmd[]; [key: string]: unknown }
interface CompileLevel { level: number; sources: CompileEntry[] }
interface CompileList { compiles?: CompileLevel[]; timestamp?: string; [key: string]: unknown }


/** Built successfully: status `success`, or all commands successful */
function is_success(entry: CompileEntry): boolean {
  if (entry.status === 'success')
    return true;
  return (entry.cmds?.length ?? 0) > 0 && entry.cmds!.every(cmd => cmd.status === 'success');
}


/** Resets an entry so it gets built again. Commands, their output and other keys (ignore, ...) are kept */
function reset_entry(entry: CompileEntry): void {
  for (const cmd of entry.cmds ?? [])
    cmd.status = 'new';
  delete entry.status;
  delete entry.hash;
}


/** Build level of each source: 1 + the highest level of its dependencies in the list */
function calc_levels(dependency_dict: Record<string, string[]>, sources: Set<string>): Map<string, number> {
  const levels = new Map<string, number>();
  const visiting = new Set<string>();

  const level_of = (source: string): number => {
    const known = levels.get(source);
    if (known !== undefined)
      return known;
    visiting.add(source);
    let level = 1;
    for (const dependency of dependency_dict[source] ?? []) {
      // A circular dependency is skipped, as in the backend (logged there)
      if (dependency === source || !sources.has(dependency) || visiting.has(dependency))
        continue;
      level = Math.max(level, level_of(dependency) + 1);
    }
    visiting.delete(source);
    levels.set(source, level);
    return level;
  };

  sources.forEach(level_of);
  return levels;
}


/** Groups entries by level; the order within a level is kept, files (*.file) first */
function rebuild_levels(entries: { fixed_level?: number; entry: CompileEntry }[], levels: Map<string, number>): CompileLevel[] {
  const by_level = new Map<number, CompileEntry[]>();
  for (const { fixed_level, entry } of entries) {
    const level = fixed_level ?? levels.get(entry.source) ?? 1;
    by_level.set(level, [...(by_level.get(level) ?? []), entry]);
  }
  const is_file = (entry: CompileEntry) => entry.source.split('.').pop() === 'file';
  return [...by_level.keys()].sort((a, b) => a - b).map(level => ({
    level,
    sources: [...by_level.get(level)!.filter(is_file), ...by_level.get(level)!.filter(entry => !is_file(entry))]
  }));
}


function merge_source(compile_list: CompileList, source: string, dependency_dict: Record<string, string[]>, app_config: any,
                      esp: unknown, ctx: BuildListContext): { added: string[]; reset: string[] } {

  const copy_related = app_config.global?.settings?.general?.ALWAYS_TRANSFER_RELATED_COPYBOOKS === true;
  const with_cmds = (entry: CompileEntry): CompileEntry => {
    entry.cmds = getSourceBuildCmds(entry.source, app_config, esp, ctx);
    entry.variables = getSourceVariables(app_config, entry.source, ctx);
    return entry;
  };

  // Existing entries in list order (level, then position)
  const existing: { level: number; entry: CompileEntry }[] = [];
  const existing_by_source = new Map<string, CompileEntry>();
  for (const level_item of [...(compile_list.compiles ?? [])].sort((a, b) => a.level - b.level)) {
    for (const entry of level_item.sources ?? []) {
      existing.push({ level: level_item.level, entry });
      existing_by_source.set(entry.source, entry);
    }
  }

  const graph = create_dependency_graph(dependency_dict);
  const dependents = graph.affected_by([source]).sort();
  const added: string[] = [];
  const reset: string[] = [];
  const new_entries: CompileEntry[] = [];

  // The requested source: its commands are always generated again (the config may have changed)
  const requested = existing_by_source.get(source) ?? { source };
  if (existing_by_source.has(source))
    reset.push(source);
  else {
    added.push(source);
    new_entries.push(requested);
  }
  reset_entry(with_cmds(requested));

  // Sources depending on it
  const new_dependents: string[] = [];
  for (const dependent of dependents) {
    const entry = existing_by_source.get(dependent);
    if (!entry) {
      new_entries.push(with_cmds({ source: dependent }));
      new_dependents.push(dependent);
      added.push(dependent);
    }
    else if (is_success(entry)) {
      reset_entry(entry);
      reset.push(dependent);
    }
  }

  // Sources with a level >= 1. Level 0 holds copybooks; they only get a real level as the source or a dependent
  const leveled = new Set<string>([source, ...dependents]);
  existing.filter(({ level }) => level > 0).forEach(({ entry }) => leveled.add(entry.source));
  new_entries.forEach(entry => leveled.add(entry.source));

  if (copy_related) {
    const copybooks = graph.dependencies_of([source, ...new_dependents]).filter(dependency => dependency.toLowerCase().endsWith('.cpy')).sort();
    for (const copybook of copybooks) {
      if (existing_by_source.has(copybook) || leveled.has(copybook))
        continue;
      new_entries.push(with_cmds({ source: copybook }));
      added.push(copybook);
    }
  }

  const entries = [...existing.map(({ entry }) => entry), ...new_entries].map(entry => ({ fixed_level: leveled.has(entry.source) ? undefined : 0, entry }));
  compile_list.compiles = rebuild_levels(entries, calc_levels(dependency_dict, leveled));
  compile_list.timestamp = new Date().toISOString();

  return { added, reset };
}


/**
 * Adds sources to a compile list, like `add_source` of the OBI backend: the added source gets new commands and is reset,
 * its dependents are added or, if built successfully, reset (commands and output are kept), related copybooks are added
 * on level 0 (ALWAYS_TRANSFER_RELATED_COPYBOOKS), and the levels of the whole list are calculated again.
 */
export function mergeSourcesIntoCompileList(
  compileList: any,
  newSources: string[],
  dependencyDict: Record<string, string[]>,
  appConfig: any
): { compileList: any; added: string[]; reset: string[] } {

  const ctx = create_build_list_context();
  const esp = getActiveExtendedSourcesConfig();
  const added: string[] = [];
  const reset: string[] = [];

  for (const source of newSources) {
    const result = merge_source(compileList, source, dependencyDict, appConfig, esp, ctx);
    added.push(...result.added.filter(name => !added.includes(name)));
    reset.push(...result.reset.filter(name => !reset.includes(name) && !added.includes(name)));
  }
  return { compileList, added, reset };
}


/**
 * Resets the given sources (if they were built successfully) and every source that transitively depends on them,
 * since their previous build result is stale. Commands and their output are kept.
 */
export function resetDependentStatuses(
  compileList: any,
  sourceNames: string[],
  dependencyDict: Record<string, string[]>
): string[] {

  const existingEntries = new Map<string, CompileEntry>();
  for (const level_item of (compileList as CompileList).compiles ?? []) {
    for (const source_item of level_item.sources ?? [])
      existingEntries.set(source_item.source, source_item);
  }

  const dependents = create_dependency_graph(dependencyDict).affected_by(sourceNames);
  const reset: string[] = [];

  for (const source of new Set([...sourceNames, ...dependents])) {
    const entry = existingEntries.get(source);
    if (!entry || !is_success(entry))
      continue;
    reset_entry(entry);
    reset.push(source);
  }

  return reset;
}
