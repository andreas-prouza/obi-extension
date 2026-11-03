import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';
import { runTests } from '@vscode/test-electron';

async function main() {
    // When started from a VS Code terminal, these variables would make the test instance run as
    // plain Node (ELECTRON_RUN_AS_NODE) or talk to the running VS Code (VSCODE_IPC_HOOK, ...).
    // Without WAYLAND_DISPLAY and with an X11 session type, Electron uses DISPLAY:
    // Xvfb under xvfb-run, XWayland on a Wayland desktop. Otherwise it hangs trying Wayland under Xvfb.
    for (const key of Object.keys(process.env)) {
        if (key === 'ELECTRON_RUN_AS_NODE' || key === 'WAYLAND_DISPLAY' || key.startsWith('VSCODE_') && key !== 'VSCODE_TEST_VERSION')
            delete process.env[key];
    }
    if (process.env.XDG_SESSION_TYPE === 'wayland')
        process.env.XDG_SESSION_TYPE = 'x11';

    // Run against a fresh copy of the fixture project, so tests never modify tracked files,
    // and with a fresh user data folder, so no state from earlier runs leaks into this one.
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'obi-test-ws-'));
    const empty_workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'obi-test-empty-'));
    const user_data = await fs.mkdtemp(path.join(os.tmpdir(), 'obi-test-user-'));

    const run = (folder: string, tests: string) => runTests({
        // Path to the extension's root (where package.json lives)
        extensionDevelopmentPath: path.resolve(__dirname, '../../'),
        // Path to the compiled test runner (out-test/test/<tests>/index.js)
        extensionTestsPath: path.resolve(__dirname, tests, 'index'),
        launchArgs: [folder, '--disable-extensions', `--user-data-dir=${user_data}`],
        // e.g. VSCODE_TEST_VERSION=1.138.0 to reuse a cached build; default: latest stable
        version: process.env.VSCODE_TEST_VERSION,
        // Cached configs are shared: frozen, so code that modifies them fails the tests
        extensionTestsEnv: {
            OBI_FREEZE_CONFIG: '1',
            // npm run test:coverage; c8 reports from this folder
            ...(process.argv.includes('--coverage') ? { NODE_V8_COVERAGE: path.resolve(__dirname, '../../coverage/tmp') } : {})
        }
    });

    try {
        await fs.copy(path.resolve(__dirname, '../../test-resources/appconfig'), workspace);
        await run(workspace, 'suite');
        // A window without OBI project: the extension must stay inactive
        await run(empty_workspace, 'no-project');
    } catch (err) {
        console.error('Failed to run tests', err);
        process.exitCode = 1;
    } finally {
        await fs.remove(workspace);
        await fs.remove(empty_workspace);
        await fs.remove(user_data);
    }
}

main();
