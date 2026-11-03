import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as sinon from 'sinon';
import { AppConfig } from '../../extension/config/AppConfig';
import { OBITools } from '../../extension/utilities/OBITools';
import { OBICommands } from '../../extension/obi/OBICommands';


// Local programs run without a shell: environment variables in local-obi-dir
// (e.g. %UserProfile% on Windows) must be resolved before spawn sees them.
suite('local-obi-dir with environment variables', () => {

  const ENV = 'OBI_TEST_LOCAL_OBI_HOME';
  let dir: string;
  let config: AppConfig;

  setup(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obi-localobi-'));
    const venv_bin = process.platform === 'win32' ? path.join('venv', 'Scripts', 'python.exe') : path.join('venv', 'bin', 'python');
    fs.mkdirSync(path.dirname(path.join(dir, 'obi', venv_bin)), { recursive: true });
    fs.writeFileSync(path.join(dir, 'obi', venv_bin), '');
    process.env[ENV] = dir;

    const current = AppConfig.get_app_config();
    const local_obi_dir = process.platform === 'win32' ? `%${ENV}%\\obi` : `$${ENV}/obi`;
    config = { ...current, general: { ...current.general, 'local-obi-dir': local_obi_dir } } as AppConfig;
    sinon.stub(AppConfig, 'get_app_config').returns(config);
  });

  teardown(() => {
    sinon.restore();
    delete process.env[ENV];
    fs.rmSync(dir, { recursive: true, force: true });
  });


  test('the python path is resolved', () => {
    const python = OBITools.get_local_obi_python_path();
    assert.ok(python);
    assert.ok(python.startsWith(path.join(dir, 'obi')), python);
    assert.ok(fs.existsSync(python));
  });


  test('main.py is resolved', () => {
    const args = OBICommands.local_obi_args(config, 'create');
    assert.strictEqual(args[2], path.join(dir, 'obi', 'main.py'));
  });


  test('get_local_obi_dir is resolved', () => {
    assert.strictEqual(OBITools.get_local_obi_dir(), path.join(dir, 'obi'));
  });
});
