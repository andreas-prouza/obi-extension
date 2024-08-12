import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { AppConfigDict } from '../webview/controller/AppConfigDict';
// import * as myExtension from '../../extension';


suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('App config test', () => {

		let x: AppConfigDict = Object.assign({'generalx': {'local-base-dirx': 'test' }});

		assert.strictEqual(x['generalx']['local-base-dirx'], 'test');
		
	});
});
