import assert from 'assert';
import { getNonce } from '../../extension/utilities/getNonce';


suite('CSP nonce', () => {

  test('128 random bits, base64, different on every call', () => {
    const a = getNonce();
    assert.match(a, /^[A-Za-z0-9+/]{22}==$/);
    assert.notStrictEqual(a, getNonce());
  });
});
