'use strict';
// In VS Code: the build list (Show changes), then the build and its results in the build summary and the Problems view.

window.SCENES.push({
  id: 'build',
  dur: 21.6,
  chapter: 'Build',

  build(tl, scene, t0) {
    const UI = window.UI;
    const { rect, fx, head, show_head, hide_head, callout, show_callout, hide_callout } = UI;
    const ZOOM = 1.35, SIDE = 264;

    const heads = [
      head({ eyebrow: 'In VS Code', title: 'See what will be built — before you build.', sub: '<em>Show changes</em> lists what changed, what depends on it, and the order of the build.' }),
      head({ eyebrow: 'Build summary', title: 'Every result comes back to you.', sub: 'Status, commands, joblogs, spool files and compile errors — for every object, right in VS Code.' }),
    ];
    scene.append(...heads);

    const win = UI.vscode_window({
      zoom: ZOOM, width: 1640, height: 768, side: SIDE,
      panes: UI.controller_pane() + UI.filters_pane({ selected: 'logger' }) + UI.history_pane() + UI.releaser_pane(),
      tabs: [{ label: 'logger.sqlrpgle.srvpgm', icon: 'file-code', id: 'source' }, { label: 'Build summary', id: 'summary' }],
      editor: UI.code_editor(UI.LOGGER_SOURCE, { changed: [8, 12, 13] }) + UI.summary_page(),
      panel: UI.problems_panel(),
      status: UI.status_bar(),
    });
    win.style.left = '140px';
    win.style.top = '268px';
    scene.append(win);

    const q = selector => win.querySelector(selector);
    const editor = q('.vsc-editor');
    const scroller = q('.summary-scroll');
    const side = q('.vsc-side');
    const failed_cmds = q('[data-src=testsqlerr] .cmds');
    const panel = q('.vsc-panel');
    const obi_status = q('.status-obi');
    const ctl = q('.ctl');
    UI.spin(tl, win);

    // ----- positions, read in the layout each callout is shown in
    const editor_top = rect(editor).y;
    const changed_line = rect(win.querySelectorAll('.code-line')[12].querySelector('.code-text'));
    const changed_box = rect(q('[data-box=changed] a'));
    const dependent_box = rect(q('[data-box=dependent] h6'));
    const scroll_details = (rect(q('.summary h3')).y - editor_top - 12) / ZOOM;

    scroller.style.transform = `translateY(${-scroll_details}px)`;
    const levels = rect(q('[data-src=testmod] .cmds-summary'));
    scroller.style.transform = '';

    // After the build: side bar closed, the failed commands open, scrolled to level 2
    side.style.width = '0px';
    failed_cmds.classList.add('open');
    const scroll_failed = (rect(q('tr.lvl[data-level="2"]')).y - editor_top - 8) / ZOOM;
    scroller.style.transform = `translateY(${-scroll_failed}px)`;
    const buttons = rect(failed_cmds.querySelector('[data-btn=spool]'));
    // With the Problems view open, the failed source has to stay visible above it
    const hidden = rect(q('[data-src=errhdlsqlp]')).b + 6 - rect(panel).y;
    const scroll_problems = scroll_failed + Math.max(0, hidden) / ZOOM;
    scroller.style.transform = `translateY(${-scroll_problems}px)`;
    const problem = rect(panel.querySelectorAll('.row')[1].querySelector('.row-desc'));
    side.style.width = '';
    failed_cmds.classList.remove('open');
    scroller.style.transform = '';

    const notes = {
      changed: callout(scene, { x: changed_line.r + 14, y: changed_line.cy, text: 'You changed this source', side: 'right', color: 'amber' }),
      one: callout(scene, { x: changed_box.cx, y: changed_box.b + 6, text: '1 changed source', side: 'down', color: 'amber', length: 40 }),
      seven: callout(scene, { x: dependent_box.cx, y: dependent_box.y - 6, text: '+ 7 objects that depend on it', side: 'up', length: 34 }),
      order: callout(scene, { x: levels.r + 16, y: levels.cy, text: 'In build order, level by level', side: 'right', length: 70 }),
      logs: callout(scene, { x: buttons.cx, y: buttons.y + 3, text: 'Joblog, spool file and errors of every command', side: 'up', length: 44, shift: -150 }),
      problems: callout(scene, { x: problem.r + 14, y: problem.cy, text: 'Compile errors land in the Problems view', side: 'right', color: 'red', length: 60 }),
    };

    const cursor = new UI.Cursor(scene, 1380, 820);
    const press = (button, at) => tl.cls(button, 'pressed', at, at + 0.25);


    // ================================================================ A: Show changes
    show_head(tl, heads[0], t0 + 0.25);
    tl.to(win, { opacity: [0, 1], translate: ['0 70px', '0 0'], scale: [0.975, 1] }, t0 + 0.7, 1.0);

    show_callout(tl, notes.changed, t0 + 2.0);
    hide_callout(tl, notes.changed, t0 + 3.7);

    // Click "Show build list"
    cursor.show(tl, t0 + 3.3);
    const at_list = cursor.move(tl, q('[data-btn=list]'), t0 + 3.4, 0.9);
    cursor.click(tl, at_list + 0.05);
    press(q('[data-btn=list]'), at_list + 0.1);
    const opened = at_list + 1.0;
    tl.cls(ctl, 'running', at_list + 0.15, opened);

    // The build summary opens next to the source
    tl.cls(q('[data-tab=source]'), 'active', -1, opened);
    tl.cls(q('[data-tab=summary]'), 'active', opened);
    tl.to(q('[data-tab=summary]'), { opacity: [0, 1] }, opened, 0.2);
    tl.to(q('.code'), { opacity: [1, 0] }, opened, 0.2, { ease: 'soft' });
    tl.to(q('.summary'), { opacity: [0, 1] }, opened, 0.3, { ease: 'soft' });
    fx.up(tl, scroller.children, opened + 0.05, { gap: 0.05, y: 14, dur: 0.6 });
    cursor.move(tl, { x: 1500, y: 900 }, opened + 0.1, 0.8);
    cursor.hide(tl, opened + 0.7);

    show_callout(tl, notes.one, opened + 1.0);
    show_callout(tl, notes.seven, opened + 1.6);
    hide_callout(tl, notes.one, opened + 3.4);
    hide_callout(tl, notes.seven, opened + 3.4);

    // Down to the details: the levels
    const scrolled = opened + 3.5;
    tl.to(scroller, { transform: ['translateY(0)', `translateY(${-scroll_details}px)`] }, scrolled, 0.9, { ease: 'inOut' });
    show_callout(tl, notes.order, scrolled + 1.0);


    // ================================================================ B: Run build
    const B = t0 + 11.0;
    hide_head(tl, heads[0], B - 0.35);
    show_head(tl, heads[1], B);
    hide_callout(tl, notes.order, B + 0.5);

    cursor.show(tl, B + 0.5);
    const at_run = cursor.move(tl, q('[data-btn=run]'), B + 0.6, 0.9);
    cursor.click(tl, at_run + 0.05);
    press(q('[data-btn=run]'), at_run + 0.1);
    cursor.move(tl, { x: 1500, y: 900 }, at_run + 0.5, 0.8);
    cursor.hide(tl, at_run + 1.1);

    // The results arrive: all built but one
    const results = at_run + 1.9;
    const RESULT = { testsqlerr: 'failed' };
    UI.built().forEach((item, index) => {
      const badge = q(`[data-st=${item.key}]`);
      const status = RESULT[item.key] ?? 'success';
      const at = results + index * 0.12;
      tl.text(badge, status, at);
      tl.cls(badge, status, at);
      fx.flash(tl, badge, at, status === 'failed' ? 'rgba(248,113,113,.7)' : 'rgba(74,222,128,.55)');
    });
    const finished = results + 8 * 0.12 + 0.1;
    tl.cls(ctl, 'running', at_run + 0.15, finished);
    UI.states(tl, obi_status, [[0, 'idle'], [at_list + 0.15, 'changes'], [opened, 'idle'], [at_run + 0.15, 'build'], [finished, 'failed']]);

    tl.text(q('.status-errors'), '2', finished);

    // The failed source shows its commands; more room for them without the side bar
    tl.cls(failed_cmds, 'open', finished + 0.1);
    tl.to(side, { width: [`${SIDE}px`, '0px'] }, finished + 0.2, 0.7, { ease: 'inOut' });
    tl.to(scroller, { transform: [`translateY(${-scroll_details}px)`, `translateY(${-scroll_failed}px)`] }, finished + 0.2, 0.7, { ease: 'inOut' });
    fx.flash(tl, q('[data-src=testsqlerr] .cmd-table'), finished + 0.9, 'rgba(248,113,113,.5)');

    show_callout(tl, notes.logs, finished + 1.2);
    hide_callout(tl, notes.logs, finished + 3.3);

    tl.to(panel, { translate: ['0 100%', '0 0'] }, finished + 3.3, 0.6);
    tl.to(scroller, { transform: [`translateY(${-scroll_failed}px)`, `translateY(${-scroll_problems}px)`] }, finished + 3.3, 0.6);
    show_callout(tl, notes.problems, finished + 4.1);
  },
});
