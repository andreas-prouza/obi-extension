import assert from 'assert';
import { override_dict } from '../../shared/DictTools';


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
