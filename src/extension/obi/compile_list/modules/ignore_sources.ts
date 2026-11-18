// Which sources of a build list are only there because of a source the user unchecks in the build summary.
// No vscode imports: unit-tested in plain Node.
import { DependencyGraph } from './dependency_graph';


interface ListEntry { source: string; ignore: boolean }


/** Sources of the build list with level > 0, in list order. Level 0 holds related copybooks: they pull in nothing. */
function list_entries(compile_list: unknown): ListEntry[] {
  const levels = typeof compile_list === 'object' && compile_list !== null ? (compile_list as { compiles?: unknown }).compiles : undefined;
  const entries: ListEntry[] = [];
  for (const level of Array.isArray(levels) ? levels : []) {
    if (typeof level !== 'object' || level === null || (level as { level?: unknown }).level === 0)
      continue;
    const sources = (level as { sources?: unknown }).sources;
    for (const entry of Array.isArray(sources) ? sources : []) {
      const source = typeof entry === 'object' && entry !== null ? (entry as { source?: unknown }).source : undefined;
      if (typeof source === 'string')
        entries.push({ source: source, ignore: (entry as { ignore?: unknown }).ignore === true });
    }
  }
  return entries;
}


/**
 * Checked sources that are in the build list only because of `source`, which the user unchecks: they depend on it
 * (directly or transitively), are no new or changed sources themselves, and no other checked source of the list
 * that was not pulled in by a dependency (new, changed or added by hand) leads to them.
 *
 * @param changed new and changed sources of the build (changed-object-list.json)
 */
export function dependents_only_needed_by(compile_list: unknown, source: string, changed: Iterable<string>, graph: DependencyGraph): string[] {

  const entries = list_entries(compile_list);
  const in_list = new Set(entries.map(entry => entry.source));
  if (!in_list.has(source))
    return [];

  // Pulled in by a dependency: depends on another source of the list, and isn't new or changed itself
  const changed_set = new Set(changed);
  const reached = new Set<string>();
  for (const entry of entries)
    graph.affected_by([entry.source]).forEach(dependent => reached.add(dependent));
  const is_root = (name: string) => changed_set.has(name) || !reached.has(name);

  const checked_roots = entries.filter(entry => entry.source !== source && !entry.ignore && is_root(entry.source)).map(entry => entry.source);
  const still_needed = new Set(graph.affected_by(checked_roots));
  const dependents = new Set(graph.affected_by([source]));

  return entries
    .filter(entry => dependents.has(entry.source) && !entry.ignore && !is_root(entry.source) && !still_needed.has(entry.source))
    .map(entry => entry.source);
}
