import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { NodeSSH } from 'node-ssh';
import { SSH_Tasks } from '../../extension/utilities/SSH_Tasks';


suite('Extension registration', () => {

	teardown(() => sinon.restore());


	test('every contributed command is registered', async function () {
		this.timeout(20_000);
		const extension = vscode.extensions.getExtension('andreas-prouza.obi');
		assert.ok(extension, 'extension found');
		await extension.activate();

		// The commands of the project are registered by ProjectState.update, which activate doesn't wait for
		let registered = new Set<string>();
		for (let i = 0; i < 100; i++) {
			registered = new Set(await vscode.commands.getCommands(true));
			if (registered.has('obi.controller.config') && registered.has('obi.status-bar.menu'))
				break;
			await new Promise(resolve => setTimeout(resolve, 100));
		}
		const contributed: string[] = extension.packageJSON.contributes.commands.map((c: { command: string }) => c.command);

		assert.deepStrictEqual(contributed.filter(id => !registered.has(id)), [], 'contributed, but not registered (bugs.md #9)');

		// Menus and the Command Palette name contributed commands only (also for its `when`: on a command VS Code ignores it)
		const menus = extension.packageJSON.contributes.menus as Record<string, { command?: string }[]>;
		const named = Object.values(menus).flat().map(item => item.command).filter((id): id is string => typeof id === 'string');
		assert.deepStrictEqual(named.filter(id => !contributed.includes(id)), [], 'menu entries of unknown commands');
	});


	test('disconnect closes an open SSH connection', () => {
		sinon.stub(NodeSSH.prototype, 'isConnected').returns(true);
		const dispose = sinon.stub(NodeSSH.prototype, 'dispose');
		SSH_Tasks.disconnect();
		assert.ok(dispose.calledOnce);
	});
});
