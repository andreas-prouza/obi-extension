import assert from 'assert';
import * as path from 'path';
import { is_transfer_excluded } from '../../extension/utilities/TransferExcludes';


const WS = '/ws';
const excluded = (root: string, item: string) => is_transfer_excluded(WS, path.posix.join(WS, root), path.posix.join(WS, item), path.posix);


suite('Transfer excludes', () => {

  test('whole project: personal and generated files are not uploaded', () => {
    for (const item of ['.obi/build-history/2026-10-22T12.05.01.123Z/compile-list.json', '.obi/log/combined.log',
                        '.obi/etc/.user-app-config.toml', '.obi/etc/.user-app-config-prod.toml', '.obi/etc/workspace-settings.json',
                        '.git/HEAD', '.obi/tmp/changed-object-list.json', 'lib/x.pyc', '.obi/etc/app-config.toml.123.456.tmp'])
      assert.ok(excluded('', item), item);
  });


  test('whole project: config, Python config, sources and build output are uploaded', () => {
    for (const item of ['.obi/etc/app-config.toml', '.obi/etc/constants.py', '.obi/etc/source-config.toml',
                        'src/lib/qrpglesrc/a.rpgle.pgm', '.obi/build-output/compile-list.json'])
      assert.ok(!excluded('', item), item);
  });


  test('minimum transfer of .obi/etc skips personal files', () => {
    assert.ok(excluded('.obi/etc', '.obi/etc/.user-app-config-prod.toml'));
    assert.ok(excluded('.obi/etc', '.obi/etc/workspace-settings.json'));
    assert.ok(!excluded('.obi/etc', '.obi/etc/app-config.toml'));
  });


  test('an explicitly transferred excluded folder (.obi/tmp for the build) is uploaded', () => {
    assert.ok(!excluded('.obi/tmp', '.obi/tmp/changed-object-list.json'));
    assert.ok(excluded('.obi/tmp', '.obi/tmp/x.pyc'), 'other patterns still apply');
  });


  test('Windows paths', () => {
    assert.ok(is_transfer_excluded('C:\\ws', 'C:\\ws', 'C:\\ws\\.obi\\log\\combined.log', path.win32));
    assert.ok(!is_transfer_excluded('C:\\ws', 'C:\\ws', 'C:\\ws\\src\\lib\\qrpglesrc\\a.rpgle.pgm', path.win32));
  });
});
