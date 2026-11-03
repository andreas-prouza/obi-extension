import * as path from 'path';
import Mocha from 'mocha';

/** Tests in a window without OBI project (second run of runTest.ts, empty workspace) */
export function run(): Promise<void> {
    const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 20000 });
    mocha.addFile(path.resolve(__dirname, 'activation.check.js'));
    return new Promise((resolve, reject) => {
        mocha.run(failures => failures > 0 ? reject(new Error(`${failures} tests failed.`)) : resolve());
    });
}
