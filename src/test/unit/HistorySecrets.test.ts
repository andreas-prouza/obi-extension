import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { config_without_secrets } from '../../shared/Redact';
import { remove_secrets_from_history } from '../../extension/obi/HistorySecrets';


suite('Secrets in the build history', () => {

  test('config copies have no secret* variables, also in profiles; the original is unchanged', () => {
    const config = { global: { variables: { secretPwd: 'x', SECRET_TOKEN: 'y', TARGET: 'LIB' } }, profiles: { prod: { global: { variables: { secret_a: 'z', B: 'b' } } } } };
    const cleaned = config_without_secrets(config);
    assert.deepStrictEqual(cleaned.global.variables, { TARGET: 'LIB' });
    assert.deepStrictEqual(cleaned.profiles.prod.global.variables, { B: 'b' });
    assert.strictEqual(config.global.variables.secretPwd, 'x');
  });


  test('existing history entries are cleaned once; others stay as they are', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'obi-history-'));
    try {
      const write = (build: string, content: unknown) => {
        fs.mkdirSync(path.join(root, build));
        fs.writeFileSync(path.join(root, build, 'compile-list.json'), JSON.stringify(content));
      };
      write('a', { compiles: [], config: { global: { variables: { secretPwd: 'leak', X: '1' } } } });
      write('b', { compiles: [], config: { global: { variables: { X: '1' } } } });
      write('c', { compiles: [] });
      fs.mkdirSync(path.join(root, 'd'));   // no compile list

      assert.strictEqual(remove_secrets_from_history(root), 1);
      assert.ok(!fs.readFileSync(path.join(root, 'a', 'compile-list.json'), 'utf8').includes('leak'));
      assert.strictEqual(remove_secrets_from_history(root), 0);
      assert.strictEqual(remove_secrets_from_history(path.join(root, 'missing')), 0);
    }
    finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
