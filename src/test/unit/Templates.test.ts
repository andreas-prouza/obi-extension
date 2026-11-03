import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { Constants } from '../../shared/Constants';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nunjucks = require('nunjucks');


function all_templates(dir: string = Constants.HTML_TEMPLATE_DIR): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return all_templates(full);
    return entry.name.endsWith('.html') ? [full] : [];
  });
}


const PAYLOADS = [`x');alert(1);//`, `Customer's orders`, `<img src=x onerror=alert(1)>`, `a "quoted" text & more`];


suite('Templates', () => {

  test('no template puts template values into inline event handlers', () => {
    for (const file of all_templates()) {
      const html = fs.readFileSync(file, 'utf8');
      const match = html.match(/\son[a-z]+\s*=\s*["'][^"']*\{\{/i);
      assert.strictEqual(match, null, `${path.relative(Constants.HTML_TEMPLATE_DIR, file)}: ${match?.[0]}`);
    }
  });


  test('source infos editor renders descriptions only as escaped attribute values', () => {
    const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(Constants.HTML_TEMPLATE_DIR), { autoescape: true });
    const html: string = env.render('source_list/source-infos-config.html', {
      global_stuff: { get_text: (key: string) => key, asserts_uri: '', nonce: 'n', theme_mode: 'dark', locale: 'en' },
      source_list: PAYLOADS.map((description, i) => ({ 'source-lib': 'lib', 'source-file': 'qrpglesrc', 'source-member': `m${i}.rpgle.pgm`, description })),
      source_info_file: '',
      config_css: '',
      main_java_script: ''
    });

    assert.ok(!html.includes('onfocusout'), 'no inline event handler');
    assert.ok(!html.includes('<img'), 'payload is not rendered as markup');
    assert.ok(!/<script>/.test(html), 'no inline script');
    assert.ok(html.includes(`data-original="x&#39;);alert(1);//"`));
    assert.ok(html.includes(`value="&lt;img src=x onerror=alert(1)&gt;"`));
    assert.ok(html.includes(`value="a &quot;quoted&quot; text &amp; more"`));
  });
});
