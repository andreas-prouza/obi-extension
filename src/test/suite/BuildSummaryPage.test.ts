import assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { AppConfig } from '../../extension/config/AppConfig';
import { Constants } from '../../shared/Constants';
import { BuildSummary } from '../../webview/show_changes/BuildSummary';
import { reset_workspace } from './workspace_fixture';


const fake_webview = { asWebviewUri: (uri: vscode.Uri) => uri, cspSource: 'vscode-resource:' } as unknown as vscode.Webview;

function render(): string {
  return BuildSummary['generate_html'](vscode.Uri.file(Constants.EXTENSION_ROOT), fake_webview);
}

const cmd = (status: string, extra: Record<string, unknown> = {}) => ({ cmd: `liblist -a LIB ; CRTBNDRPG ${status}`, status, updated: '2026-11-15T06:31:26.358000', ...extra });


suite('Build summary page', () => {

  setup(async () => {
    await reset_workspace();
    sinon.stub(AppConfig, 'attributes_missing').returns(false);
    BuildSummary['_current_compile_output_folder'] = undefined;
  });

  teardown(() => sinon.restore());


  test('header, levels and sources: counts, statuses, singular and plural', () => {
    sinon.stub(BuildSummary, 'get_compile_list').returns({
      timestamp: '2026-11-15T06:30:12.433Z',
      git: { branch: 'main', commit: '3f2a1c9d0e8b' },
      compiles: [
        { level: 1, sources: [{ source: 'lib/qrpglesrc/a.rpgle.pgm', cmds: [cmd('success', { joblog: 'J' })] }] },
        { level: 2, sources: [
          { source: 'lib/qrpglesrc/b.rpgle.pgm', cmds: [cmd('success'), cmd('failed', { joblog: 'J', stdout: 'S', stderr: 'E' }), cmd('new', { updated: '' })] },
          { source: 'lib/qrpglesrc/c.rpgle.pgm', cmds: [cmd('new')] },
        ] },
      ],
    });
    const html = render();

    assert.ok(!/<vscode-/.test(html), 'no components of the old toolkit');
    assert.match(html, /<span class="status-pill failed"><span class="codicon codicon-error"><\/span>1 failed<\/span>/);
    assert.match(html, /<span class="status-pill success"><span class="codicon codicon-pass"><\/span>1 built<\/span>/);
    assert.match(html, /<span class="status-pill new"><span class="codicon codicon-circle-large-outline"><\/span>1 to build<\/span>/);
    assert.match(html, /<span class="obi-muted">3 objects · 2 levels<\/span>/);
    assert.match(html, /codicon-git-branch"><\/span>main · 3f2a1c9</);
    assert.match(html, /id="run_build"/, 'not completed: Run build');

    // Levels: count and result; sources: the member highlighted, the status of its last command that ran
    assert.match(html, /1\. level\s*<span class="obi-muted">· 1 object<\/span>/);
    assert.match(html, /2\. level\s*<span class="obi-muted">· 2 objects<\/span>/);
    assert.match(html, /<b>b\.rpgle\.pgm<\/b><\/a><\/span>\s*<\/td>\s*<td class="col-status"><span class="status-pill failed">failed<\/span>/);
    assert.match(html, />1 command<span class="codicon codicon-chevron-right">/);
    assert.match(html, />3 commands<span class="codicon codicon-chevron-right">/);

    // The commands of a failed source are open at first; the failed command shows its output buttons
    assert.match(html, /data-cmds-key="2\|lib\/qrpglesrc\/b\.rpgle\.pgm" data-default-open="true"/);
    assert.match(html, /data-cmds-key="1\|lib\/qrpglesrc\/a\.rpgle\.pgm" data-default-open="false"/);
    assert.match(html, /<div class="cmd is-failed">/);
    assert.match(html, /class="btn secondary small stderr" source="lib\/qrpglesrc\/b\.rpgle\.pgm" level="2" cmd_index="1"/);
    assert.match(html, /<span class="cmd-time">not run<\/span>/, 'a command without time');
    assert.match(html, /class="obi-check build_source_cmd" source="lib\/qrpglesrc\/b\.rpgle\.pgm" cmd="liblist -a LIB ; CRTBNDRPG failed"/);
  });


  test('without a build list: the empty state', () => {
    sinon.stub(BuildSummary, 'get_compile_list').returns(undefined);
    const html = render();
    assert.match(html, /<p id="no_compile_list" class="page-empty">/);
    assert.ok(!html.includes('id="run_build"'));
  });
});
