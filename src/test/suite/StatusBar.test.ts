import assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { StatusBar } from '../../extension/StatusBar';
import { OperationLock } from '../../extension/utilities/OperationLock';


function fake_context(): vscode.ExtensionContext {
  const state = new Map<string, unknown>();
  return {
    subscriptions: [] as { dispose(): unknown }[],
    workspaceState: { get: (key: string) => state.get(key), update: async (key: string, value: unknown) => { state.set(key, value); }, keys: () => [...state.keys()] },
  } as unknown as vscode.ExtensionContext;
}

const text = () => (StatusBar as unknown as { item: vscode.StatusBarItem }).item.text;


suite('Status bar item', () => {

  let context: vscode.ExtensionContext;

  setup(() => {
    // The activated extension has registered the menu command already
    sinon.stub(vscode.commands, 'registerCommand').returns({ dispose: () => undefined });
    context = fake_context();
    StatusBar.init(context);
  });

  teardown(() => {
    context.subscriptions.forEach(d => d.dispose());
    sinon.restore();
  });


  test('profile, then the result of the last build', () => {
    assert.strictEqual(text(), '$(server-environment) default');

    StatusBar.build_finished({ compiles: [{ sources: [{ cmds: [{ status: 'success' }] }, { cmds: [{ status: 'failed' }] }] }] });
    assert.strictEqual(text(), '$(server-environment) default  $(error) 1 failed');
  });


  test('running operation and cancel', async () => {
    await OperationLock.run('Run build', async () => {
      assert.strictEqual(text(), '$(sync~spin) Run build…');
    });
    assert.strictEqual(text(), '$(server-environment) default');

    StatusBar.show_cancelled();
    assert.strictEqual(text(), '$(circle-slash) Cancelled');
  });
});
