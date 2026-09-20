import { getBuildOrder, getTargetsOnlyDependedObjects } from './dependency';

export function mergeSourcesIntoCompileList(
  compileList: any,
  newSources: string[],
  dependencyDict: Record<string, string[]>,
  appConfig: any
): { compileList: any; added: string[]; reset: string[] } {

  if (!compileList['compiles']) {
    compileList['compiles'] = [];
  }

  const existingSources = new Set<string>();
  const existingEntries = new Map<string, any>();
  for (const level_item of compileList['compiles']) {
    for (const source_item of level_item['sources']) {
      existingSources.add(source_item['source']);
      existingEntries.set(source_item['source'], source_item);
    }
  }

  const subTree = getBuildOrder(dependencyDict, newSources, appConfig);
  const added: string[] = [];
  const reset: string[] = [];

  for (const level_item of subTree['compiles']) {
    let target_level_item = compileList['compiles'].find((item: any) => item.level === level_item.level);
    if (!target_level_item) {
      target_level_item = { level: level_item.level, sources: [] };
      compileList['compiles'].push(target_level_item);
    }

    for (const source_item of level_item['sources']) {
      if (existingSources.has(source_item['source'])) {
        // Already-present dependent: its previous build result may no longer be valid.
        const existing_entry = existingEntries.get(source_item['source']);
        if (existing_entry && existing_entry['status'] === 'success') {
          existing_entry['cmds'] = source_item['cmds'];
          delete existing_entry['status'];
          reset.push(source_item['source']);
        }
        continue;
      }
      target_level_item['sources'].push(source_item);
      existingSources.add(source_item['source']);
      added.push(source_item['source']);
    }
  }

  compileList['compiles'].sort((a: any, b: any) => a.level - b.level);

  return { compileList, added, reset };
}


/**
 * Resets the status of the given sources (when currently 'success') and cascades the same reset
 * to every source that transitively depends on them, since their previous build result is stale.
 */
export function resetDependentStatuses(
  compileList: any,
  sourceNames: string[],
  dependencyDict: Record<string, string[]>
): string[] {

  const existingEntries = new Map<string, any>();
  for (const level_item of compileList['compiles'] || []) {
    for (const source_item of level_item['sources']) {
      existingEntries.set(source_item['source'], source_item);
    }
  }

  const dependents = getTargetsOnlyDependedObjects(dependencyDict, sourceNames);
  const affected = Array.from(new Set([...sourceNames, ...dependents]));
  const reset: string[] = [];

  for (const source of affected) {
    const entry = existingEntries.get(source);
    if (!entry || entry['status'] !== 'success') {
      continue;
    }
    for (const cmd of entry['cmds'] || []) {
      cmd['status'] = 'new';
    }
    delete entry['status'];
    reset.push(source);
  }

  return reset;
}
