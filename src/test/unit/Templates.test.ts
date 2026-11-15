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


  test('no page uses the components of the deprecated webview toolkit (custom build summary templates still may)', () => {
    for (const file of all_templates()) {
      const html = fs.readFileSync(file, 'utf8');
      assert.ok(!/<vscode-[a-z-]+/.test(html), path.relative(Constants.HTML_TEMPLATE_DIR, file));
    }
  });


  test('text filters of the tables compare the visible text, not the cell HTML (link targets, attributes)', () => {
    let columns = 0;
    for (const file of all_templates()) {
      const html = fs.readFileSync(file, 'utf8');
      for (const th of html.match(/<th\b[^>]*data-filter-control="input"[^>]*>/g) ?? []) {
        columns++;
        assert.ok(th.includes('data-filter-custom-search="obi_cell_text_search"'), `${path.relative(Constants.HTML_TEMPLATE_DIR, file)}: ${th}`);
      }
    }
    assert.ok(columns >= 4, 'the source filter table and source infos pages have text filters');
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
      for (const [tag] of html.matchAll(/<(?:input|textarea)\b[^>]*>/g)) {
        const css = tag.match(/\sclass="([^"]*)"/)?.[1] ?? '';
        const id = tag.match(/\sid="([^"]*)"/)?.[1] ?? '';
        if (css.split(/\s+/).includes(`${class_prefix}_save_app`))
          fields.set(id.replace(`${class_prefix}|`, ''), css);
      }
      return fields;
    };

    const wrapper = (html: string, key: string): string => html.match(new RegExp(`<div class="setting cfg_field[^"]*" data-override-key="${key.replace(/\|/g, '\\|')}">[\\s\\S]*?</button>`))?.[0] ?? '';


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

      assert.match(wrapper(html, 'connection|ssh-agent'), /class="setting cfg_field check overridden"[\s\S]*aria-pressed="true"[\s\S]*codicon-discard/);
      assert.match(wrapper(html, 'connection|remote-host'), /class="setting cfg_field inherited"[\s\S]*aria-pressed="false"[\s\S]*codicon-edit/);
      assert.ok(!render('project', {}).includes('override_toggle'), 'no buttons in the project tab');
    });


    test('extended source processing is on unless switched off, as in the OBI backend', () => {
      const use_esp = (general: object) => saved_fields(render('project', { global: { settings: { general } } }), 'project').get('global|settings|general|USE_ESP');
      const checked = (general: object) => /\schecked\b/.test(render('project', { global: { settings: { general } } }).match(/<input type="checkbox"[^>]*USE_ESP"[^>]*>/)?.[0] ?? '');

      assert.ok(use_esp({}) !== undefined);
      assert.strictEqual(checked({}), true);
      assert.strictEqual(checked({ USE_ESP: true }), true);
      assert.strictEqual(checked({ USE_ESP: false }), false);
    });


    test('SSH compression is on unless switched off', () => {
      const checked = (connection: object) => /\schecked\b/.test(render('project', { connection }).match(/<input type="checkbox"[^>]*ssh-compression"[^>]*>/)?.[0] ?? '');

      assert.strictEqual(checked({}), true);
      assert.strictEqual(checked({ 'ssh-compression': true }), true);
      assert.strictEqual(checked({ 'ssh-compression': false }), false);
    });


    test('no components of the old toolkit; required fields are marked and say why', () => {
      const html = render('project', {});
      assert.ok(!/<vscode-/.test(html));
      assert.match(html, /<label for="project\|connection\|remote-host">Remote host<\/label>\s*<span class="setting-tag">required<\/span>/);
      assert.match(html, /id="project\|connection\|remote-host"[^>]*>\s*<div class="setting-error setting-missing">/);
      // In the user scope only the SSH user is required
      const user_required = [...render('user', {}).matchAll(/id="(user\|[^"]+)"[^>]*>\s*<div class="setting-error setting-missing">/g)].map(match => match[1]);
      assert.deepStrictEqual(user_required, ['user|connection|ssh-user']);
    });


    test('the add buttons and their fields belong to one scope (each id once per page)', () => {
      const ids = (html: string) => [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
      const project = ids(render('project', {}));
      const user = ids(render('user', {}));
      const both = project.filter(id => user.includes(id));
      assert.deepStrictEqual(both, [], 'ids in both scopes');
      for (const [name, prefix] of [['new_global_cmd_key', 'project'], ['new_compile_cmd_value', 'user'], ['new_global_step_key', 'user'], ['add_language_settings_name', 'project']])
        assert.ok((prefix === 'project' ? project : user).includes(`${name}_${prefix}`), `${name}_${prefix}`);
      assert.match(render('user', {}), /class="btn secondary small add_global_cmd" config="user"/);
    });
  });
});
