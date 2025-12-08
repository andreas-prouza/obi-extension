
export function getTableElement(toml: any, treeList: string[]): any {
  let tomlCopy = structuredClone(toml);

  for (const entry of treeList) {
    if (!(entry in tomlCopy)) {
      return null;
    }
    tomlCopy = tomlCopy[entry];
  }

  return tomlCopy;
}
