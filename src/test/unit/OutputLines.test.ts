import assert from 'assert';
import { LineSplitter, format_elapsed, parse_obi_pid, truncate } from '../../extension/utilities/OutputLines';


suite('Streamed output', () => {

  test('chunks become lines; partial lines wait for the next chunk', () => {
    const splitter = new LineSplitter();
    assert.deepStrictEqual(splitter.push('a\nb'), ['a']);
    assert.deepStrictEqual(splitter.push('c\r\n'), ['bc']);
    assert.deepStrictEqual(splitter.push('last'), []);
    assert.deepStrictEqual(splitter.flush(), ['last']);
    assert.deepStrictEqual(splitter.flush(), []);
  });


  test('pid of the remote build', () => {
    assert.strictEqual(parse_obi_pid('OBI_PID:12345'), 12345);
    assert.strictEqual(parse_obi_pid('OBI_PID:12345; rm -rf ~'), undefined);
    assert.strictEqual(parse_obi_pid('compile ok'), undefined);
  });


  test('elapsed time and truncation', () => {
    assert.strictEqual(format_elapsed(65_400), '1:05');
    assert.strictEqual(truncate('abcdef', 4), 'abc…');
    assert.strictEqual(truncate('abc', 4), 'abc');
  });
});
