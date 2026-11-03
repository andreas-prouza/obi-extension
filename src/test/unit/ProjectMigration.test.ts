import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Constants } from '../../shared/Constants';
import { insert_general_keys, migrate_project, read_schema_version, replace_with_shipped } from '../../extension/obi/ProjectMigration';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const toml = require('smol-toml');

const MEDIA = path.join(Constants.EXTENSION_ROOT, 'obi-media');


/** Temporary project: copy of the shipped template without obi-project.json (= a project from an older version). */
function legacy_project(): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'obi-migration-'));
  fs.cpSync(MEDIA, ws, { recursive: true });
  fs.rmSync(path.join(ws, Constants.OBI_PROJECT_FILE));
  return ws;
}


suite('ProjectMigration', () => {

  const created: string[] = [];
  const project = () => { const ws = legacy_project(); created.push(ws); return ws; };
  teardown(() => created.splice(0).forEach(ws => fs.rmSync(ws, { recursive: true, force: true })));


  test('insert_general_keys inserts after the [general] header and keeps comments', () => {
    const text = '[connection]\n#remote-host = "x"\n\n[general]\n# keep me\nsource-dir = "src"\n';
    const result = insert_general_keys(text, { 'source-list': '.obi/etc/source-list.json' });
    assert.strictEqual(result, '[connection]\n#remote-host = "x"\n\n[general]\nsource-list = ".obi/etc/source-list.json"\n# keep me\nsource-dir = "src"\n');
    assert.strictEqual(toml.parse(result).general['source-list'], '.obi/etc/source-list.json');
  });


  test('insert_general_keys adds the table if missing, keeps CRLF', () => {
    assert.strictEqual(insert_general_keys('[connection]\r\nx = 1\r\n', { a: 'b' }), '[connection]\r\nx = 1\r\n\r\n[general]\r\na = "b"\r\n');
  });


  test('fresh clone of a project with all settings: app-config.toml stays byte-identical', () => {
    const ws = project();
    const config_file = path.join(ws, Constants.OBI_APP_CONFIG_FILE);
    const before = fs.readFileSync(config_file, 'utf8');

    const result = migrate_project(ws, MEDIA);

    assert.strictEqual(fs.readFileSync(config_file, 'utf8'), before);
    assert.deepStrictEqual(result.changed_files, [Constants.OBI_PROJECT_FILE]);
    assert.strictEqual(read_schema_version(ws), Constants.OBI_PROJECT_SCHEMA_VERSION);
  });


  test('missing setting is added; comments and existing values are kept', () => {
    const ws = project();
    const config_file = path.join(ws, Constants.OBI_APP_CONFIG_FILE);
    const original = fs.readFileSync(config_file, 'utf8');
    fs.writeFileSync(config_file, original.replace(/^source-list\s*=.*\n/m, ''));

    const result = migrate_project(ws, MEDIA);
    const migrated = fs.readFileSync(config_file, 'utf8');

    assert.ok(result.changed_files.includes(Constants.OBI_APP_CONFIG_FILE));
    assert.ok(migrated.includes('#remote-host'), 'comments are kept');
    const general = toml.parse(migrated).general;
    assert.strictEqual(general['source-list'], Constants.SOURCE_LIST);
    assert.strictEqual(general['compiled-object-list'], toml.parse(original).general['compiled-object-list'], 'existing values unchanged');
  });


  test('customized Python config is reported, not overwritten', () => {
    const ws = project();
    const constants_py = path.join(ws, '.obi/etc/constants.py');
    fs.appendFileSync(constants_py, '\n# customized\n');

    const result = migrate_project(ws, MEDIA);

    assert.deepStrictEqual(result.differing_files, ['.obi/etc/constants.py']);
    assert.ok(fs.readFileSync(constants_py, 'utf8').includes('# customized'));
  });


  test('replace_with_shipped keeps a backup', () => {
    const ws = project();
    fs.appendFileSync(path.join(ws, '.obi/etc/constants.py'), '\n# customized\n');
    const backup = replace_with_shipped(ws, MEDIA, '.obi/etc/constants.py', new Date(2026, 9, 22, 10, 15, 0));

    assert.strictEqual(backup, '.obi/etc/constants.py.bak-20261022-101500');
    assert.ok(fs.readFileSync(path.join(ws, backup), 'utf8').includes('# customized'));
    assert.ok(fs.readFileSync(path.join(ws, '.obi/etc/constants.py')).equals(fs.readFileSync(path.join(MEDIA, '.obi/etc/constants.py'))));
  });


  test('project at the current schema version: nothing is touched', () => {
    const ws = project();
    migrate_project(ws, MEDIA);
    const result = migrate_project(ws, MEDIA);
    assert.deepStrictEqual(result.changed_files, []);
    assert.strictEqual(result.from_version, result.to_version);
  });


  test('unreadable app-config.toml is left alone', () => {
    const ws = project();
    const config_file = path.join(ws, Constants.OBI_APP_CONFIG_FILE);
    fs.writeFileSync(config_file, '[general\nbroken');
    migrate_project(ws, MEDIA);
    assert.strictEqual(fs.readFileSync(config_file, 'utf8'), '[general\nbroken');
  });
});
