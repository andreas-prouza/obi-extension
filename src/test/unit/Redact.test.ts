import assert from 'assert';
import { redact, secret_values } from '../../shared/Redact';


suite('Secrets in logs', () => {

  test('values of secret* variables are masked', () => {
    const secrets = secret_values({ secretPwd: 'abc', SECRET_TOKENS: ['tok-1', 'x'], TARGET_LIB: 'abcdef' });
    assert.strictEqual(redact('pwd=abc', secrets), 'pwd=***');
    assert.strictEqual(redact('login tok-1 to TARGET abcdef', secrets), 'login *** to TARGET ***def');
    assert.ok(!secrets.includes('x'), 'too short to mask safely');
  });


  test('a secret containing another one is masked as a whole', () => {
    const secrets = secret_values({ secret_a: 'pass', secret_b: 'password' });
    assert.strictEqual(redact('password', secrets), '***');
  });
});
