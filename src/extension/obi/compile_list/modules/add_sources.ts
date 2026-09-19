import { getBuildOrder } from './dependency';

export function mergeSourcesIntoCompileList(
  compileList: any,
  newSources: string[],
  dependencyDict: Record<string, string[]>,
  appConfig: any
): { compileList: any; added: string[] } {

  if (!compileList['compiles']) {
    compileList['compiles'] = [];
  }

  const existingSources = new Set<string>();
  for (const level_item of compileList['compiles']) {
    for (const source_item of level_item['sources']) {
      existingSources.add(source_item['source']);
    }
  }

  const subTree = getBuildOrder(dependencyDict, newSources, appConfig);
  const added: string[] = [];

  for (const level_item of subTree['compiles']) {
    let target_level_item = compileList['compiles'].find((item: any) => item.level === level_item.level);
    if (!target_level_item) {
      target_level_item = { level: level_item.level, sources: [] };
      compileList['compiles'].push(target_level_item);
    }

    for (const source_item of level_item['sources']) {
      if (existingSources.has(source_item['source'])) {
        continue;
      }
      target_level_item['sources'].push(source_item);
      existingSources.add(source_item['source']);
      added.push(source_item['source']);
    }
  }

  compileList['compiles'].sort((a: any, b: any) => a.level - b.level);

  return { compileList, added };
}
