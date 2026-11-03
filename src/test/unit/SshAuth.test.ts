import assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import { auth_methods, classify_login_error, expand_local_path, ssh_agent, ssh_port } from '../../extension/utilities/SshAuth';


suite('SSH authentication options', () => {

  test('key paths: ~ and environment variables are expanded locally (bugs.md #23)', () => {
    const env = { HOME: '/home/max', USERPROFILE: 'C:\\Users\\max', KEYS: 'keys' };
    assert.strictEqual(expand_local_path('~/.ssh/id_ed25519', env, os.homedir()), path.join(os.homedir(), '.ssh', 'id_ed25519'));
    assert.strictEqual(expand_local_path('$HOME/.ssh/a', env, '/x'), '/home/max/.ssh/a');
    assert.strictEqual(expand_local_path('${HOME}/${KEYS}/a', env, '/x'), '/home/max/keys/a');
    assert.strictEqual(expand_local_path('%USERPROFILE%\\.ssh\\a', env, '/x'), 'C:\\Users\\max\\.ssh\\a');
    assert.strictEqual(expand_local_path('/abs/~/a $UNKNOWN', env, '/x'), '/abs/~/a $UNKNOWN', 'only a leading ~, unknown variables stay');
  });


  test('port', () => {
    assert.strictEqual(ssh_port(undefined), 22);
    assert.strictEqual(ssh_port(2222), 2222);
    assert.strictEqual(ssh_port('2222'), 2222);
    assert.strictEqual(ssh_port(''), 22);
    assert.strictEqual(ssh_port(70000), 22);
    assert.strictEqual(ssh_port(22.5), 22);
  });


  test('agent: Pageant on Windows, SSH_AUTH_SOCK elsewhere, only if enabled', () => {
    assert.strictEqual(ssh_agent(true, 'linux', { SSH_AUTH_SOCK: '/run/agent.sock' }), '/run/agent.sock');
    assert.strictEqual(ssh_agent(true, 'linux', {}), undefined);
    assert.strictEqual(ssh_agent(true, 'win32', {}), 'pageant');
    assert.strictEqual(ssh_agent('true', 'darwin', { SSH_AUTH_SOCK: '/a' }), '/a');
    assert.strictEqual(ssh_agent(false, 'linux', { SSH_AUTH_SOCK: '/a' }), undefined);
    assert.strictEqual(ssh_agent(undefined, 'win32', {}), undefined);
  });


  test('authentication order: agent, key, password', () => {
    assert.deepStrictEqual(auth_methods({ agent: '/a', private_key: true, password: true }), ['none', 'agent', 'publickey', 'password']);
    assert.deepStrictEqual(auth_methods({ password: true }), ['none', 'password']);
    assert.deepStrictEqual(auth_methods({ private_key: true }), ['none', 'publickey']);
  });


  test('login errors', () => {
    assert.deepStrictEqual(classify_login_error(new Error('Cannot parse privateKey: Encrypted private OpenSSH key detected, but no passphrase given')), { kind: 'passphrase-missing' });
    assert.deepStrictEqual(classify_login_error(new Error('Cannot parse privateKey: Malformed OpenSSH private key. Bad passphrase?')), { kind: 'passphrase-wrong' });
    assert.deepStrictEqual(classify_login_error(Object.assign(new Error('All configured authentication methods failed'), { level: 'client-authentication' })), { kind: 'authentication' });
    assert.deepStrictEqual(classify_login_error(Object.assign(new Error('connect ECONNREFUSED 1.2.3.4:22'), { code: 'ECONNREFUSED' })), { kind: 'unreachable', code: 'ECONNREFUSED' });
    assert.deepStrictEqual(classify_login_error(Object.assign(new Error('Timed out while waiting for handshake'), { level: 'client-timeout' })), { kind: 'unreachable', code: 'ETIMEDOUT' });
    assert.deepStrictEqual(classify_login_error(new Error('something else')), { kind: 'other' });
  });
});
