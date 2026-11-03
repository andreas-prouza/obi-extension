import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { render_template } from '../../webview/Templates';


suite('render_template', () => {

  test('templates are rendered from asserts/templates, values are escaped', () => {
    const html = render_template('tools/csp.html', { global_stuff: { nonce: 'a"b', csp_source: 'src' } });
    assert.ok(html.includes("script-src 'nonce-a&quot;b' src;"), html);
  });


  test('a custom folder is only used when asked for, and read again on every call', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obi-templates-'));
    try {
      fs.writeFileSync(path.join(dir, 'custom.html'), 'first');
      assert.strictEqual(render_template('custom.html', {}, dir), 'first');
      fs.writeFileSync(path.join(dir, 'custom.html'), 'second {{ 1 | typename }}');
      assert.strictEqual(render_template('custom.html', {}, dir), 'second Number');
      assert.throws(() => render_template('custom.html', {}), /template not found/);
    }
    finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
