import * as path from 'path';
import { DirTool } from '../../../utilities/DirTool';
import { Workspace } from '../../../utilities/Workspace';
import { Constants } from '../../../../shared/Constants';


/** Values read or computed once per build-list run, instead of once per source and step */
export interface BuildListContext {
  /** source-config.toml */
  readonly source_configs: Readonly<Record<string, unknown>>;
  /** Result of getSourceProperties per source (frozen: callers copy before adding values) */
  readonly properties: Map<string, Readonly<Record<string, unknown>>>;
}


/** Reads source-config.toml (strict: a broken file stops the run with its position instead of being ignored) */
export function create_build_list_context(): BuildListContext {
  return {
    source_configs: DirTool.read_toml_strict<Record<string, unknown>>(path.join(Workspace.get_workspace(), Constants.OBI_SOURCE_CONFIG_FILE)) ?? {},
    properties: new Map(),
  };
}
