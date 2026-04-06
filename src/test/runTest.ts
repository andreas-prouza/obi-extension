import * as path from 'path';
import * as fs from 'fs-extra';
import { runTests } from '@vscode/test-electron';

async function main() {
    try {
        // 1. Path to the extension's root (where package.json lives)
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');

        // 2. Path to the compiled test runner (index.js)
        const extensionTestsPath = path.resolve(__dirname, './suite/index');

        // 3. Create a clean, temporary workspace folder
        // This ensures your real 'test-resources' templates are never modified
        const testWorkspacePath = path.resolve(__dirname, '../../test-workspace-active');
        
        // Ensure the directory exists and is empty before starting
        if (!fs.existsSync(testWorkspacePath)) {
            fs.mkdirSync(testWorkspacePath);
        }

        // 4. Run the actual tests
        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            // Launch VS Code with our active (initially empty) folder
            launchArgs: [testWorkspacePath]
        });
    } catch (err) {
        console.error('Failed to run tests');
        process.exit(1);
    }
}

main();