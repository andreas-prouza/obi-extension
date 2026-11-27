import assert from 'assert';
import { parse_dict_field, parse_list_field } from '../../shared/FormFields';


suite('Multi-line fields of the configuration page', () => {

  test('a list: one entry per line, empty lines skipped (also the first one)', () => {
    assert.deepStrictEqual(parse_list_field('\nglobal.cmds.skip\r\n\nglobal.cmds.skip2\n'), ['global.cmds.skip', 'global.cmds.skip2']);
    assert.deepStrictEqual(parse_list_field(''), []);
    assert.deepStrictEqual(parse_list_field('a "quoted" \\\\ value'), ['a "quoted" \\\\ value']);
  });

  test('a table: key = value, the value may contain "=", broken lines skipped', () => {
    assert.deepStrictEqual(parse_dict_field('\n aaobj = AA \nnot a pair\n= no key\naadta=AA\nexpr = a=b'), { aaobj: 'AA', aadta: 'AA', expr: 'a=b' });
    assert.deepStrictEqual(parse_dict_field(''), {});
  });
});
