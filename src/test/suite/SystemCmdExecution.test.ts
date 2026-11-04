import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SystemCmdExecution } from '../../extension/utilities/SystemCmdExecution';
import { SystemCmdError, UserCancelledError } from '../../shared/Errors';


const cwd = os.tmpdir();
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function is_running(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}


suite('SystemCmdExecution', () => {

  test('exit code 0 resolves', async () => {
    await SystemCmdExecution.run_system_cmd(cwd, 'node', ['-e', 'process.exit(0)'], 'test-ok');
    assert.strictEqual(SystemCmdExecution.processes['test-ok'], undefined, 'process entry removed');
  });


  test('exit code 3 rejects with SystemCmdError (and only rejects)', async () => {
    await assert.rejects(
      () => SystemCmdExecution.run_system_cmd(cwd, 'node', ['-e', 'process.exit(3)'], 'test-fail'),
      (e: unknown) => e instanceof SystemCmdError && e.exit_code === 3);
    assert.strictEqual(SystemCmdExecution.processes['test-fail'], undefined);
  });


  test('env is added to the environment of VS Code', async () => {
    const lines: string[] = [];
    await SystemCmdExecution.run_system_cmd(cwd, 'node', ['-e', 'console.log(process.env.OBI_TEST_ENV + "|" + (process.env.PATH ? "path" : ""))'], 'test-env',
      { env: { OBI_TEST_ENV: 'set' }, on_line: (line, stream) => { if (stream === 'stdout') lines.push(line); } });
    assert.deepStrictEqual(lines, ['set|path']);
  });


  test('starting the same id twice is refused', async () => {
    const running = SystemCmdExecution.run_system_cmd(cwd, 'node', ['-e', 'setTimeout(()=>{}, 300)'], 'test-twice');
    await assert.rejects(() => SystemCmdExecution.run_system_cmd(cwd, 'node', ['-e', '0'], 'test-twice'), /already running/);
    await running;
  });


  test('abort stops the program and its child processes and rejects with UserCancelledError', async function () {
    if (process.platform === 'win32')
      this.skip();   // process tree kill via taskkill is not covered here
    this.timeout(10000);

    const pid_file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'obi-cmd-')), 'pid');
    // The spawned node starts a second node (the grandchild) that writes its pid
    const grandchild_script = `require('fs').writeFileSync(${JSON.stringify(pid_file)}, String(process.pid)); setInterval(()=>{}, 1000)`;
    const child_script = `require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(grandchild_script)}], { stdio: 'ignore' }); setInterval(()=>{}, 1000)`;
    const running = SystemCmdExecution.run_system_cmd(cwd, 'node', ['-e', child_script], 'test-abort');

    for (let i = 0; i < 50 && !fs.existsSync(pid_file); i++)
      await sleep(100);
    const grandchild = Number(fs.readFileSync(pid_file, 'utf8'));
    assert.ok(is_running(grandchild));

    SystemCmdExecution.abort_system_cmd('test-abort');
    await assert.rejects(() => running, UserCancelledError);

    for (let i = 0; i < 20 && is_running(grandchild); i++)
      await sleep(100);
    assert.ok(!is_running(grandchild), 'grandchild process is stopped');
  });


  test('arguments reach the program unchanged; quotes, backticks, $( ) and ; are not run by a shell', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obi-args-'));
    try {
      const out = path.join(dir, 'argv.json');
      const tricky = `--source=lib/qrpglesrc/a'b\`touch pwned1\`$(touch pwned2);touch pwned3 "x" %PATH% $HOME.pgm`;
      const script = 'require("fs").writeFileSync(process.argv[1], JSON.stringify(process.argv.slice(2)))';

      await SystemCmdExecution.run_system_cmd(dir, 'node', ['-e', script, out, tricky], 'test-args');

      assert.deepStrictEqual(JSON.parse(fs.readFileSync(out, 'utf8')), [tricky]);
      assert.deepStrictEqual(fs.readdirSync(dir), ['argv.json'], 'no command was executed');
    }
    finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
