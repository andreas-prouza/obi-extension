import * as path from 'path';
import { AppConfig } from '../config/AppConfig';
import { DirTool } from './DirTool';
import { Workspace } from './Workspace';
import { OperationLock } from './OperationLock';
import { logger } from './Logger';
import { Constants } from '../../shared/Constants';
import { compute_source_hashes } from '../obi/compile_list/modules/source_hashes';


/** Hashes of the sources in the source folder (own module: createBuildList needs it, OBITools needs createBuildList) */
export class CurrentSourceHashes {

  private static cancelled = false;


  /** Stops a running retrieve (cancel button) */
  public static cancel(): void {
    CurrentSourceHashes.cancelled = true;
  }


  /**
   * MD5 of every source ('/'-separated path relative to the source folder → hash). Unchanged files are taken
   * from the cache (.obi/cache/source-hashes.json); use_cache = false hashes every file.
   */
  public static async retrieve(use_cache: boolean = true): Promise<Record<string, string>> {

    const config = AppConfig.get_app_config();
    const started = performance.now();
    CurrentSourceHashes.cancelled = false;

    const hashes = await compute_source_hashes(DirTool.get_local_source_dir(), config.general['supported-object-types'] || ['pgm', 'file', 'srvpgm'], {
      concurrency: config.general['max-threads'] || 20,
      cache_file: path.join(Workspace.get_workspace(), Constants.SOURCE_HASH_CACHE_FILE),
      use_cache: use_cache,
      is_cancelled: () => CurrentSourceHashes.cancelled || OperationLock.token.isCancellationRequested
    });

    logger.info(`${Object.keys(hashes).length} source hashes in ${((performance.now() - started) / 1000).toFixed(2)} seconds`);
    return hashes;
  }
}
