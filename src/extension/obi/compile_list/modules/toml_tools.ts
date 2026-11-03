
/**
 * Element of a (TOML) object at `treeList`, e.g. ['global', 'cmds'], or null. Returns the element itself, not a copy:
 * callers must not modify it. With `add_path`, the keys of an object are prefixed with the path ("global.cmds.x").
 */
export function getTableElement(toml: any, treeList: string[], add_path: boolean = false): any {
  let node: unknown = toml;

  for (const entry of treeList) {
    if (!node || typeof node !== 'object' || !Object.prototype.hasOwnProperty.call(node, entry)) {
      return null;
    }
    node = (node as Record<string, unknown>)[entry];
  }

  if (add_path && node && typeof node === 'object' && !Array.isArray(node)) {
    const newToml: Record<string, unknown> = {};
    const prefix = treeList.join('.');
    for (const [key, value] of Object.entries(node)) {
      newToml[`${prefix}.${key}`] = value;
    }
    return newToml;
  }

  return node;
}
