import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { AppConfigDict } from '../webview/controller/AppConfigDict';
import { OBITools } from '../utilities/OBITools';
// import * as myExtension from '../../extension';


suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('App config test', () => {

		let x: AppConfigDict = Object.assign({'generalx': {'local-base-dirx': 'test' }});

		assert.strictEqual(x['generalx']['local-base-dirx'], 'test');
		
	});

	test('Array merge test', () => {

		let x: {} = {
			allg: "test 1",
			x: "test x",
		};

		let y: {} = {
			allg: "test 2",
			y: "test y",
		};

		let z = {...x, ...y};

		let z1 = {
			allg: "test 2",
			x: "test x",
			y: "test y"
		};

		let z2 = OBITools.override_dict(x, y);

		assert.strictEqual(z, z2);
		
	});
});
