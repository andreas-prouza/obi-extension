import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { Constants } from '../../shared/Constants';
import { LocalSourceList } from '../../extension/utilities/LocalSourceList';
import * as inventory from '../../extension/utilities/SourceInventory';
import { Workspace } from '../../extension/utilities/Workspace';
import { SourceListItem, SourceListProvider } from '../../webview/source_list/SourceListProvider';
import { reset_workspace } from './workspace_fixture';


const filter_file = (name: string) => path.join(Workspace.get_workspace(), Constants.SOURCE_FILTER_FOLDER_NAME, name);
const labels = (items: SourceListItem[]) => items.map(item => String(item.label));


suite('Source filter tree', () => {

  let provider: SourceListProvider;

  setup(async () => {
    await reset_workspace();
    fs.mkdirSync(path.join(Workspace.get_workspace(), 'src', 'prouzalib', 'qclsrc'), { recursive: true });
    fs.writeFileSync(path.join(Workspace.get_workspace(), 'src', 'prouzalib', 'qclsrc', 'start.clle.pgm'), '');
    fs.mkdirSync(path.join(Workspace.get_workspace(), 'src', 'emptylib'), { recursive: true });
    fs.writeFileSync(filter_file('CL only.json'), JSON.stringify([{ 'source-lib': '*', 'source-file': 'qclsrc', 'source-member': '*' }]));
    await LocalSourceList.load_source_list();
    provider = new SourceListProvider(Workspace.get_workspace());
  });

  teardown(() => sinon.restore());


  test('the root lists the filter files without walking the sources or evaluating filters', async () => {
    const walk = sinon.spy(inventory, 'walk_sources');
    const evaluate = sinon.spy(inventory, 'apply_source_filters');

    assert.deepStrictEqual(labels(await provider.getChildren()), ['All sources', 'CL only']);
    await provider.getChildren();
    assert.strictEqual(walk.callCount, 0);
    assert.strictEqual(evaluate.callCount, 0);
  });


  test('a filter is evaluated once until the filter file or the sources change', async () => {
    const evaluate = sinon.spy(inventory, 'apply_source_filters');
    const [all, cl_only] = await provider.getChildren();

    const libs = await provider.getChildren(cl_only);
    assert.deepStrictEqual(labels(libs), ['prouzalib']);
    const files = await provider.getChildren(libs[0]);
    assert.deepStrictEqual(labels(files), ['qclsrc']);
    const members = await provider.getChildren(files[0]);
    assert.deepStrictEqual(labels(members), ['start.clle.pgm']);
    assert.strictEqual(evaluate.callCount, 1, 'three levels, one evaluation');

    // Parents for reveal
    assert.strictEqual(provider.getParent(members[0]), files[0]);
    assert.strictEqual(provider.getParent(files[0]), libs[0]);
    assert.strictEqual(provider.getParent(libs[0]), cl_only);

    // Empty folders only with show-empty-folders ("All sources"), without an item for the missing file level
    assert.deepStrictEqual(labels(await provider.getChildren(all)), ['emptylib', 'prouzalib']);
    assert.strictEqual(evaluate.callCount, 2);

    fs.writeFileSync(filter_file('CL only.json'), JSON.stringify([{ 'source-lib': '*', 'source-file': 'qrpglesrc', 'source-member': '*' }]));
    assert.deepStrictEqual(labels(await provider.getChildren(libs[0])), ['qrpglesrc']);
    assert.strictEqual(evaluate.callCount, 3, 'filter file changed');

    await LocalSourceList.load_source_list();
    await provider.getChildren(libs[0]);
    assert.strictEqual(evaluate.callCount, 4, 'sources read again');
  });


  test('an invalid regular expression is reported once and doesn\'t break the filter', async () => {
    const warn = sinon.stub(vscode.window, 'showWarningMessage');
    fs.writeFileSync(filter_file('Broken.json'), JSON.stringify([
      { 'source-lib': '(', 'source-file': '.*', 'source-member': '.*', 'use-regex': true },
      { 'source-lib': '*', 'source-file': 'qclsrc', 'source-member': '*' }
    ]));
    const broken = (await provider.getChildren()).find(item => item.label === 'Broken')!;

    assert.deepStrictEqual(labels(await provider.getChildren(broken)), ['prouzalib']);
    await provider.getChildren(broken);
    assert.strictEqual(warn.callCount, 1);
    assert.match(String(warn.firstCall.args[0]), /^Source filter 'Broken', entry 1: invalid regular expression/);
  });
});
