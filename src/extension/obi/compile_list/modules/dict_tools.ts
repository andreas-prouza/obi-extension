
export function deepListMerge(a: any[], b: any[]): any[] {
  const result = structuredClone(a);

  for (const bLevelItem of b) {
    const bLevel = bLevelItem.level;
    const bSources = bLevelItem.sources;

    let resultLevelItem = result.find(item => item.level === bLevel);

    if (resultLevelItem) {
      for (const bSource of bSources) {
        if (!resultLevelItem.sources.some((item: any) => item.source === bSource.source)) {
          resultLevelItem.sources.push({ source: bSource.source, cmds: bSource.cmds });
        }
      }
    } else {
      result.push(bLevelItem);
    }
  }

  return result;
}

export function dictMerge(baseDct: any, mergeFromDct: any): any {
  const result: any = { ...baseDct };
  for (const k in mergeFromDct) {
    if (k in result && typeof result[k] === 'object' && typeof mergeFromDct[k] === 'object') {
      result[k] = dictMerge(result[k], mergeFromDct[k]);
    } else {
      result[k] = mergeFromDct[k];
    }
  }
  return result;
}
