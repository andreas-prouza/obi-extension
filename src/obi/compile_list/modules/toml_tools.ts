
export function getTableElement(toml: any, treeList: string[], add_path: boolean = false): any {
  let tomlCopy = structuredClone(toml);

  for (const entry of treeList) {
    if (!(entry in tomlCopy)) {
      return null;
    }
    tomlCopy = tomlCopy[entry];
  }

  if (add_path && tomlCopy && typeof tomlCopy === 'object' && !Array.isArray(tomlCopy)) {
    const newToml: any = {};
    const prefix = treeList.join('.');
    for (const key in tomlCopy) {
      if (Object.prototype.hasOwnProperty.call(tomlCopy, key)) {
        newToml[`${prefix}.${key}`] = tomlCopy[key];
      }
    }
    return newToml;
  }

  return tomlCopy;
}
