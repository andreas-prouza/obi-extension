import assert from 'assert';
import { strip_cmd_logs } from '../../shared/CompileListLogs';


suite('Logs in the compile list', () => {

  test('strip_cmd_logs removes stdout, stderr and joblog of every command, nothing else; the list is not changed', () => {
    const compile_list = {
      timestamp: 't',
      config: { general: { 'build-output-dir': 'x' } },
      custom_data: { ticket: 'ABC-1' },
      compiles: [
        { level: 1, sources: [
          { source: 'a', cmds: [
            { cmd: 'c1', status: 'success', updated: 'u', 'exit-code': 0, joblog: 'J', stdout: 'O', stderr: 'E' },
            { cmd: 'c2', status: 'failed', joblog: null, stdout: '' }
          ] },
          { source: 'b', cmds: [] }
        ] },
        { level: 2 },
        { level: 3, sources: [{ source: 'c' }, 'x', { source: 'd', cmds: ['y', null] }] }
      ],
    };
    const before = JSON.stringify(compile_list);

    assert.deepStrictEqual(strip_cmd_logs(compile_list), {
      timestamp: 't',
      config: { general: { 'build-output-dir': 'x' } },
      custom_data: { ticket: 'ABC-1' },
      compiles: [
        { level: 1, sources: [
          { source: 'a', cmds: [
            { cmd: 'c1', status: 'success', updated: 'u', 'exit-code': 0 },
            { cmd: 'c2', status: 'failed' }
          ] },
          { source: 'b', cmds: [] }
        ] },
        { level: 2 },
        { level: 3, sources: [{ source: 'c' }, 'x', { source: 'd', cmds: ['y', null] }] }
      ],
    });
    assert.strictEqual(JSON.stringify(compile_list), before);
  });


  test('strip_cmd_logs: a list without compiles stays as it is', () => {
    assert.deepStrictEqual(strip_cmd_logs({}), {});
    assert.deepStrictEqual(strip_cmd_logs({ compiles: 'x' }), { compiles: 'x' });
  });
});
