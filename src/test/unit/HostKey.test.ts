import assert from 'assert';
import { check_known_hosts, decide, fingerprint, key_algorithm, known_hosts_name } from '../../extension/utilities/HostKey';


// Generated with ssh-keygen -t ed25519; fingerprint from `ssh-keygen -lf`
const KEY_1 = Buffer.from('AAAAC3NzaC1lZDI1NTE5AAAAIOp9qDOrXmsElM8aprk7Otak2OLciTi7vda2Hhg8Nr4r', 'base64');
const KEY_1_FINGERPRINT = 'SHA256:lGMfqRi8Utu6APgKbCNSOA6cTkpLwh4Mrgtn9EQBCFI';
const KEY_2 = Buffer.from('AAAAC3NzaC1lZDI1NTE5AAAAINXSvTvbZomLvKSnPjG9i58W8ZmqT59Kor4UYqhpt7Ri', 'base64');
// `ssh-keygen -H` of "ibmi.example.com <KEY_1>"
const HASHED_ENTRY = '|1|kvNUHKT4+orCNdacuM1t85P0+5k=|yoU0QYjtgi64L8ryrpCijES2ixA= ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOp9qDOrXmsElM8aprk7Otak2OLciTi7vda2Hhg8Nr4r';


suite('SSH host keys', () => {

  test('fingerprint and algorithm match ssh-keygen', () => {
    assert.strictEqual(fingerprint(KEY_1), KEY_1_FINGERPRINT);
    assert.strictEqual(key_algorithm(KEY_1), 'ssh-ed25519');
    assert.strictEqual(key_algorithm(Buffer.from([0, 0, 0, 200, 1])), 'unknown');
  });


  test('decision: unknown, trusted, mismatch', () => {
    assert.strictEqual(decide(undefined, KEY_1_FINGERPRINT), 'unknown');
    assert.strictEqual(decide(KEY_1_FINGERPRINT, KEY_1_FINGERPRINT), 'trusted');
    assert.strictEqual(decide(fingerprint(KEY_2), KEY_1_FINGERPRINT), 'mismatch');
  });


  test('known_hosts: plain entry with several names, comments and markers', () => {
    const content = [
      '# comment',
      '@cert-authority *.example.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINXSvTvbZomLvKSnPjG9i58W8ZmqT59Kor4UYqhpt7Ri',
      `other,IBMI.example.com,10.0.0.1 ssh-ed25519 ${KEY_1.toString('base64')} root@ibmi`,
    ].join('\n');
    assert.strictEqual(check_known_hosts(content, 'ibmi.example.com', 22, KEY_1), 'trusted');
    assert.strictEqual(check_known_hosts(content, '10.0.0.1', 22, KEY_1), 'trusted');
    assert.strictEqual(check_known_hosts(content, 'ibmi.example.com', 22, KEY_2), 'mismatch');
    assert.strictEqual(check_known_hosts(content, 'unknown.example.com', 22, KEY_2), 'unknown', 'marker lines are ignored');
  });


  test('known_hosts: hashed entry', () => {
    assert.strictEqual(check_known_hosts(HASHED_ENTRY, 'ibmi.example.com', 22, KEY_1), 'trusted');
    assert.strictEqual(check_known_hosts(HASHED_ENTRY, 'ibmi.example.com', 22, KEY_2), 'mismatch');
    assert.strictEqual(check_known_hosts(HASHED_ENTRY, 'other.example.com', 22, KEY_1), 'unknown');
  });


  test('known_hosts: non-standard port and other algorithms', () => {
    assert.strictEqual(known_hosts_name('ibmi', 2222), '[ibmi]:2222');
    const content = `[ibmi]:2222 ssh-ed25519 ${KEY_1.toString('base64')}\nibmi ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ`;
    assert.strictEqual(check_known_hosts(content, 'ibmi', 2222, KEY_1), 'trusted');
    assert.strictEqual(check_known_hosts(content, 'ibmi', 22, KEY_1), 'unknown', 'only an RSA key is known for port 22');
  });
});
