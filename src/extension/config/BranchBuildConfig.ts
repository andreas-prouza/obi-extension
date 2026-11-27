import * as path from 'path';
import { AppConfig } from './AppConfig';
import { DirTool } from '../utilities/DirTool';
import { Workspace } from '../utilities/Workspace';
import { Constants } from '../../shared/Constants';
import { CachedFiles } from '../../shared/CachedFiles';
import { override_dict } from '../../shared/DictTools';
import { BranchBuildSection, branch_build_active } from '../../shared/BranchBuild';


/**
 * `[branch-build]` of the project config merged with the user config of the active profile, as the backend merges
 * them (dict_merge). AppConfig keeps only connection, general and global, so the section is read here.
 * Docs: obi/docs/branch-build.md, spec: docs/features/obi-extension-branch-build-spec.md.
 */
export class BranchBuildConfig {

  private static readonly cache = new CachedFiles<BranchBuildSection | undefined>(
    () => [path.join(Workspace.get_workspace(), Constants.OBI_APP_CONFIG_FILE), path.join(Workspace.get_workspace(), AppConfig.get_current_profile_app_config_file())],
    ([project_file, user_file]) => {
      const project = DirTool.get_toml(project_file)?.['branch-build'];
      const user = DirTool.file_exists(user_file) ? DirTool.get_toml(user_file)?.['branch-build'] : undefined;
      const is_table = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
      if (!is_table(project) && !is_table(user))
        return undefined;
      // A copy: override_dict changes its target
      return override_dict(is_table(user) ? user : {}, is_table(project) ? structuredClone(project) : {}) as BranchBuildSection;
    }
  );


  /** The merged section, undefined without one. Shared: don't modify it */
  public static section(): BranchBuildSection | undefined {
    return BranchBuildConfig.cache.get();
  }


  /** Branch build is on: the section exists and doesn't set `enabled = false` (the backend's rule) */
  public static is_active(): boolean {
    return branch_build_active(BranchBuildConfig.section());
  }


  public static reset(): void {
    BranchBuildConfig.cache.reset();
  }
}
