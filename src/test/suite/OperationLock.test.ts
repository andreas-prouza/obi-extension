import assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { OperationLock } from '../../extension/utilities/OperationLock';


suite('OperationLock', () => {

  teardown(() => sinon.restore());


  test('a second operation is refused while the first runs; the lock is released afterwards', async () => {
    const warning = sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined);
    let release: () => void = () => {};
    const first = OperationLock.run('Run build', () => new Promise<string>(resolve => { release = () => resolve('done'); }));

    assert.strictEqual(OperationLock.running, 'Run build');
    assert.strictEqual(await OperationLock.run('Show changes', async () => 'second'), undefined);
    assert.ok(warning.calledOnce && String(warning.firstCall.args[0]).includes('Run build'));

    release();
    assert.strictEqual(await first, 'done');
    assert.strictEqual(OperationLock.running, undefined);
  });


  test('the lock is released when the operation throws', async () => {
    await assert.rejects(() => OperationLock.run('Transfer', async () => { throw new Error('boom'); }), /boom/);
    assert.strictEqual(OperationLock.running, undefined);
    assert.strictEqual(await OperationLock.run('Transfer', async () => 42), 42);
  });


  test('on_did_change reports start and end', async () => {
    const events: (string | undefined)[] = [];
    const listener = OperationLock.on_did_change(label => events.push(label));
    await OperationLock.run('Remote source check', async () => undefined);
    listener.dispose();
    assert.deepStrictEqual(events, ['Remote source check', undefined]);
  });
});
