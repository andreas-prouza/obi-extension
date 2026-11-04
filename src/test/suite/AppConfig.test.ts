import * as fs from 'fs';
import * as path from 'path';
import { Workspace } from '../../extension/utilities/Workspace';
import { AppConfig } from '../../extension/config/AppConfig';
import assert from 'assert';
import { OBIConfiguration } from '../../webview/controller/OBIConfiguration';
import { reset_workspace } from './workspace_fixture';
import { Constants } from '../../shared/Constants';
import { DirTool } from '../../extension/utilities/DirTool';

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


suite('User config overrides the project config per value', () => {

    const ws_uri = Workspace.get_workspace_uri();
    const project_file = () => path.join(Workspace.get_workspace(), Constants.OBI_APP_CONFIG_FILE);
    const user_file = () => path.join(Workspace.get_workspace(), Constants.OBI_APP_CONFIG_USER_FILE);
    // smol-toml tables have no prototype: compare copies
    type Table = Record<string, unknown>;
    const read_user = () => DirTool.read_toml_strict<{ connection?: Table; general?: Table; global?: { settings?: { general?: Table } } }>(user_file()) ?? {};

    function edit_project(from: string, to: string): void {
        const text = fs.readFileSync(project_file(), 'utf8');
        assert.ok(text.includes(from), from);
        fs.writeFileSync(project_file(), text.replace(from, to));
    }

    setup(async () => {
        await reset_workspace();
        AppConfig.reset();
        edit_project('[connection]\n', '[connection]\nssh-agent = true\n');
        edit_project('[global.settings.general]\n', '[global.settings.general]\nALWAYS_TRANSFER_RELATED_COPYBOOKS = true\n');
    });


    test('reset values are removed from the user file, the project value applies again', () => {
        fs.writeFileSync(user_file(), '[connection]\nssh-user = "U"\nssh-agent = false\n\n[global.settings.general]\nALWAYS_TRANSFER_RELATED_COPYBOOKS = false\nTGTRLS = "V7R4M0"\n');
        AppConfig.reset();
        assert.strictEqual(AppConfig.get_app_config().connection['ssh-agent'], false, 'before: the user value overrides');

        OBIConfiguration.save_config(true, ws_uri, { connection: { 'ssh-user': 'U' } },
            ['connection|ssh-agent', 'global|settings|general|ALWAYS_TRANSFER_RELATED_COPYBOOKS', 'general|not-there', 'profiles|x']);

        const user = read_user();
        assert.deepStrictEqual({ ...user.connection }, { 'ssh-user': 'U' });
        assert.deepStrictEqual({ ...user.global?.settings?.general }, { TGTRLS: 'V7R4M0' });
        const merged = AppConfig.get_app_config();
        assert.strictEqual(merged.connection['ssh-agent'], true);
        assert.strictEqual(merged.global.settings?.general?.ALWAYS_TRANSFER_RELATED_COPYBOOKS, true);
        assert.strictEqual(merged.global.settings?.general?.TGTRLS, 'V7R4M0');
    });


    test('an explicit false in the user config still overrides', () => {
        OBIConfiguration.save_config(true, ws_uri, { connection: { 'ssh-user': 'U', 'ssh-agent': false } }, []);
        assert.strictEqual(read_user().connection?.['ssh-agent'], false);
        assert.strictEqual(AppConfig.get_app_config().connection['ssh-agent'], false);
    });


    test('the project config ignores unset', () => {
        OBIConfiguration.save_config(false, ws_uri, {}, ['connection|ssh-agent']);
        assert.strictEqual(AppConfig.get_project_app_config(ws_uri).connection['ssh-agent'], true);
    });


    test('a user config without [general] adds no defaults over the project values', () => {
        edit_project('source-dir = "src"', 'source-dir = "qsrc"');
        fs.writeFileSync(user_file(), '[connection]\nssh-user = "U"\n');
        AppConfig.reset();
        assert.strictEqual(AppConfig.get_app_config().general['source-dir'], 'qsrc');

        OBIConfiguration.save_config(true, ws_uri, { connection: { 'ssh-user': 'U2' } }, []);
        assert.deepStrictEqual({ ...read_user().general }, {});
        assert.strictEqual(AppConfig.get_app_config().general['source-dir'], 'qsrc');
    });
});