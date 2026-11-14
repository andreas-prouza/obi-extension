'use strict';
// i-Releaser: a build becomes a deployment. First the idea, then how it looks in VS Code.

window.SCENES.push({
  id: 'release',
  dur: 17.4,
  chapter: 'Release',

  build(tl, scene, t0) {
    const UI = window.UI;
    const { html, icon, rect, fx, head, show_head, callout, show_callout, hide_callout, PROJECT, LOGO } = UI;
    const ZOOM = 1.35;
    const VIOLET = '#a78bfa', GREEN = '#4ade80', GREY = '#47566f';

    const head_el = head({
      cls: 'violet',
      eyebrow: 'i-Releaser',
      title: 'From build to release.',
      sub: 'Start an <em>i-Releaser</em> workflow from the build summary and follow every stage live — without leaving VS Code.',
    });
    scene.append(head_el);
    show_head(tl, head_el, t0 + 0.25);


    // ================================================================ the idea
    const STAGES = ['START', 'TEST', 'PROD'];
    const strip = html(`
      <div class="release-strip">
        <div class="node-card obi-card" style="left:195px">${LOGO}<b>OBI</b><span>Build OK · 8 objects</span></div>
        <div class="release-link">
          <svg viewBox="0 0 210 130"><line x1="16" y1="68" x2="190" y2="68" pathLength="1"/><path class="tip" d="M178 57 L192 68 L178 79"/></svg>
          <div class="link-label">build list</div>
          <i class="pkt violet" style="left:16px; top:68px"></i>
        </div>
        <div class="node-card release-card">
          <div class="release-name">${icon('rocket')}<b>i-Releaser</b><span>Deploys what was built</span></div>
          <div class="pipeline">
            ${STAGES.map((name, index) => `
              ${index > 0 ? '<div class="stage-line"><i></i></div>' : ''}
              <div class="stage"><div class="stage-dot">${icon('check')}<i class="stage-arc"></i></div><b>${name}</b><span>new</span></div>`).join('')}
          </div>
        </div>
        <div class="release-note">A workflow takes the objects of the build through its stages — <b>each stage runs its steps on IBM i</b>.</div>
      </div>`);
    scene.append(strip);
    const sq = selector => strip.querySelector(selector);
    const stage_elements = [...strip.querySelectorAll('.stage')];
    const stage_lines = [...strip.querySelectorAll('.stage-line i')];

    fx.pop(tl, sq('.obi-card'), t0 + 0.9, { from: 0.85 });
    tl.to(sq('.release-card'), { opacity: [0, 1], translate: ['-70px 0', '0 0'] }, t0 + 1.2, 0.8);
    tl.to(sq('.release-link line'), { strokeDasharray: [1, 1], strokeDashoffset: [1, 0], opacity: [0, 1] }, t0 + 1.5, 0.5, { ease: 'inOut' });
    fx.in(tl, [sq('.release-link .tip'), sq('.release-link .link-label')], t0 + 1.9, { dur: 0.3 });
    tl.to(sq('.pkt'), { opacity: [0, 1, 1, 0], translate: ['0 0', '26px 0', '130px 0', '152px 0'], offset: [0, 0.15, 0.85, 1] }, t0 + 2.1, 0.7, { ease: 'linear' });
    fx.in(tl, sq('.release-note'), t0 + 2.2, { dur: 0.6 });

    // The stages run one after the other
    let at = t0 + 2.8;
    stage_elements.forEach((stage, index) => {
      const dot = stage.querySelector('.stage-dot');
      const arc = stage.querySelector('.stage-arc');
      const label = stage.querySelector('span');
      const finished = at + 0.7;
      tl.text(label, 'in process', at);
      tl.to(arc, { opacity: [0, 1, 1, 0], rotate: ['0deg', '120deg', '600deg', '720deg'], offset: [0, 0.15, 0.85, 1] }, at, 0.75, { ease: 'linear' });
      tl.text(label, 'finished', finished);
      tl.to(label, { color: ['#8d9eb9', GREEN] }, finished, 0.3);
      tl.to(dot, { borderColor: [GREY, GREEN], backgroundColor: ['#0b1322', GREEN], boxShadow: ['0 0 0 rgba(74,222,128,0)', '0 0 30px rgba(74,222,128,.45)'] }, finished, 0.35);
      fx.pop(tl, dot.querySelector('.codicon'), finished, { from: 0.3, dur: 0.4 });
      if (index < stage_lines.length)
        tl.to(stage_lines[index], { scale: ['0 1', '1 1'] }, finished, 0.35, { ease: 'inOut' });
      at = finished + 0.1;
    });

    const W = t0 + 5.8;
    tl.to(strip, { opacity: [1, 0], translate: ['0 0', '0 -30px'] }, W - 0.5, 0.45, { ease: 'inOut' });


    // ================================================================ in VS Code
    const STATE_ICON = { new: 'circle-outline', ready: 'play-circle', in_process: 'sync spin', finished: 'pass passed' };
    const state_of = status => ({ finished: 'finished', 'in process': 'in_process', ready: 'ready' }[status] ?? 'new');
    const badge_class = status => ({ finished: 'success', 'in process': 'in_process' }[status] ?? 'new');

    /** A row of the i-Releaser view; its icon and description follow the status (see set_status) */
    const ir_row = ({ id, depth, open, label, status, suffix = '', run = false }) => `
      <div class="row" style="--depth:${depth}" data-row="${id}" data-state="${state_of(status)}" ${run ? 'data-run' : ''}>
        ${open === undefined ? '<i class="twistie-gap"></i>' : icon(open ? 'chevron-down' : 'chevron-right', 'twistie')}
        <span class="state-icons">${Object.entries(STATE_ICON).map(([state, glyph]) => `<i class="codicon codicon-${glyph} row-icon" data-i="${state}"></i>`).join('')}</span>
        <span class="row-label">${label}</span><span class="row-desc"><span data-status>${status}</span>${suffix}</span>
        ${run ? `<span class="row-actions">${icon('play')}</span>` : ''}
      </div>`;

    const deployment_rows = `
      <div data-new-deployment>
        ${ir_row({ id: 'deployment', depth: 0, open: true, label: `${PROJECT.deployment} · ${PROJECT.workflow}`, status: 'in process' })}
        ${ir_row({ id: 'start', depth: 1, open: true, label: 'START', status: 'in process' })}
        ${ir_row({ id: 'start-step', depth: 2, label: 'save objects', status: 'in process', suffix: ' · SAVLIB LIB(PROUZAT1)' })}
        ${ir_row({ id: 'test', depth: 1, open: true, label: 'TEST', status: 'new' })}
        ${ir_row({ id: 'test-step-1', depth: 2, label: 'restore objects', status: 'new' })}
        ${ir_row({ id: 'test-step-2', depth: 2, label: 'run tests', status: 'new', suffix: ' · CALL PGM(TEST)' })}
        ${ir_row({ id: 'prod', depth: 1, label: 'PROD', status: 'new', run: true })}
      </div>
      ${ir_row({ id: 'old-1', depth: 0, open: false, label: `41 · ${PROJECT.workflow}`, status: 'finished' })}
      ${ir_row({ id: 'old-2', depth: 0, open: false, label: `40 · ${PROJECT.workflow}`, status: 'finished' })}`;

    const win = UI.vscode_window({
      zoom: ZOOM, width: 1640, height: 768, side: 318,
      panes: UI.controller_pane() + UI.filters_pane({ collapsed: true }) + UI.history_pane() + UI.releaser_pane({ collapsed: false, body: deployment_rows }),
      tabs: [{ label: 'logger.sqlrpgle.srvpgm', icon: 'file-code' }, { label: 'Build summary', active: true }],
      editor: UI.summary_page({ done: true, created: `${PROJECT.day}T10:40:12.118Z` }),
      overlays: UI.quick_pick({
        title: `Start i-Releaser workflow (${PROJECT.releaser})`, placeholder: 'Workflow for this build list',
        items: [{ label: PROJECT.workflow, desc: 'Default workflow' }, { label: `${PROJECT.workflow} Test` }],
      }) + UI.toast({ kind: 'info', text: `i-Releaser deployment ${PROJECT.deployment}: stage <span data-stage-name>START</span> finished.`, button: 'Open' }),
      status: UI.status_bar('ok'),
    });
    win.style.left = '140px';
    win.style.top = '268px';
    scene.append(win);
    UI.spin(tl, win);

    const q = selector => win.querySelector(selector);
    const summary = q('.summary');
    const quick = q('.quick');
    const toast = q('.toast');
    const new_deployment = q('[data-new-deployment]');

    // Positions in the layout after the start (status lines and the new deployment are there)
    summary.classList.add('deployed');
    const stages_line = rect(q('.ir-stages'));
    const prod_action = rect(q('[data-row=prod]'));
    summary.classList.remove('deployed');
    const notes = {
      live: callout(scene, { x: stages_line.x + 372 * ZOOM, y: stages_line.cy - 12, text: 'Live status of the deployment', side: 'right', color: 'violet', length: 56 }),
      run: callout(scene, { x: prod_action.r - 6, y: prod_action.cy, text: 'Run the next stage — right from VS Code', side: 'right', color: 'violet', length: 56 }),
    };

    tl.to(win, { opacity: [0, 1], translate: ['0 70px', '0 0'], scale: [0.975, 1] }, W - 0.2, 0.9);

    // Start the workflow
    const cursor = new UI.Cursor(scene, 1420, 760);
    cursor.show(tl, W + 0.9);
    const at_button = cursor.move(tl, q('[data-btn=start-workflow]'), W + 1.0, 0.8);
    cursor.click(tl, at_button + 0.05);
    tl.cls(q('[data-btn=start-workflow]'), 'pressed', at_button + 0.1, at_button + 0.35);

    const picking = at_button + 0.3;
    tl.to(quick, { opacity: [0, 1], translate: ['0 -10px', '0 0'] }, picking, 0.25);
    const at_item = cursor.move(tl, q('.quick-item'), picking + 0.45, 0.55, { dx: 40 });
    cursor.click(tl, at_item + 0.2);
    const started = at_item + 0.45;
    tl.to(quick, { opacity: [1, 0] }, started, 0.15, { ease: 'soft' });
    cursor.move(tl, { x: 1560, y: 880 }, started + 0.1, 0.8);
    cursor.hide(tl, started + 0.6);

    // The deployment exists: status in the build summary, a new entry in the i-Releaser view
    tl.cls(summary, 'deployed', started + 0.15);
    tl.when(started + 0.15, on => { new_deployment.style.display = on ? '' : 'none'; });
    fx.flash(tl, q('.ir-status'), started + 0.2, 'rgba(167,139,250,.5)');
    fx.flash(tl, q('[data-row=deployment]'), started + 0.2, 'rgba(167,139,250,.5)');
    show_callout(tl, notes.live, started + 0.9);

    // What i-Releaser reports over time: [seconds after the start, row, status]
    const start_done = started + 2.3;
    const test_half = started + 3.3;
    const test_done = started + 4.3;
    const REPORTS = [
      [start_done, 'start-step', 'finished'], [start_done, 'start', 'finished'],
      [start_done, 'test', 'in process'], [start_done, 'test-step-1', 'in process'],
      [test_half, 'test-step-1', 'finished'], [test_half, 'test-step-2', 'in process'],
      [test_done, 'test-step-2', 'finished'], [test_done, 'test', 'finished'], [test_done, 'prod', 'ready'],
    ];
    for (const id of [...new Set(REPORTS.map(report => report[1]))]) {
      const tree_row = q(`[data-row=${id}]`);
      const reports = REPORTS.filter(report => report[1] === id);
      UI.states(tl, tree_row, [[0, tree_row.dataset.state], ...reports.map(([time, , status]) => [time, state_of(status)])]);
      reports.forEach(([time, , status]) => tl.text(tree_row.querySelector('[data-status]'), status, time));
    }
    // The same in the build summary
    const badge = (key, steps) => {
      const element = q(`[data-st=${key}]`);
      steps.forEach(([time, status], index) => {
        tl.when(index === 0 ? -Infinity : time, on => {
          if (on) {
            element.textContent = status;
            element.className = `st ${badge_class(status)}`;
          }
        }, steps[index + 1]?.[0] ?? Infinity);
        if (index > 0)
          fx.flash(tl, element, time, status === 'finished' ? 'rgba(74,222,128,.55)' : 'rgba(0,153,255,.5)');
      });
    };
    badge('stage-start', [[0, 'in process'], [start_done, 'finished']]);
    badge('stage-test', [[0, 'new'], [start_done, 'in process'], [test_done, 'finished']]);
    badge('stage-prod', [[0, 'new'], [test_done, 'ready']]);
    tl.text(q('.ir-updated'), '10:41:19', start_done).text(q('.ir-updated'), '10:41:42', test_done);

    // A notification for each finished stage
    tl.to(toast, { opacity: [0, 1], translate: ['0 24px', '0 0'] }, start_done + 0.15, 0.35);
    tl.text(q('[data-stage-name]'), 'TEST', test_done + 0.15);
    tl.to(toast, { scale: [1, 1.03, 1] }, test_done + 0.15, 0.35, { ease: 'soft' });

    hide_callout(tl, notes.live, test_done + 0.2);
    show_callout(tl, notes.run, test_done + 0.7);
    fx.flash(tl, q('[data-row=prod]'), test_done + 0.1, 'rgba(167,139,250,.5)');
  },
});
