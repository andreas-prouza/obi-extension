import { defineConfig } from '@vscode/test-cli';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    files: 'out/test/suite/**/*.test.js',
    mocha: {
        ui: 'tdd',
        timeout: 20000
    },
    // The first argument in launchArgs is often treated as the workspace path
    launchArgs: [
        path.resolve(__dirname, './test-workspace-active'),
        // 1. Tell VS Code to look for extensions in an empty folder
        `--extensions-dir=${path.resolve(__dirname, './temp-extensions')}`,
        // 2. Tell VS Code to use a fresh profile (prevents sync/cache issues)
        `--user-data-dir=${path.resolve(__dirname, './temp-user-data')}`,
        // 3. Manually point to the root of YOUR extension so it's the only one loaded
        `--extensionDevelopmentPath=${path.resolve(__dirname, '../..')}`
    ]
});