import * as path from 'path';
import { Workspace } from '../../extension/utilities/Workspace';
import { AppConfig } from '../../extension/config/AppConfig';
import assert from 'assert';
import { OBIConfiguration } from '../../webview/controller/OBIConfiguration';
import { reset_workspace } from './workspace_fixture';

suite('AppConfig Integration', () => {

    // This is where your 'Gold Master' templates live
    const ws_uri = Workspace.get_workspace_uri();

    setup(async () => {
        // Clear the active workspace

        await reset_workspace();
    });

    test('Verify AppConfig defaults', () => {
        const config = AppConfig.get_app_config();
        assert.ok(config.connection['remote-host'] === undefined);
        assert.ok(config.attributes_missing);
    });

    test('No missing attributes when all fields are set', () => {
        // get_app_config() is shared and read-only: edit a copy of the project config
        const config = AppConfig.get_app_config(AppConfig.get_project_app_config(ws_uri));
        const user_config = AppConfig.get_user_app_config(ws_uri);

        config.connection['remote-host'] = 'example.com';
        config.general['remote-obi-dir'] = '/home/user/obi';
        OBIConfiguration.save_config(false, ws_uri, config);

        user_config.connection['ssh-user'] = 'User';
        OBIConfiguration.save_config(true, ws_uri, user_config);

        assert.ok(!AppConfig.get_app_config().attributes_missing());
    });
});