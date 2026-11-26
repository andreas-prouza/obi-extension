import assert from 'assert';
import { NEW_PROFILE_PATTERN, is_safe_profile_alias, never_save_key, ssh_secret_key, validate_new_profile_name } from '../../shared/Profile';


suite('Profile names', () => {

  test('new profile names: letters, digits, - and _ only', () => {
    for (const name of ['prod', 'dev-1', 'my_profile', 'A', 'x'.repeat(64)])
      assert.ok(NEW_PROFILE_PATTERN.test(name), name);
    for (const name of ['../x', 'a/b', 'a\\b', 'a b', '.hidden', '-dash', '', 'x'.repeat(65), 'prod.toml'])
      assert.ok(!NEW_PROFILE_PATTERN.test(name), name);
  });


  test('validate_new_profile_name reports invalid and existing names', () => {
    assert.strictEqual(validate_new_profile_name('prod', ['dev']), undefined);
    assert.match(validate_new_profile_name('prod', ['prod']) ?? '', /already exists/);
    assert.match(validate_new_profile_name('../evil', []) ?? '', /letters, digits/);
  });


  test('existing aliases with other characters stay usable, path traversal does not', () => {
    for (const alias of ['old name', 'prod.v2', 'äöü'])
      assert.ok(is_safe_profile_alias(alias), alias);
    for (const alias of ['../x', 'a/b', 'a\\b', '..', 'a\0b'])
      assert.ok(!is_safe_profile_alias(alias), JSON.stringify(alias));
  });


  test('keys of the stored SSH secrets: the default profile is "default"', () => {
    assert.strictEqual(ssh_secret_key('', 'ibmi', 'usr'), 'obi|default|ibmi|usr');
    assert.strictEqual(ssh_secret_key('dev', 'ibmi', 'usr'), 'obi|dev|ibmi|usr');
    assert.strictEqual(ssh_secret_key('dev', undefined, undefined), 'obi|dev||');
    assert.strictEqual(never_save_key('', 'password'), 'obi.ssh.never-save-password|default');
    assert.strictEqual(never_save_key('dev', 'passphrase'), 'obi.ssh.never-save-passphrase|dev');
  });
});
