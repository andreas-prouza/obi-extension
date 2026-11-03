import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import Ajv, { ValidateFunction } from 'ajv';


const ROOT = path.resolve(__dirname, '../../..');
const read_json = (file: string): unknown => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));

function schema(name: string): ValidateFunction {
  // patternErrorMessage is a VS Code keyword
  const ajv = new Ajv({ keywords: ['patternErrorMessage'] });
  return ajv.compile(read_json(`asserts/schemas/${name}.schema.json`) as object);
}

const SOURCE = 'mylib/qrpglesrc/hello.rpgle.pgm';


suite('JSON schemas', () => {

  test('the compile list of the build list golden test is valid', () => {
    const golden = read_json('test-resources/golden/compile-list.json') as { compile_list: unknown };
    const validate = schema('compile-list');
    assert.ok(validate(golden.compile_list), JSON.stringify(validate.errors));
  });


  test('a compile list after a build (Python OBI) is valid; a broken one is not', () => {
    const validate = schema('compile-list');
    const after_build = {
      timestamp: '2026-08-14 19:48:46.664582',
      git: { commit: 'abc' },
      compiles: [{ level: 1, sources: [{
        source: SOURCE, status: 'failed', hash: 'x', extra_key_of_a_newer_obi: true,
        cmds: [{ cmd: 'CRTBNDRPG', status: 'failed', updated: '2026-08-14T19:48:46', 'exit-code': 1, stdout: '', stderr: 'x', joblog: 'y',
          'change-history': [{ type: 'cmd-change', user: 'MAX', original: 'old', timestamp: '2026-08-14T19:48:46' }] }]
      }] }]
    };
    assert.ok(validate(after_build), JSON.stringify(validate.errors));
    assert.ok(!validate({ compiles: [{ level: 1, sources: [{ source: SOURCE }] }] }), 'cmds are mandatory');
    assert.ok(!validate({ compiles: [{ level: 1, sources: [{ source: 'hello.rpgle.pgm', cmds: [] }] }] }), 'without lib/file');
    assert.ok(!validate({}), 'compiles are mandatory');
  });


  test('the files of the project template are valid', () => {
    assert.ok(schema('dependency')(read_json('obi-media/.obi/etc/dependency.json')));
    assert.ok(schema('source-infos')(read_json('obi-media/.obi/etc/source-infos.json')));
    const validate = schema('source-filter');
    for (const file of fs.readdirSync(path.join(ROOT, 'obi-media/.obi/source-list')))
      assert.ok(validate(read_json(`obi-media/.obi/source-list/${file}`)), `${file}: ${JSON.stringify(validate.errors)}`);
  });


  test('dependencies, source infos and filters: typical mistakes are reported', () => {
    assert.ok(schema('dependency')({ [SOURCE]: ['mylib/qrpglesrc/defs.rpgle.cpy'] }));
    assert.ok(!schema('dependency')({ [SOURCE]: 'mylib/qrpglesrc/defs.rpgle.cpy' }), 'a list, not a string');
    assert.ok(!schema('dependency')({ 'hello.rpgle.pgm': [] }), 'without lib/file');
    assert.ok(schema('source-infos')({ [SOURCE]: { description: 'Hello' } }));
    assert.ok(!schema('source-infos')({ [SOURCE]: 'Hello' }), 'an object, not a string');
    assert.ok(!schema('source-filter')([{ 'source-lib': '*' }]), 'all three parts are needed');
  });


  test('every schema of package.json exists', () => {
    const manifest = read_json('package.json') as { contributes: { jsonValidation: { url: string }[] } };
    assert.strictEqual(manifest.contributes.jsonValidation.length, 4);
    for (const entry of manifest.contributes.jsonValidation)
      assert.ok(fs.existsSync(path.join(ROOT, entry.url)), entry.url);
  });
});
