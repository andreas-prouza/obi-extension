import assert from 'assert';
import { missing_gitignore_entries, with_gitignore_entries } from '../../extension/obi/ProjectGitignore';


suite('Project .gitignore', () => {

  test('new project: the whole block', () => {
    const content = with_gitignore_entries('');
    assert.ok(content.startsWith('# OBI: personal configuration\n.obi/etc/.user-app-config*.toml\n'));
    assert.ok(content.includes('.obi/build-history/\n'));
    assert.deepStrictEqual(missing_gitignore_entries(content), []);
  });


  test('existing .gitignore: only missing entries are appended, nothing is changed', () => {
    const existing = 'node_modules/\n.obi/log/\n.obi/tmp/\n.obi/cache/\n.obi/build-output/\n.obi/build-history/\n.obi/etc/source-list-*.json';
    const content = with_gitignore_entries(existing);
    assert.ok(content.startsWith(existing + '\n\n'));
    assert.strictEqual(content.split('.obi/log/').length, 2, 'not added twice');
    assert.ok(!content.includes('# OBI: generated'), 'no empty section');
    assert.deepStrictEqual(missing_gitignore_entries(content), []);
  });


  test('complete .gitignore stays as it is', () => {
    const complete = with_gitignore_entries('');
    assert.strictEqual(with_gitignore_entries(complete), complete);
  });
});
