// Removes secret* variables from config snapshots of existing build history entries (written by older versions).
// No vscode imports: this module is unit-tested in plain Node.

import * as fs from 'fs';
import * as path from 'path';
import { config_without_secrets } from '../../shared/Redact';


/** Rewrites every <history>/<build>/compile-list.json whose embedded config has secret* variables; returns their number */
export function remove_secrets_from_history(history_root: string): number {
  let changed = 0;
  let builds: string[];
  try {
    builds = fs.readdirSync(history_root);
  }
  catch {
    return 0;   // no build history
  }

  for (const build of builds) {
    const file = path.join(history_root, build, 'compile-list.json');
    let compile_list: { config?: unknown };
    try {
      compile_list = JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    catch {
      continue;   // no or unreadable compile list: nothing to clean
    }
    if (!compile_list.config)
      continue;

    const cleaned = config_without_secrets(compile_list.config);
    if (JSON.stringify(cleaned) === JSON.stringify(compile_list.config))
      continue;

    compile_list.config = cleaned;
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(compile_list, null, 2));
    fs.renameSync(tmp, file);
    changed++;
  }
  return changed;
}
