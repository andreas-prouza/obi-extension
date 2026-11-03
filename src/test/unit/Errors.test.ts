import assert from 'assert';
import { ConfigFileError, json_error_position } from '../../shared/Errors';


suite('Errors', () => {

  test('json_error_position from "line/column" messages', () => {
    assert.deepStrictEqual(json_error_position('', 'Expected property name (line 3 column 7)'), { line: 3, column: 7 });
  });


  test('json_error_position from "position" messages', () => {
    const text = '{\n  "a": 1,\n  x\n}';
    assert.deepStrictEqual(json_error_position(text, 'Unexpected token x in JSON at position 14'), { line: 3, column: 3 });
  });


  test('json_error_position of the real JSON.parse error points into the file', () => {
    const text = '{\n  "a": 1,\n  x\n}';
    let message = '';
    try { JSON.parse(text); } catch (e) { message = (e as Error).message; }
    const { line } = json_error_position(text, message);
    assert.strictEqual(line, 3, message);
  });


  test('ConfigFileError message contains file and position', () => {
    const error = new ConfigFileError('/ws/.obi/etc/source-config.toml', 12, 5, 'Invalid TOML');
    assert.strictEqual(error.message, '/ws/.obi/etc/source-config.toml (line 12, column 5): Invalid TOML');
    assert.ok(error instanceof Error);
  });
});
