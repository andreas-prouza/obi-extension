import assert from 'assert';
import { EspConditionError, fnmatch_regex, match_conditions } from '../../shared/EspConditions';


const SOURCE = 'lib/qrpglesrc/logger.rpgle.pgm';
const PROPERTIES: Record<string, unknown> = {
  SOURCE: SOURCE,
  SOURCE_FILE_NAME: `src/${SOURCE}`,
  OBJ_NAME: 'logger',
  TARGET_LIB: 'lib',
  SRC_TYPE: 'pgm',
  CCSID: 1141,
  VERSION: 1.5,
  LIBL: ['lib', 'qgpl'],
  DEBUG: true,
};

const matches = (conditions: unknown, use_regex = false, source = SOURCE) => match_conditions(conditions, use_regex, source, PROPERTIES);


// The cases of TestConditions in ../obi-unit-tests/tests/test_extended_source_cmds.py
suite('ESP conditions (as in the OBI backend)', () => {

  test('a text is compared with the value of the variable', () => {
    assert.ok(matches({ OBJ_NAME: 'logger' }));
    assert.ok(!matches({ OBJ_NAME: 'other' }));
  });

  test('a text with a pattern', () => {
    assert.ok(matches({ OBJ_NAME: 'log*' }));
    assert.ok(!matches({ OBJ_NAME: 'x*' }));
  });

  test('a text with a regular expression: found anywhere (re.search)', () => {
    assert.ok(matches({ OBJ_NAME: '^lo.+r$' }, true));
    assert.ok(matches({ OBJ_NAME: 'gg' }, true));
    assert.ok(!matches({ OBJ_NAME: '^x' }, true));
  });

  test('a list is compared with the source name, whatever the name of the condition is', () => {
    assert.ok(matches({ SOURCE: ['other', 'lib/*'] }));
    assert.ok(!matches({ SOURCE: ['other/*'] }));
    // The project form: SOURCE_FILE_NAME starts with the source folder, the list is still compared with the source name
    assert.ok(matches({ SOURCE_FILE_NAME: ['lib/*.pgm'] }));
    assert.ok(!matches({ SOURCE_FILE_NAME: ['src/lib/*.pgm'] }));
    assert.ok(matches({ TARGET_LIB: ['lib/qrpglesrc/*'] }));
    assert.ok(!matches({ TARGET_LIB: ['lib'] }));
  });

  test('a list with regular expressions', () => {
    assert.ok(matches({ SOURCE: ['logger\\.rpgle'] }, true));
    assert.ok(!matches({ SOURCE: ['^logger'] }, true));
  });

  test('all conditions have to match', () => {
    assert.ok(matches({ OBJ_NAME: 'logger', TARGET_LIB: 'lib' }));
    assert.ok(!matches({ OBJ_NAME: 'logger', TARGET_LIB: 'other' }));
  });

  test('an unknown name does not match and is reported', () => {
    const unknown: string[] = [];
    assert.ok(!match_conditions({ UNKNOWN: 'logger' }, false, SOURCE, PROPERTIES, name => unknown.push(name)));
    assert.ok(!match_conditions({ SOURCE_FILE_NAMES: ['*'] }, false, SOURCE, PROPERTIES, name => unknown.push(name)));
    assert.deepStrictEqual(unknown, ['UNKNOWN', 'SOURCE_FILE_NAMES']);
  });

  test('without conditions every source matches', () => {
    assert.ok(matches({}));
    assert.ok(matches(undefined));
  });

  test('whole numbers are compared as text; lists, tables and true/false never match a text', () => {
    assert.ok(matches({ CCSID: '1141' }));
    assert.ok(!matches({ LIBL: 'lib' }));
    assert.ok(!matches({ DEBUG: 'true' }));
    assert.ok(!matches({ VERSION: '1.5' }), 'only whole numbers');
    assert.ok(!matches({ OBJ_NAME: 1 }), 'a condition value that is neither text nor list');
    assert.ok(!matches({ SOURCE: [1, true] }), 'list entries that are not text');
  });

  test('an invalid regular expression gives an error naming condition and pattern', () => {
    assert.throws(() => matches({ OBJ_NAME: '(' }, true), (e: unknown) => e instanceof EspConditionError && /'\(' in condition OBJ_NAME/.test(e.message));
  });
});


suite('fnmatch (Python fnmatch.translate)', () => {

  const fn = (pattern: string, value: string) => fnmatch_regex(pattern).test(value);

  test('the whole value has to match; * also matches /', () => {
    assert.ok(fn('*.pgm', 'lib/qrpglesrc/x.rpgle.pgm'));
    assert.ok(fn('all_*.pgm', 'all_lib/qrpglesrc/x.rpgle.pgm'));
    assert.ok(fn('lib/*', 'lib/a/b/c.pgm'));
    assert.ok(!fn('lib', 'lib/a.pgm'));
    assert.ok(!fn('*.pgm', 'x.pgm.file'));
  });

  test('? is one character', () => {
    assert.ok(fn('a?c', 'abc'));
    assert.ok(fn('a?c', 'a/c'));
    assert.ok(!fn('a?c', 'ac'));
  });

  test('sets, negated sets, ] as first character, unclosed [', () => {
    assert.ok(fn('[abc]x', 'bx'));
    assert.ok(!fn('[abc]x', 'dx'));
    assert.ok(fn('[!abc]x', 'dx'));
    assert.ok(!fn('[!abc]x', 'ax'));
    assert.ok(fn('[a-c]x', 'bx'));
    assert.ok(fn('[]]', ']'));
    assert.ok(fn('[!]]', 'a'));
    assert.ok(fn('[^a]', '^'), '^ is a normal character of the set');
    assert.ok(fn('a[b', 'a[b'));
    assert.ok(fn('[]', '[]'), 'no closing ] after the first one: both are literal');
    assert.ok(!fn('[z-a]', 'b'), 'a reversed range is dropped, as in Python');
    assert.ok(fn('[a-]', '-') && fn('[-a]', '-'));
  });

  test('regex characters are literal, case matters', () => {
    assert.ok(fn('a.b+(c)', 'a.b+(c)'));
    assert.ok(!fn('a.b', 'axb'));
    assert.ok(!fn('*.PGM', 'x.pgm'));
    assert.ok(fn('$x^', '$x^'));
  });

  test('newlines are matched by * (Python: re.DOTALL)', () => {
    assert.ok(fn('a*b', 'a\nb'));
  });
});
