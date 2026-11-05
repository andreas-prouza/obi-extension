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


  suite('config page: user values override the project values per field', () => {

    const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(Constants.HTML_TEMPLATE_DIR), { autoescape: true });
    const render = (class_prefix: string, app_config: object, user_overrides: string[] = []): string => env.render('controller/config_details.html', {
      global_stuff: { get_text: (key: string) => key },
      class_prefix, app_config, user_overrides,
      extended_source_processing_list: []
    });

    /** id → class of the fields that are saved (<prefix>_save_app) */
    const saved_fields = (html: string, class_prefix: string): Map<string, string> => {
      const fields = new Map<string, string>();
      for (const [tag] of html.matchAll(/<vscode-(?:text-field|text-area|checkbox)\b[^>]*>/g)) {
        const css = tag.match(/\sclass="([^"]*)"/)?.[1] ?? '';
        const id = tag.match(/\sid="([^"]*)"/)?.[1] ?? '';
        if (css.split(/\s+/).includes(`${class_prefix}_save_app`))
          fields.set(id.replace(`${class_prefix}|`, ''), css);
      }
      return fields;
    };

    const wrapper = (html: string, key: string): string => html.match(new RegExp(`<span class="cfg_field[^"]*" data-override-key="${key.replace(/\|/g, '\\|')}">[\\s\\S]*?</vscode-button>`))?.[0] ?? '';


    test('every value of the project tab has the override button in the user tab', () => {
      const project_keys = [...saved_fields(render('project', {}), 'project').keys()].sort();
      const user_html = render('user', {});
      const override_keys = [...user_html.matchAll(/data-override-key="([^"]+)"/g)].map(match => match[1]).sort();

      assert.ok(project_keys.length > 30, project_keys.join(', '));
      assert.deepStrictEqual(override_keys, project_keys);
      assert.ok(saved_fields(user_html, 'user').has('connection|ssh-user'), 'user only, without button');
    });


    test('the button shows whether the user config sets the value', () => {
      const html = render('user', { connection: { 'ssh-agent': false } }, ['connection', 'connection|ssh-agent']);

      assert.match(wrapper(html, 'connection|ssh-agent'), /class="cfg_field check overridden"[\s\S]*aria-pressed="true"[\s\S]*codicon-discard/);
      assert.match(wrapper(html, 'connection|remote-host'), /class="cfg_field inherited"[\s\S]*aria-pressed="false"[\s\S]*codicon-edit/);
      assert.ok(!render('project', {}).includes('override_toggle'), 'no buttons in the project tab');
    });


    test('extended source processing is on unless switched off, as in the OBI backend', () => {
      const use_esp = (general: object) => saved_fields(render('project', { global: { settings: { general } } }), 'project').get('global|settings|general|USE_ESP');
      const checked = (general: object) => /\schecked\b/.test(render('project', { global: { settings: { general } } }).match(/<vscode-checkbox\b[^>]*USE_ESP">/)?.[0] ?? '');

      assert.ok(use_esp({}) !== undefined);
      assert.strictEqual(checked({}), true);
      assert.strictEqual(checked({ USE_ESP: true }), true);
      assert.strictEqual(checked({ USE_ESP: false }), false);
    });


    test('SSH compression is on unless switched off', () => {
      const checked = (connection: object) => /\schecked\b/.test(render('project', { connection }).match(/<vscode-checkbox\b[^>]*ssh-compression">/)?.[0] ?? '');

      assert.strictEqual(checked({}), true);
      assert.strictEqual(checked({ 'ssh-compression': true }), true);
      assert.strictEqual(checked({ 'ssh-compression': false }), false);
    });
  });
});
