import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { map_location, parse_evfevent } from '../../extension/source/evfevent';


const fixture = (name: string) => fs.readFileSync(path.resolve(__dirname, '../../../test-resources/evfevent', name), 'utf8');


suite('EVFEVENT compile messages', () => {

  test('messages of the main source and of nested copybooks keep their own file and position', () => {
    const messages = parse_evfevent(fixture('NESTED_COPYBOOK.PGM.evfevent'));
    const in_file = (suffix: string) => messages.filter(m => m.location.endsWith(suffix));

    assert.strictEqual(messages.length, 12);
    assert.deepStrictEqual(in_file('qprotsrc/constLeve2.rpgle').map(m => m.start_line), [4, 4, 3]);
    assert.deepStrictEqual(in_file('qprotsrc/constants.rpgle').map(m => [m.start_line, m.msgid]), [[3, 'RNF7031'], [4, 'RNF7031']]);

    const first = in_file('qrpglesrc/hello.rpgle')[0];
    assert.deepStrictEqual([first.start_line, first.end_line, first.token_start, first.token_end, first.severity], [6, 6, 1, 5, 20]);
    assert.ok(messages.some(m => m.start_line === 0 && m.msgid === 'RNS9308'), 'message without position');
  });


  test('trailing blanks of fixed-length records are ignored', () => {
    const padded = fixture('NESTED_COPYBOOK.PGM.evfevent').split('\n').map(line => line.padEnd(300)).join('\n');
    assert.ok(parse_evfevent(padded).every(m => !m.location.endsWith(' ')));
  });


  test('IFS locations map to workspace files by their longest existing suffix; QSYS members to nothing', () => {
    const files = new Set(['/ws/src/display/qrpglesrc/hello.rpgle', '/ws/src/display/qprotsrc/constLeve2.rpgle']);
    const exists = (file: string) => files.has(file);

    assert.strictEqual(map_location('/home/ANGELORPA/builds/fix1200/display/qrpglesrc/hello.rpgle', '/ws/src', exists, path.posix), '/ws/src/display/qrpglesrc/hello.rpgle');
    assert.strictEqual(map_location('/home/ANGELORPA/builds/fix1200/display/qprotsrc/constLeve2.rpgle', '/ws/src', exists, path.posix), '/ws/src/display/qprotsrc/constLeve2.rpgle');
    assert.strictEqual(map_location('BARRY/QRPGLESRC(VSCODE)', '/ws/src', exists, path.posix), undefined);
    assert.strictEqual(map_location('hello.rpgle', '/ws/src', () => true, path.posix), undefined, 'a bare file name is too ambiguous');
  });
});
