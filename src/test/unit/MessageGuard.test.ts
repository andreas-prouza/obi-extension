import assert from 'assert';
import * as path from 'path';
import { inside, is_json_value, is_number, is_plain_object, is_string, one_of, optional, parse_message } from '../../shared/messages/MessageGuard';


suite('Webview message validation', () => {

  test('plain objects: prototype keys are rejected at any depth', () => {
    assert.strictEqual(is_plain_object({ a: { b: [1, 'x', null] } }), true);
    assert.strictEqual(is_plain_object(JSON.parse('{"__proto__":{"x":1}}')), false);
    assert.strictEqual(is_plain_object(JSON.parse('{"a":{"constructor":{"prototype":{}}}}')), false);
    assert.strictEqual(is_plain_object(JSON.parse('{"a":[{"prototype":1}]}')), false);
    assert.strictEqual(is_plain_object([]), false);
    assert.strictEqual(is_plain_object(new Date()), false);
    assert.strictEqual(is_json_value(Number.NaN), false);
  });


  test('paths must stay inside the root', () => {
    assert.strictEqual(inside('/ws/src', '../../etc/passwd', path.posix), undefined);
    assert.strictEqual(inside('/ws/src', '/etc/passwd', path.posix), undefined);
    assert.strictEqual(inside('/ws/src', 'lib/../..', path.posix), undefined);
    assert.strictEqual(inside('/ws/src', '', path.posix), undefined);
    assert.strictEqual(inside('/ws', '.obi/etc/app-config.toml', path.posix), '/ws/.obi/etc/app-config.toml');
    assert.strictEqual(inside('C:\\ws', '..\\x', path.win32), undefined);
    assert.strictEqual(inside('C:\\ws', 'D:\\x', path.win32), undefined);
  });


  test('parse_message: known command with valid fields is returned typed', () => {
    const shapes = {
      open_file: { source: is_string },
      show_log: { type: one_of('joblog', 'stdout'), cmd_index: is_number, note: optional(is_string) },
    };
    const warnings: string[] = [];
    const warn = (text: string) => warnings.push(text);

    const message = parse_message('test', { command: 'show_log', type: 'joblog', cmd_index: 2 }, shapes, warn);
    assert.ok(message && message.command === 'show_log' && message.cmd_index === 2);

    assert.strictEqual(parse_message('test', { command: 'show_log', type: 'other', cmd_index: 2 }, shapes, warn), undefined);
    assert.strictEqual(parse_message('test', { command: 'open_file', source: 5 }, shapes, warn), undefined);
    assert.strictEqual(parse_message('test', { command: 'file_content', file: '/etc/passwd' }, shapes, warn), undefined);
    assert.strictEqual(parse_message('test', { command: 'toString' }, shapes, warn), undefined, 'inherited names are not commands');
    assert.strictEqual(parse_message('test', 'open_file', shapes, warn), undefined);
    assert.strictEqual(warnings.length, 5);
  });
});
