import assert from 'assert';
import * as vscode from 'vscode';


suite('Window without OBI project', () => {

  test('the extension is not activated at startup', async () => {
    // Give onStartupFinished-like activations time to happen
    await new Promise(resolve => setTimeout(resolve, 3000));
    const extension = vscode.extensions.getExtension('andreas-prouza.obi');
    assert.ok(extension, 'extension installed');
    assert.strictEqual(extension.isActive, false);
  });
});
