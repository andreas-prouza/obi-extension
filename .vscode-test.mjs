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
        '--disable-extensions'
    ]
});