import * as path from 'path';
import * as fse from 'fs-extra';
import { Workspace } from '../../extension/utilities/Workspace';


/**
 * Replaces the test workspace with a fresh copy of test-resources/appconfig. The running extension may
 * recreate .obi folders while they are deleted or copied (folder watchdog), so both steps are retried.
 */
export async function reset_workspace(): Promise<void> {
  const ws = Workspace.get_workspace();
  await retry(() => fse.emptyDir(ws), ['ENOTEMPTY', 'EBUSY', 'EPERM']);
  await retry(() => fse.copy(path.resolve(__dirname, '../../../test-resources/appconfig'), ws), ['EEXIST', 'EBUSY', 'EPERM']);
}


async function retry(step: () => Promise<void>, codes: string[]): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await step();
      return;
    }
    catch (e: unknown) {
      if (attempt >= 5 || !codes.includes((e as NodeJS.ErrnoException).code ?? ''))
        throw e;
      await new Promise(resolve => setTimeout(resolve, 50 * attempt));
    }
  }
}
