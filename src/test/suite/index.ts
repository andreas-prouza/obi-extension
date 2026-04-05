import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

export function run(): Promise<void> {
    // Create the mocha instance
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        timeout: 10000 // Extensions can be slow to load, 10s is safe
    });

    const testsRoot = path.resolve(__dirname, '..');

    return new Promise((c, e) => {
        // Find all files ending in .test.js
        glob('**/**.test.js', { cwd: testsRoot })
            .then(files => {
                // Add files to the mocha instance
                files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

                try {
                    // Run the mocha test
                    mocha.run(failures => {
                        if (failures > 0) {
                            e(new Error(`${failures} tests failed.`));
                        } else {
                            c();
                        }
                    });
                } catch (err) {
                    console.error(err);
                    e(err);
                }
            })
            .catch(err => {
                return e(err);
            });
    });
}