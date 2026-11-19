// What a build list is created for: all changed sources, or given sources (the current source, a build package).
// No vscode imports: this module is unit-tested in plain Node.

import { BuildPackage, BuildPackageInfo, package_info } from '../../../shared/BuildPackage';
import { has_extension } from './modules/source_hashes';


export type BuildScope =
  /** All new and changed sources (hash compare with the compiled object list) */
  | { kind: 'changes' }
  /** These sources, whatever their hash; `package`: they are a build package (docs/features/build-packages.md) */
  | { kind: 'sources'; sources: string[]; package?: BuildPackageInfo };


export interface ChangedSources {
  'new-objects': string[];
  'changed-sources': string[];
}


export const ALL_CHANGES: BuildScope = { kind: 'changes' };


export function single_source_scope(source: string): BuildScope {
  return { kind: 'sources', sources: [source] };
}


export function package_scope(pkg: BuildPackage): BuildScope {
  return { kind: 'sources', sources: [...pkg.sources], package: package_info(pkg) };
}


/**
 * Sources forced into a build list: new if they are not in the compiled object list (object-builds.json), otherwise
 * changed. Same as `files.get_changed_sources(..., {source: ''})` of the OBI backend.
 */
export function classify_forced_sources(sources: string[], built: Record<string, unknown>): ChangedSources {
  const known = (source: string) => Object.prototype.hasOwnProperty.call(built, source);
  return {
    'new-objects': sources.filter(source => !known(source)),
    'changed-sources': sources.filter(known)
  };
}


/**
 * Sources of a package that can't be built: missing in the source folder, or a type not in `supported-object-types`.
 * `exists` checks a source relative to the source folder.
 */
export function unbuildable_sources(sources: string[], supported_types: string[], exists: (source: string) => boolean): { missing: string[]; unsupported: string[] } {
  // Same rule as the change detection
  const unsupported = sources.filter(source => !has_extension(source, supported_types));
  const missing = sources.filter(source => !unsupported.includes(source) && !exists(source));
  return { missing, unsupported };
}
