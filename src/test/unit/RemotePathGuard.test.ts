import assert from 'assert';
import { check_remote_delete_target, is_home_like_remote_base_dir } from '../../extension/utilities/RemotePathGuard';


const HOME = '/home/user';


suite('RemotePathGuard', () => {

  test('rejects system directories, the home directory and its parents', () => {
    for (const target of ['/', '/home', '/home/user', '/home/user/', '/tmp', '/QOpenSys', '/qopensys/pkgs', '/QSYS.LIB/X.LIB', '/qsys.lib/x.lib', '/QIBM/ProdData', '/apps', '/home/USER'])
      assert.ok(check_remote_delete_target(target, HOME) !== undefined, target);
  });


  test('accepts project folders below home or other base folders', () => {
    for (const target of ['/home/user/proj', '/apps/proj', '/home/user/a/b', '/home/other/proj'])
      assert.strictEqual(check_remote_delete_target(target, HOME), undefined, target);
  });


  test('rejects relative paths and paths with ..', () => {
    assert.ok(check_remote_delete_target('proj', HOME));
    assert.ok(check_remote_delete_target('/home/user/proj/..', HOME));
  });


  test('home directory outside /home is protected as well', () => {
    assert.ok(check_remote_delete_target('/users/max', '/users/max'));
    assert.ok(check_remote_delete_target('/users', '/users/max'));
    assert.strictEqual(check_remote_delete_target('/users/max/proj', '/users/max'), undefined);
  });


  test('is_home_like_remote_base_dir', () => {
    for (const value of ['~', '~/', '$HOME', '/home', '/home/$USER', '.', './'])
      assert.ok(is_home_like_remote_base_dir(value), value);
    for (const value of ['~/proj', '${workspaceFolderBasename}', './${workspaceFolderBasename}', '/home/$USER/proj', '', '/apps/proj'])
      assert.ok(!is_home_like_remote_base_dir(value), value);
  });
});
