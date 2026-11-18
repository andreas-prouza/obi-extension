import assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { AppConfig } from '../../extension/config/AppConfig';
import { Constants } from '../../shared/Constants';
import { BuildSummary } from '../../webview/show_changes/BuildSummary';
import { DependencyList } from '../../extension/obi/Dependency';
import { DirTool } from '../../extension/utilities/DirTool';
import { OBITools } from '../../extension/utilities/OBITools';
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
    assert.match(html, /class="obi-check build_source_cmd" source="lib\/qrpglesrc\/b\.rpgle\.pgm" level="2" cmd_index="1" cmd="liblist -a LIB ; CRTBNDRPG failed"/);
  });


  test('unchecked sources and commands: not checked, greyed out; command checkboxes name level and index', () => {
    sinon.stub(BuildSummary, 'get_compile_list').returns({
      compiles: [{ level: 1, sources: [
        { source: 'lib/qrpglesrc/a.rpgle.pgm', ignore: true, cmds: [cmd('success')] },
        { source: 'lib/qrpglesrc/b.rpgle.pgm', ignore: false, cmds: [cmd('new', { ignore: true }), cmd('new')] },
      ] }],
    });
    const html = render();
    assert.match(html, /<tr class="src-row collapsible-content level-1 is-ignored">\s*<td class="col-check"><input type="checkbox" class="obi-check build_source" source="lib\/qrpglesrc\/a\.rpgle\.pgm"[^>]*title="Build this source" >/);
    assert.match(html, /<input type="checkbox" class="obi-check build_source" source="lib\/qrpglesrc\/b\.rpgle\.pgm"[^>]* checked>/);
    assert.match(html, /<div class="cmd is-ignored">\s*<input type="checkbox" class="obi-check build_source_cmd" source="lib\/qrpglesrc\/b\.rpgle\.pgm" level="1" cmd_index="0"[^>]*"command 1" >/);
    assert.match(html, /<div class="cmd">\s*<input type="checkbox" class="obi-check build_source_cmd" source="lib\/qrpglesrc\/b\.rpgle\.pgm" level="1" cmd_index="1"[^>]* checked>/);
  });


  suite('checkboxes are saved at once', () => {

    const a = 'lib/qrpglesrc/a.rpgle.pgm', d = 'lib/qrpglesrc/d.rpgle.pgm', e = 'lib/qrpglesrc/e.rpgle.pgm', b = 'lib/qrpglesrc/b.rpgle.pgm';
    let write: sinon.SinonStub;
    let ask: sinon.SinonStub;

    /** Ignored sources of the written list */
    const ignored = () => (write.lastCall.args[1] as { compiles: { sources: { source: string; ignore?: boolean }[] }[] }).compiles
      .flatMap(level => level.sources).filter(source => source.ignore).map(source => source.source);

    setup(() => {
      // a changed, d depends on a, e on d; b changed without dependents
      sinon.stub(BuildSummary, 'get_compile_list').callsFake(() => ({
        compiles: [
          { level: 1, sources: [{ source: a, cmds: [cmd('success')] }, { source: b, cmds: [cmd('new')] }] },
          { level: 2, sources: [{ source: d, cmds: [cmd('success')] }] },
          { level: 3, sources: [{ source: e, cmds: [cmd('new'), cmd('new')] }] },
        ],
      }));
      sinon.stub(BuildSummary as unknown as { changed_sources: () => string[] }, 'changed_sources').returns([a, b]);
      sinon.stub(DependencyList, 'get_dependencies').resolves({ [d]: [a], [e]: [d] });
      sinon.stub(DirTool, 'file_exists').returns(true);
      write = sinon.stub(OBITools, 'write_compile_list');
      ask = sinon.stub(vscode.window, 'showInformationMessage');
    });


    test('unchecking a successful source, with its dependents', async () => {
      ask.resolves('Uncheck dependents too');
      await BuildSummary.ignore_source(a, true);
      assert.ok(ask.calledOnce);
      assert.match(String(ask.firstCall.args[0]), /^2 source\(s\) are only in the build list because of lib\/qrpglesrc\/a\.rpgle\.pgm/);
      assert.strictEqual((ask.firstCall.args[1] as vscode.MessageOptions).detail, `${d}\n${e}`);
      assert.deepStrictEqual(ignored(), [a, d, e]);
    });


    test('only this source; cancel writes nothing', async () => {
      ask.resolves('Only this source');
      await BuildSummary.ignore_source(a, true);
      assert.deepStrictEqual(ignored(), [a]);

      ask.resolves(undefined);
      await BuildSummary.ignore_source(a, true);
      assert.ok(write.calledOnce);
    });


    test('no question without dependents or when checking; commands', async () => {
      await BuildSummary.ignore_source(b, true);
      await BuildSummary.ignore_source(e, true);
      await BuildSummary.ignore_source(a, false);
      assert.ok(ask.notCalled);
      assert.strictEqual(write.callCount, 3);

      await BuildSummary.ignore_cmd('3', e, 1, true);
      const written = write.lastCall.args[1] as { compiles: { sources: { cmds: { ignore?: boolean }[] }[] }[] };
      assert.deepStrictEqual(written.compiles[2].sources[0].cmds.map(c => c.ignore), [undefined, true]);
      await BuildSummary.ignore_cmd('1', e, 1, true);
      assert.strictEqual(write.callCount, 4, 'wrong level: nothing written');
    });
  });


  test('without a build list: the empty state', () => {
    sinon.stub(BuildSummary, 'get_compile_list').returns(undefined);
    const html = render();
    assert.match(html, /<p id="no_compile_list" class="page-empty">/);
    assert.ok(!html.includes('id="run_build"'));
  });
});
