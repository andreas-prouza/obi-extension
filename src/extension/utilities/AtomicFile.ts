// Atomic file writes.
// No vscode imports: this module is unit-tested in plain Node.

import * as fs from 'fs';
import * as path from 'path';


/**
 * Writes via a temp file + rename, so readers never see a partially written file. Creates missing folders.
 * Returns the written file (the target of a symlink). Throws on failure.
 */
export function write_file_atomic(file: string, content: string): string {

  fs.mkdirSync(path.dirname(file), { recursive: true });

  // Write next to the real file if `file` is a symlink, so the link is kept
  const target = fs.existsSync(file) ? fs.realpathSync(file) : file;
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, content, 'utf8');

  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(tmp, target);
      return target;
    }
    catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      // Windows: the target can be locked for a moment (file watcher, virus scanner)
      if (attempt < 3 && (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES')) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
        continue;
      }
      fs.rmSync(tmp, { force: true });
      throw e;
    }
  }
}
