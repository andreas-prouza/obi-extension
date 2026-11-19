// Build package files in <workspace>/.obi/build-packages (docs/features/build-packages.md).
// No vscode imports: this module is unit-tested in plain Node.

import * as fs from 'fs';
import * as path from 'path';
import {
  BUILD_PACKAGE_DIR, BuildPackage, package_file_name, package_name_of_file, parse_build_package, serialize_build_package,
  validate_package_name, with_source_renamed, with_sources, without_sources
} from '../../shared/BuildPackage';
import { get_error_message } from '../../shared/Errors';
import { write_file_atomic } from '../utilities/AtomicFile';
import { PackageLastBuilds } from './PackageLastBuilds';


/** A package of the folder, or the error of a file that can't be read */
export interface PackageEntry {
  name: string;
  pkg?: BuildPackage;
  error?: string;
}


export class BuildPackageNameError extends Error {
  constructor(public readonly name: string, public readonly problem: 'invalid' | 'exists') {
    super(problem === 'exists' ? `Build package ${name} already exists` : `Invalid build package name '${name}'`);
    this.name = 'BuildPackageNameError';
  }
}


export class BuildPackageStore {

  constructor(private readonly ws: string) { }


  public dir(): string {
    return path.join(this.ws, BUILD_PACKAGE_DIR);
  }


  public file(name: string): string {
    return path.join(this.dir(), package_file_name(name));
  }


  /** Names of all packages, sorted case-insensitively */
  public names(): string[] {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(this.dir(), { withFileTypes: true });
    }
    catch {
      return [];
    }
    return entries
      .filter(entry => entry.isFile())
      .map(entry => package_name_of_file(entry.name))
      .filter((name): name is string => name !== undefined)
      .sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : a < b ? -1 : 1);
  }


  /** All packages; a file that can't be read is listed with its error */
  public list(): PackageEntry[] {
    return this.names().map(name => {
      try {
        const pkg = this.read(name);
        return pkg ? { name, pkg } : { name, error: 'not found' };
      }
      catch (e) {
        return { name, error: get_error_message(e) };
      }
    });
  }


  /** The package, or undefined if it doesn't exist. Throws ConfigFileError if its file is not a valid package. */
  public read(name: string): BuildPackage | undefined {
    const file = this.file(name);
    let text: string;
    try {
      text = fs.readFileSync(file, 'utf8');
    }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT')
        return undefined;
      throw e;
    }
    return parse_build_package(name, text, file);
  }


  /** The package; throws if it doesn't exist or can't be read */
  public get(name: string): BuildPackage {
    const pkg = this.read(name);
    if (!pkg)
      throw new Error(`Build package ${name} not found`);
    return pkg;
  }


  public create(name: string, description?: string, sources: string[] = []): BuildPackage {
    this.check_new_name(name);
    const pkg = with_sources({ name, description: description || undefined, sources: [], extra: {} }, sources).pkg;
    write_file_atomic(this.file(name), serialize_build_package(pkg));
    return pkg;
  }


  public rename(old_name: string, new_name: string): void {
    if (old_name === new_name)
      return;
    this.check_new_name(new_name, old_name);
    if (!fs.existsSync(this.file(old_name)))
      throw new Error(`Build package ${old_name} not found`);
    fs.renameSync(this.file(old_name), this.file(new_name));
    new PackageLastBuilds(this.ws).rename(old_name, new_name);
  }


  public delete(name: string): void {
    fs.rmSync(this.file(name), { force: true });
    new PackageLastBuilds(this.ws).remove(name);
  }


  public add_sources(name: string, sources: string[]): string[] {
    let added: string[] = [];
    this.update(name, pkg => {
      const result = with_sources(pkg, sources);
      added = result.added;
      return added.length > 0 ? result.pkg : undefined;
    });
    return added;
  }


  public remove_sources(name: string, sources: string[]): string[] {
    let removed: string[] = [];
    this.update(name, pkg => {
      const result = without_sources(pkg, sources);
      removed = result.removed;
      return removed.length > 0 ? result.pkg : undefined;
    });
    return removed;
  }


  public set_archived(name: string, archived: boolean): void {
    this.update(name, pkg => !!pkg.archived === archived ? undefined : { ...pkg, archived });
  }


  public set_description(name: string, description: string): void {
    const value = description.trim() || undefined;
    this.update(name, pkg => pkg.description === value ? undefined : { ...pkg, description: value });
  }


  /**
   * Renames a source in all packages that contain it; the others are not written. Packages whose file can't be
   * read are left unchanged and reported in `errors`.
   */
  public rename_source_everywhere(old_source: string, new_source: string): { changed: string[]; errors: string[] } {
    const changed: string[] = [];
    const errors: string[] = [];
    for (const name of this.names()) {
      try {
        if (this.update(name, pkg => with_source_renamed(pkg, old_source, new_source)))
          changed.push(name);
      }
      catch (e) {
        errors.push(`${name}: ${get_error_message(e)}`);
      }
    }
    return { changed, errors };
  }


  /**
   * Reads a package and writes the result of `change` (undefined: nothing to change, the file is not touched).
   * A file that is not a valid package is never overwritten: the read throws. Returns true if it was written.
   */
  private update(name: string, change: (pkg: BuildPackage) => BuildPackage | undefined): boolean {
    const file = this.file(name);
    const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;
    if (before === undefined)
      throw new Error(`Build package ${name} not found`);

    const changed = change(parse_build_package(name, before, file));
    if (!changed)
      return false;
    write_file_atomic(file, serialize_build_package(changed));
    return true;
  }


  private check_new_name(name: string, current?: string): void {
    const problem = validate_package_name(name, this.names(), current);
    if (problem)
      throw new BuildPackageNameError(name, problem);
  }
}
