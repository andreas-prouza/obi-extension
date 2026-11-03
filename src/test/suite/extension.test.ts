import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { NodeSSH } from 'node-ssh';
import { SSH_Tasks } from '../../extension/utilities/SSH_Tasks';


// bugs.md #9: contributed in package.json, but never registered. Implement them or remove them from package.json.
const KNOWN_UNREGISTERED = ['obi.showErrors', 'obi.show.tools', 'obi.get-remote-compiled-object-list', 'obi.deployment.maintain'];


suite('Extension registration', () => {

	teardown(() => sinon.restore());


	test('every contributed command is registered', async function () {
		this.timeout(20_000);
		const extension = vscode.extensions.getExtension('andreas-prouza.obi');
		assert.ok(extension, 'extension found');
		await extension.activate();

		const registered = new Set(await vscode.commands.getCommands(true));
		const contributed: string[] = extension.packageJSON.contributes.commands.map((c: { command: string }) => c.command);

		assert.deepStrictEqual(contributed.filter(id => !registered.has(id) && !KNOWN_UNREGISTERED.includes(id)), []);
		assert.deepStrictEqual(KNOWN_UNREGISTERED.filter(id => registered.has(id)), [], 'registered now: remove from KNOWN_UNREGISTERED');
	});


	test('disconnect closes an open SSH connection', () => {
		sinon.stub(NodeSSH.prototype, 'isConnected').returns(true);
		const dispose = sinon.stub(NodeSSH.prototype, 'dispose');
		SSH_Tasks.disconnect();
		assert.ok(dispose.calledOnce);
	});
});
