import assert from 'assert';
import { escape_cl_text, object_name, path_stem, path_suffixes, source_attr_and_type, source_description, source_type } from '../../shared/SourceName';


// Expected values from the backend (Python pathlib and properties.get_source_properties)
suite('Source name parts (as in the OBI backend)', () => {

  test('type: the last two suffixes, also for one suffix and dots in names', () => {
    assert.strictEqual(source_type('lib/qrpglesrc/x.rpgle.pgm'), 'rpgle.pgm');
    assert.strictEqual(source_type('lib/qrpglesrc/a.b.rpgle.pgm'), 'rpgle.pgm');
    assert.strictEqual(source_type('lib/qrpglesrc/x.pgm'), 'pgm', 'not the whole path');
    assert.strictEqual(source_type('my.lib/q/x.sqlrpgle.srvpgm'), 'sqlrpgle.srvpgm');
    assert.deepStrictEqual(path_suffixes('lib/q/x.rpgle.pgm'), ['.rpgle', '.pgm']);
    assert.deepStrictEqual(path_suffixes('lib/q/x.'), []);
  });

  test('OBJ_NAME: the file name without the last two suffixes', () => {
    assert.strictEqual(object_name('lib/qrpglesrc/order.rpgle.pgm'), 'order');
    assert.strictEqual(object_name('lib/qrpglesrc/a.b.rpgle.pgm'), 'a.b');
    assert.strictEqual(object_name('lib/qrpglesrc/x.pgm'), 'x');
    assert.strictEqual(path_stem('.hidden'), '.hidden');
  });

  test('SRC_ATTR and SRC_TYPE in lower case', () => {
    assert.deepStrictEqual(source_attr_and_type('LIB/QRPGLESRC/X.RPGLE.PGM'), { attr: 'rpgle', type: 'pgm' });
    assert.deepStrictEqual(source_attr_and_type('lib/q/a.b.Dspf.FILE'), { attr: 'dspf', type: 'file' });
  });

  test('SOURCE_DESCRIPTION: trimmed, at most 50 characters (not UTF-16 units)', () => {
    assert.strictEqual(source_description({ description: '  Order entry  ' }), 'Order entry');
    assert.strictEqual(source_description({ description: 'x'.repeat(60) }), 'x'.repeat(50));
    assert.strictEqual(source_description({ description: 'a'.repeat(49) + ' b' }), 'a'.repeat(49), 'trimmed again after cutting');
    assert.strictEqual(source_description({ description: '😀'.repeat(52) }), '😀'.repeat(50));
    assert.strictEqual(source_description({}), '');
    assert.strictEqual(source_description(undefined), '');
    assert.strictEqual(source_description('text'), '', 'not a table');
  });

  test('OBJ_TEXT: escaped for TEXT(\'...\') inside cl -v "..."', () => {
    assert.strictEqual(escape_cl_text("it's"), "it''s");
    assert.strictEqual(escape_cl_text('a "b" $c `d` \\e'), 'a \\"b\\" \\$c \\`d\\` \\\\e');
  });
});
