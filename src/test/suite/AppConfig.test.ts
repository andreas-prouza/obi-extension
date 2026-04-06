import * as fs from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import { Workspace } from '../../extension/utilities/Workspace';
import { AppConfig } from '../../shared/AppConfig';
import assert from 'assert';
import { DirTool } from '../../extension/utilities/DirTool';
import { OBIConfiguration } from '../../webview/controller/OBIConfiguration';

suite('AppConfig Integration', () => {

    // This is where your 'Gold Master' templates live
    const masterTemplates = path.resolve(__dirname, '../../../test-resources/appconfig');
    const ws_uri = Workspace.get_workspace_uri();

    setup(async () => {
        // Clear the active workspace

        const activeWsPath = Workspace.get_workspace(); 
        await fs.emptyDir(activeWsPath);
        DirTool.copy_dir(masterTemplates, activeWsPath)
    });

    test('Verify AppConfig defaults', () => {
        const config = AppConfig.get_app_config();
        assert.ok(config.connection['remote-host'] === undefined);
        assert.ok(config.attributes_missing);
    });

    test('No missing attributes when all fields are set', () => {
        const config = AppConfig.get_app_config();
        const user_config = AppConfig.get_user_app_config(ws_uri);

        config.connection['remote-host'] = 'example.com';
        config.general['remote-obi-dir'] = '/home/user/obi';
        OBIConfiguration.save_config(false, ws_uri, config);

        user_config.connection['ssh-user'] = 'User';
        OBIConfiguration.save_config(true, ws_uri, user_config);

        assert.ok(!AppConfig.get_app_config().attributes_missing());
    });
});