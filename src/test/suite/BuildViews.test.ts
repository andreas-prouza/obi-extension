import assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { OBICommands } from '../../extension/obi/OBICommands';
import { BuildViews } from '../../extension/obi/BuildViews';


/** OBICommands reaches the views only through the registered BuildViews (improvements v2.2.3 D3) */
suite('Build commands and views', () => {

  teardown(() => {
    sinon.restore();
    OBICommands['views'] = undefined;
  });


  test('without an open source, Preview build for the current source ends in the registered views', async () => {
    const calls: string[] = [];
    const views: BuildViews = {
      run_finished: process => { calls.push(`run_finished ${process}`); },
      last_build_changed: () => { calls.push('last_build_changed'); },
      show_build_summary: () => { calls.push('show_build_summary'); },
      update_build_summary: async () => { calls.push('update_build_summary'); },
      show_current_results: async () => { calls.push('show_current_results'); },
      shown_compile_list: () => '.obi/build-output/compile-list.json',
      apply_history_retention: async () => 0,
      reveal_history_build: async () => undefined,
    };
    OBICommands.register_views(views);
    sinon.stub(vscode.window, 'activeTextEditor').value(undefined);
    sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined);

    assert.strictEqual(await OBICommands.show_single_changes({} as vscode.ExtensionContext), false);
    assert.deepStrictEqual(calls, ['run_finished show_changes']);
  });


  test('without registered views nothing is shown, and nothing fails', async () => {
    sinon.stub(vscode.window, 'activeTextEditor').value(undefined);
    sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined);

    assert.strictEqual(await OBICommands.show_single_changes({} as vscode.ExtensionContext), false);
  });
});
