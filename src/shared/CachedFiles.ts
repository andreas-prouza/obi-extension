import * as fs from 'fs';


/** Changes when a file is written, replaced (atomic write) or deleted; 'missing' if it doesn't exist */
export function file_stamp(file: string): string {
  try {
    const stat = fs.statSync(file);
    return `${stat.mtimeMs}:${stat.size}:${stat.ino}`;
  }
  catch {
    return 'missing';
  }
}


export function deep_freeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value))
    return value;
  Object.freeze(value);
  for (const key of Reflect.ownKeys(value))
    deep_freeze((value as Record<string | symbol, unknown>)[key]);
  return value;
}


/**
 * A value loaded from files, loaded again only when one of them changes or the list of files changes
 * (e.g. the user config of another profile). A `stat` per file and call replaces the former 2 second cache.
 * A load error is kept and thrown again until a file changes, so a broken file is reported once per change.
 */
export class CachedFiles<T> {

  /** The integration tests set OBI_FREEZE_CONFIG=1: the values are shared, nobody may modify them */
  private static readonly freeze: boolean = process.env.OBI_FREEZE_CONFIG === '1';

  private stamp: string | undefined;
  private result: { value: T } | { error: unknown } | undefined;


  constructor(private readonly files: () => string[], private readonly load: (files: string[]) => T) {}


  public get(): T {
    const files = this.files();
    // Before loading: a change during the load gives a new stamp, so the next call loads again
    const stamp = files.map(file => `${file}\n${file_stamp(file)}`).join('\n');

    if (stamp !== this.stamp || !this.result) {
      try {
        const value = this.load(files);
        this.result = { value: CachedFiles.freeze ? deep_freeze(value) : value };
      }
      catch (e: unknown) {
        this.result = { error: e };
      }
      this.stamp = stamp;
    }

    if ('error' in this.result)
      throw this.result.error;
    return this.result.value;
  }


  public reset(): void {
    this.stamp = undefined;
    this.result = undefined;
  }
}
