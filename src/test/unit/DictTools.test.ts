import assert from 'assert';
import { delete_paths, is_set, override_dict, set_paths } from '../../shared/DictTools';


suite('override_dict', () => {

  test('user values override project values, nested tables are merged', () => {
    const project = { connection: { 'remote-host': 'h', port: 22 }, general: { a: 1 } };
    const user = { connection: { 'ssh-user': 'MAX', port: 2222 } };
    assert.deepStrictEqual(override_dict(user, project), { connection: { 'remote-host': 'h', port: 2222, 'ssh-user': 'MAX' }, general: { a: 1 } });
  });


  test('empty values do not override anything', () => {
    assert.deepStrictEqual(override_dict({ a: '', b: [], c: undefined, d: null, e: 0, f: false }, { a: 'x', b: ['y'], c: 'z', d: 'w' }), { a: 'x', b: ['y'], c: 'z', d: 'w', e: 0, f: false });
  });


  test('lists and dates replace the value; a missing target starts empty', () => {
    const date = new Date(0);
    assert.deepStrictEqual(override_dict({ list: ['b'], date }, { list: ['a'], date: new Date(1) }), { list: ['b'], date });
    assert.deepStrictEqual(override_dict({ a: 1 }, undefined), { a: 1 });
  });
});


suite('set_paths / delete_paths (user config overrides)', () => {

  test('set_paths lists the values that override, and tables containing one', () => {
    const user = {
      connection: { 'ssh-agent': false, 'ssh-user': 'MAX', 'ssh-key': undefined, 'remote-host': '' },
      general: { 'supported-object-types': [], 'max-threads': 0 },
      global: { settings: { general: { TARGET_LIB_MAPPING: { a: 'b' }, LIBL: ['QGPL'] }, language: {} } }
    };
    assert.deepStrictEqual(set_paths(user).sort(), [
      'connection', 'connection|ssh-agent', 'connection|ssh-user',
      'general', 'general|max-threads',
      'global', 'global|settings', 'global|settings|general', 'global|settings|general|LIBL',
      'global|settings|general|TARGET_LIB_MAPPING', 'global|settings|general|TARGET_LIB_MAPPING|a'
    ].sort());
    assert.deepStrictEqual(set_paths(undefined), []);
    assert.deepStrictEqual(set_paths({ d: new Date(0) }), ['d']);
  });


  test('delete_paths removes the values; tables stay, missing paths are ignored', () => {
    const user: Record<string, unknown> = {
      connection: { 'ssh-agent': false, 'ssh-user': 'MAX' },
      global: { settings: { general: { USE_ESP: false, TARGET_LIB_MAPPING: { a: 'b' } } } }
    };
    delete_paths(user, ['connection|ssh-agent', 'global|settings|general|USE_ESP', 'global|settings|general|TARGET_LIB_MAPPING', 'general|source-dir', 'connection|ssh-user|x']);
    assert.deepStrictEqual(user, { connection: { 'ssh-user': 'MAX' }, global: { settings: { general: {} } } });
  });


  test('delete_paths does not touch prototypes', () => {
    const user: Record<string, unknown> = { connection: { a: 1 } };
    delete_paths(user, ['__proto__|toString', 'connection|constructor', 'constructor|prototype|x', 'toString|x']);
    assert.deepStrictEqual(user, { connection: { a: 1 } });
    assert.strictEqual(typeof ({}).toString, 'function');
  });


  test('is_set: same rule as override_dict', () => {
    assert.deepStrictEqual([undefined, null, '', [], false, 0, 'x', ['a'], {}].map(is_set), [false, false, false, false, true, true, true, true, true]);
  });
});
