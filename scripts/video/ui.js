'use strict';
// Building blocks of the scenes: animation presets, headline, cursor, callouts, and a VS Code window drawn in HTML
// (so it stays sharp at any size and its content is easy to keep up to date).

(function () {

  window.SCENES = [];

  const stage = document.getElementById('stage');

  // ---------------------------------------------------------------- basics

  function html(markup) {
    const template = document.createElement('template');
    template.innerHTML = markup.trim();
    return template.content.firstElementChild;
  }

  function esc(text) {
    return String(text).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
  }

  function icon(name, cls = '') {
    return `<i class="codicon codicon-${name} ${cls}"></i>`;
  }

  /** Position of an element in stage pixels. Only valid while the scenes are built (the stage is not scaled then). */
  function rect(element) {
    const base = stage.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    const x = box.left - base.left;
    const y = box.top - base.top;
    return { x, y, w: box.width, h: box.height, cx: x + box.width / 2, cy: y + box.height / 2, r: x + box.width, b: y + box.height };
  }

  const LOGO = `
    <svg class="logo" viewBox="0 0 117 128" aria-hidden="true">
      <defs>
        <linearGradient id="logo-handle" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#22A9C4"/><stop offset="1" stop-color="#15849B"/>
        </linearGradient>
        <linearGradient id="logo-head" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#3A6CBF"/><stop offset="1" stop-color="#2A5294"/>
        </linearGradient>
      </defs>
      <rect class="logo-handle" x="42" y="0" width="33" height="128" rx="7" fill="url(#logo-handle)"/>
      <g class="logo-head">
        <rect x="28" y="4" width="61" height="48" rx="6" fill="#81FFFF"/>
        <rect x="0.5" y="8" width="116" height="40" rx="8" fill="url(#logo-head)"/>
      </g>
    </svg>`;


  // ---------------------------------------------------------------- animation presets

  const fx = {
    up(tl, target, at, { dur = 0.75, y = 28, gap = 0 } = {}) {
      tl.stagger(target, { opacity: [0, 1], translate: [`0 ${y}px`, '0 0'] }, at, dur, gap, { ease: 'out' });
    },
    in(tl, target, at, { dur = 0.5, gap = 0 } = {}) {
      tl.stagger(target, { opacity: [0, 1] }, at, dur, gap, { ease: 'soft' });
    },
    out(tl, target, at, { dur = 0.4, y = -16, gap = 0 } = {}) {
      tl.stagger(target, { opacity: [1, 0], translate: ['0 0', `0 ${y}px`] }, at, dur, gap, { ease: 'inOut' });
    },
    pop(tl, target, at, { dur = 0.55, from = 0.8, gap = 0 } = {}) {
      tl.stagger(target, { opacity: [0, 1], scale: [from, 1] }, at, dur, gap, { ease: 'back' });
    },
    /** A short highlight on something that just changed */
    flash(tl, target, at, color = 'rgba(43,212,238,.55)') {
      tl.to(target, { boxShadow: [`0 0 0 0 ${color}`, `0 0 0 6px ${color}`, '0 0 0 12px rgba(0,0,0,0)'] }, at, 0.7, { ease: 'soft' });
    },
  };


  // ---------------------------------------------------------------- headline

  function head({ eyebrow, title, sub = '', cls = '' }) {
    return html(`
      <div class="head ${cls}">
        <div class="eyebrow">${eyebrow}</div>
        <div class="title">${title}</div>
        ${sub ? `<div class="sub">${sub}</div>` : ''}
      </div>`);
  }

  function show_head(tl, element, at) {
    fx.up(tl, element.children, at, { gap: 0.09, y: 22 });
  }

  function hide_head(tl, element, at) {
    fx.out(tl, element.children, at, { gap: 0.03 });
  }


  // ---------------------------------------------------------------- cursor

  class Cursor {

    constructor(scene, x, y) {
      this.element = html(`
        <div class="cursor">
          <div class="cursor-ripple"></div>
          <svg class="cursor-arrow" viewBox="0 0 24 24"><path d="M4 2.5 L4 20 L8.6 15.8 L11.6 22.4 L14.6 21 L11.7 14.6 L18 14.4 Z"/></svg>
        </div>`);
      scene.append(this.element);
      this.x = x;
      this.y = y;
      this.element.style.transform = `translate(${x}px, ${y}px)`;
    }

    show(tl, at) {
      fx.in(tl, this.element, at, { dur: 0.3 });
      return this;
    }

    hide(tl, at) {
      tl.to(this.element, { opacity: [1, 0] }, at, 0.3, { ease: 'soft' });
      return this;
    }

    /** Moves the tip to the middle of `target` (element or {x, y}); returns the time of arrival. */
    move(tl, target, at, dur = 0.8, { dx = 0, dy = 0 } = {}) {
      const box = target instanceof Element ? rect(target) : { cx: target.x, cy: target.y };
      const x = box.cx + dx;
      const y = box.cy + dy;
      tl.to(this.element, { transform: [`translate(${this.x}px, ${this.y}px)`, `translate(${x}px, ${y}px)`] }, at, dur, { ease: 'inOut' });
      this.x = x;
      this.y = y;
      return at + dur;
    }

    click(tl, at) {
      tl.to(this.element.querySelector('.cursor-arrow'), { scale: [1, 0.8, 1] }, at, 0.3, { ease: 'soft' });
      tl.to(this.element.querySelector('.cursor-ripple'), [
        { opacity: 0, scale: 0.2, offset: 0 }, { opacity: 0.7, scale: 0.5, offset: 0.2 }, { opacity: 0, scale: 1.7, offset: 1 },
      ], at, 0.6, { ease: 'soft' });
      return at + 0.3;
    }
  }


  // ---------------------------------------------------------------- callout

  /**
   * A label pointing at (x, y) in stage pixels. `side` is where the label sits relative to the point.
   * Returns the element; show it with show_callout.
   */
  function callout(scene, { x, y, text, side = 'right', length = 46, color = '', shift = 0 }) {
    // shift: moves the label along the edge it hangs on (for labels near the border of the picture)
    const element = html(`
      <div class="callout callout-${side} ${color}" style="left:${x}px; top:${y}px; --length:${length}px; --shift:${shift}px">
        <span class="callout-dot"></span><span class="callout-line"></span><span class="callout-tag">${text}</span>
      </div>`);
    scene.append(element);
    return element;
  }

  function show_callout(tl, element, at) {
    const vertical = element.classList.contains('callout-up') || element.classList.contains('callout-down');
    tl.to(element.querySelector('.callout-dot'), { opacity: [0, 1], scale: [0, 1] }, at, 0.4, { ease: 'back' });
    tl.to(element.querySelector('.callout-line'), { opacity: [0, 1], scale: vertical ? ['1 0', '1 1'] : ['0 1', '1 1'] }, at + 0.1, 0.35);
    tl.to(element.querySelector('.callout-tag'), { opacity: [0, 1], scale: [0.9, 1] }, at + 0.28, 0.45, { ease: 'back' });
  }

  function hide_callout(tl, element, at) {
    tl.to(element, { opacity: [1, 0] }, at, 0.3, { ease: 'soft' });
  }


  // ---------------------------------------------------------------- background and chapter marks

  function background(tl, duration) {
    tl.to('#bg .g1', { translate: ['0 0', '-150px 90px'] }, 0, duration, { ease: 'linear' });
    tl.to('#bg .g2', { translate: ['0 0', '170px -80px'] }, 0, duration, { ease: 'linear' });
    tl.to('#bg .g3', { translate: ['0 0', '-120px -60px'] }, 0, duration, { ease: 'linear' });
  }

  /** Small marks at the top right: which part of the video is running */
  function chapters(tl, list) {
    if (list.length === 0)
      return;
    const holder = document.getElementById('chapters');
    holder.innerHTML = `${LOGO}${list.map(() => '<span class="chapter"><i></i></span>').join('')}`;
    const marks = [...holder.querySelectorAll('.chapter i')];
    list.forEach((chapter, index) => {
      tl.to(marks[index], { scale: ['0 1', '1 1'] }, chapter.start, chapter.end - chapter.start, { ease: 'linear' });
    });
    tl.to(holder, { opacity: [0, 1] }, list[0].start + 0.3, 0.6);
    tl.to(holder, { opacity: [1, 0] }, list[list.length - 1].end - 0.2, 0.5);
  }


  // ---------------------------------------------------------------- sample project shown in the video

  const LIB = 'prouzalib';

  /** file: source file (folder), name: member, text: description, level: build level (0 = not part of the build) */
  const SOURCES = [
    { key: 'logger', file: 'qrpglesrc', name: 'logger.sqlrpgle.srvpgm', text: 'Logger service', level: 1, cmds: 5 },
    { key: 'testlog', file: 'qrpglesrc', name: 'testlog.rpgle.pgm', text: 'Test for logger', level: 2, cmds: 3 },
    { key: 'testmod', file: 'qrpglesrc', name: 'testmod.rpgle.srvpgm', text: 'Test module', level: 2, cmds: 5 },
    { key: 'errhdlsql', file: 'qrpglesrc', name: 'errhdlsql.sqlrpgle.srvpgm', text: 'SQL error handler', level: 2, cmds: 5 },
    { key: 'date', file: 'qrpglesrc', name: 'date.sqlrpgle.srvpgm', text: 'Date functions', level: 2, cmds: 5 },
    { key: 'testlog2', file: 'qrpglesrc', name: 'testlog2.sqlrpgle.pgm', text: 'Test for logger (SQL)', level: 3, cmds: 3 },
    { key: 'testsqlerr', file: 'qrpglesrc', name: 'testsqlerr.sqlrpgle.pgm', text: 'Test SQL errors', level: 3, cmds: 3 },
    { key: 'errhdlsqlp', file: 'qrpglesrc', name: 'errhdlsqlp.sqlrpgle.pgm', text: 'Test for SQL error handler', level: 3, cmds: 3 },
    { key: 'hello', file: 'qrpglesrc', name: 'hello.rpgle.pgm', text: 'Hello world', level: 0 },
    { key: 'cpysrc2ifs', file: 'qrpglesrc', name: 'cpysrc2ifs.sqlrpgle.pgm', text: 'Copy source members to the IFS', level: 0 },
    { key: 'testcl', file: 'qcllesrc', name: 'testcl.clle.pgm', text: 'Test CL program', level: 0 },
    { key: 'file1', file: 'qddssrc', name: 'file1.pf.file', text: 'Test PF file', level: 0 },
  ];

  const source = key => SOURCES.find(item => item.key === key);
  const built = () => SOURCES.filter(item => item.level > 0);

  const PROJECT = {
    name: 'my-erp',
    host: 'my-ibmi.example.com',
    user: 'developer',
    remote_dir: '/home/developer/my-erp',
    releaser: 'https://ireleaser.example.com',
    workflow: 'Deploy OBI Build',
    deployment: 42,
    day: '2026-11-13',
  };


  // ---------------------------------------------------------------- VS Code: window

  const ACTIVITY = ['files', 'search', 'source-control', 'debug-alt', 'extensions', 'code'];

  /**
   * A VS Code window. Sizes are those of VS Code (13px font); `zoom` enlarges it for the video.
   * panes: HTML of the side bar views; tabs: [{ label, icon?, active?, id? }]; editor: HTML; overlays: HTML above everything.
   */
  function vscode_window({ zoom = 1.35, width, height, side = 280, panes = '', tabs = [], editor = '', panel = '', overlays = '', status = '' }) {
    return html(`
      <div class="win"><div class="vsc" style="zoom:${zoom}; width:${width / zoom}px; height:${height / zoom}px; --side:${side}px">
        <div class="vsc-title">
          <span class="vsc-dots"><i></i><i></i><i></i></span>
          <span class="vsc-center">${icon('search')}<span>${PROJECT.name}</span></span>
          <span class="vsc-layout">${icon('layout-sidebar-left')}${icon('layout-panel')}${icon('layout-sidebar-right-off')}</span>
        </div>
        <div class="vsc-body">
          <div class="vsc-activity">
            ${ACTIVITY.map(name => `<span class="${name === 'code' ? 'active' : ''}">${icon(name)}</span>`).join('')}
            <span class="spacer"></span><span>${icon('account')}</span><span>${icon('settings-gear')}</span>
          </div>
          <div class="vsc-side"><div class="vsc-side-inner">
            <div class="vsc-side-title"><span>Object Builder for i</span>${icon('ellipsis')}</div>
            ${panes}
          </div></div>
          <div class="vsc-main">
            <div class="vsc-tabs">${tabs.map(tab_html).join('')}</div>
            <div class="vsc-editor">${editor}</div>
            ${panel}
          </div>
        </div>
        <div class="vsc-status">${status}</div>
        ${overlays}
      </div></div>`);
  }

  function tab_html(tab) {
    return `<span class="vsc-tab ${tab.active ? 'active' : ''}" ${tab.id ? `data-tab="${tab.id}"` : ''}>${tab.icon ? icon(tab.icon, 'tab-icon') : ''}<span>${esc(tab.label)}</span>${icon('close', 'tab-close')}</span>`;
  }

  /** The status bar item of OBI in all the states the video shows; `data-state` picks one (see states). */
  const OBI_STATUS = `
    <span data-s="idle">${icon('server-environment')}default</span>
    <span data-s="changes">${icon('sync', 'spin')}Show changes…</span>
    <span data-s="build">${icon('sync', 'spin')}Run build…</span>
    <span data-s="failed">${icon('server-environment')}default&nbsp;&nbsp;${icon('error')}1 failed</span>
    <span data-s="ok">${icon('server-environment')}default&nbsp;&nbsp;${icon('check')}10:40</span>`;

  function status_bar(state = 'idle') {
    return `
      <span class="status-item">${icon('git-branch')}main</span>
      <span class="status-item">${icon('sync')}</span>
      <span class="status-item">${icon('error')}<span class="status-errors">0</span> ${icon('warning')}0</span>
      <span class="status-item status-obi" data-state="${state}">${OBI_STATUS}</span>
      <span class="spacer"></span>
      <span class="status-item">UTF-8</span>
      <span class="status-item">LF</span>
      <span class="status-item">${icon('bell')}</span>`;
  }

  /** Sets `data-state` of `element` over time. steps: [[seconds, state], ...] in ascending order; the first one also applies before. */
  function states(tl, element, steps) {
    steps.forEach(([at, state], index) => {
      const from = index === 0 ? -Infinity : at;
      const until = index + 1 < steps.length ? steps[index + 1][0] : Infinity;
      tl.when(from, on => { if (on) element.dataset.state = state; }, until);
    });
  }

  /** Icons that turn in VS Code (sync~spin, the progress ring) */
  function spin(tl, scope) {
    tl.to(scope.querySelectorAll('.spin'), { rotate: ['0deg', '360deg'] }, 0, 1.4, { ease: 'linear', loop: true });
    // The progress bar of the OBI Build view (a CSS animation in the extension)
    tl.to(scope.querySelectorAll('.run-bar i'), { transform: ['translateX(-100%)', 'translateX(290%)'] }, 0, 1.4, { ease: 'inOut', loop: true });
  }


  // ---------------------------------------------------------------- VS Code: side bar

  function pane({ id, name, actions = [], body = '', collapsed = false }) {
    return `
      <div class="pane ${collapsed ? 'collapsed' : ''}" data-pane="${id}">
        <div class="pane-head">
          ${icon('chevron-down', 'twistie')}<span class="pane-name">${name}</span>
          <span class="pane-actions">${actions.map(action => icon(action)).join('')}</span>
        </div>
        <div class="pane-body">${body}</div>
      </div>`;
  }

  /** depth: indentation; open: true/false for a folder, undefined for a leaf */
  function row({ depth = 0, open, glyph, color = '', label, desc = '', actions = [], cls = '', id = '' }) {
    const twistie = open === undefined ? '<i class="twistie-gap"></i>' : icon(open ? 'chevron-down' : 'chevron-right', 'twistie');
    return `
      <div class="row ${cls}" style="--depth:${depth}" ${id ? `data-row="${id}"` : ''}>
        ${twistie}${glyph ? icon(glyph, `row-icon ${color}`) : ''}
        <span class="row-label">${esc(label)}</span>${desc ? `<span class="row-desc">${esc(desc)}</span>` : ''}
        ${actions.length ? `<span class="row-actions">${actions.map(action => icon(action)).join('')}</span>` : ''}
      </div>`;
  }

  /**
   * The OBI Build view (asserts/templates/controller/index.html): what to build, Run build / Show changes, while
   * something runs its name, time and Cancel (class `is-running` on .view-body, see run_clock), the profile, the last build.
   * last: { kind: 'failed' | 'success', text }
   */
  function controller_pane({ run_all = true, profile = 'Default User Config', current = 'logger.sqlrpgle.srvpgm', last = null } = {}) {
    const option = (value, glyph, label) =>
      `<span class="seg-option" data-value="${value}" aria-checked="${(value === 'all') === run_all}">${icon(glyph)}${label}</span>`;
    return pane({
      id: 'controller', name: 'OBI Build', actions: ['extensions', 'symbol-class', 'rocket', 'globe', 'settings-gear'],
      body: `
        <div class="view-body">
          <div class="seg" data-value="${run_all ? 'all' : 'single'}">${option('single', 'file', 'Current source')}${option('all', 'files', 'All changes')}</div>
          <div class="current-source">${icon('file-code')}<span>${esc(current)}</span></div>
          <div class="view-actions">
            <span class="btn full" data-btn="run">${icon('run-all')}Run build</span>
            <span class="btn secondary full" data-btn="list">${icon('checklist')}Show changes</span>
          </div>
          <div class="run-box">
            <div class="run-line">${icon('sync', 'spin')}<span class="run-label">Show changes</span><span class="spacer"></span><span class="obi-muted run-time">0:00</span></div>
            <div class="run-bar"><i></i></div>
            <span class="btn secondary full">${icon('debug-stop')}Cancel</span>
          </div>
          <div class="view-caption">Use profile</div>
          <div class="profile-row">
            <span class="obi-select dropdown" data-btn="profile"><span class="dropdown-value">${esc(profile)}</span>${icon('chevron-down')}</span>
            <span class="icon-btn">${icon('add')}</span>
            <span class="icon-btn">${icon('trash')}</span>
          </div>
          <div class="last-build" ${last ? '' : 'hidden'}>
            ${icon(last?.kind === 'failed' ? 'error' : 'pass', last?.kind === 'failed' ? 'obi-failed' : 'obi-passed')}
            <span class="last-text">${esc(last?.text ?? '')}</span><span class="spacer"></span><a>Open</a>
          </div>
        </div>`,
    });
  }

  /** Something runs in the OBI Build view from `from` to `to`: its name, the elapsed time, the progress bar */
  function run_clock(tl, view, from, to, label) {
    tl.cls(view, 'is-running', from, to);
    tl.text(view.querySelector('.run-label'), label, from);
    const time = view.querySelector('.run-time');
    for (let second = 0; from + second < to; second++)
      tl.text(time, `0:${String(second).padStart(2, '0')}`, from + second);
  }

  /** The Source filters view. `members`: keys of the sources shown under the first filter. */
  function filters_pane({ members = ['logger', 'testlog', 'testmod', 'errhdlsql', 'date'], collapsed = false, selected = '' } = {}) {
    const rows = [
      row({ depth: 0, open: true, glyph: 'filter', label: 'All sources', id: 'filter-all' }),
      row({ depth: 1, open: true, label: LIB }),
      row({ depth: 2, open: false, label: 'qcllesrc' }),
      row({ depth: 2, open: true, label: 'qrpglesrc' }),
      ...members.map(key => row({
        depth: 3, glyph: 'file-code', label: source(key).name, desc: source(key).text, id: `src-${key}`, cls: key === selected ? 'selected' : '',
      })),
      row({ depth: 0, open: false, glyph: 'filter', label: 'Logger', id: 'filter-logger' }),
    ];
    return pane({
      id: 'filters', name: 'Source filters', collapsed,
      actions: ['search', 'add', 'open-preview', 'settings-gear', 'refresh'], body: rows.join(''),
    });
  }

  function history_pane({ collapsed = true, body = '' } = {}) {
    return pane({ id: 'history', name: 'Build history', collapsed, actions: ['search', 'references', 'clear-all'], body });
  }

  function releaser_pane({ collapsed = true, body = '' } = {}) {
    return pane({ id: 'releaser', name: 'i-Releaser', collapsed, actions: ['refresh', 'rocket', 'globe'], body });
  }


  // ---------------------------------------------------------------- VS Code: editor contents

  /** A source in the editor. lines: HTML per line (use the spans k = keyword, s = string, c = comment, v = variable, n = number). */
  function code_editor(lines, { changed = [] } = {}) {
    return `
      <div class="code">
        ${lines.map((line, index) => `
          <div class="code-line ${changed.includes(index + 1) ? 'changed' : ''}"><span class="code-no">${index + 1}</span><span class="code-text">${line || '&nbsp;'}</span></div>`).join('')}
      </div>`;
  }

  const LOGGER_SOURCE = [
    '<span class="k">**free</span>',
    '<span class="k">ctl-opt</span> nomain;',
    '',
    '<span class="c">// Writes a message to the log table</span>',
    '<span class="k">dcl-proc</span> <span class="f">log_info</span> <span class="k">export</span>;',
    '  <span class="k">dcl-pi</span> *n;',
    '    <span class="v">message</span> <span class="t">varchar</span>(<span class="n">256</span>) <span class="k">const</span>;',
    '    <span class="v">job_name</span> <span class="t">char</span>(<span class="n">28</span>) <span class="k">const options</span>(*nopass);',
    '  <span class="k">end-pi</span>;',
    '',
    '  <span class="k">exec sql</span>',
    '    <span class="k">insert into</span> logtbl (level, message, job, created)',
    '    <span class="k">values</span> (<span class="s">\'INFO\'</span>, :<span class="v">message</span>, :<span class="v">job_name</span>, <span class="k">current timestamp</span>);',
    '',
    '<span class="k">end-proc</span>;',
  ];

  /** A status pill of the build summary; `key` names it for the scenes (data-st) */
  const status_pill = (status, key = '') => `<span class="status-pill ${status.replace(' ', '_')}" ${key ? `data-st="${key}"` : ''}>${status}</span>`;

  /** The result of each source after the build the video shows (testsqlerr fails, unless `done`) */
  const result_of = (item, done) => (!done && item.key === 'testsqlerr' ? 'failed' : 'success');

  /** Counts as icon + number, like the header and the level rows of the build summary */
  function counts_html({ failed = 0, success = 0, open = 0 }, pills = false) {
    const part = (count, cls, glyph, label) => {
      if (!count)
        return '';
      return pills
        ? `<span class="status-pill ${cls}">${icon(glyph)}${count} ${label}</span>`
        : `<span class="obi-${cls === 'new' ? 'muted' : cls === 'success' ? 'passed' : 'failed'}">${icon(glyph)}${count}</span>`;
    };
    return part(failed, 'failed', 'error', 'failed') + part(success, 'success', 'pass', 'built') + part(open, 'new', 'circle-large-outline', 'to build');
  }

  /**
   * The build summary (asserts/templates/show_changes/index.html).
   * Before the build all sources are "new"; class `built` on .summary shows the counts after it (the scene changes the pills).
   * done: all succeeded; the page then offers the i-Releaser workflow instead of "Run build" and has the deployment card
   * (shown with class `deployed`, see ir_card).
   */
  function summary_page({ done = false, created = '11/13/2026, 9:40:12 AM' } = {}) {
    const items = built();
    const after = list => ({
      failed: list.filter(item => result_of(item, done) === 'failed').length,
      success: list.filter(item => result_of(item, done) === 'success').length,
    });
    const tile_item = item => `<li>${icon('file-code')}<a><span class="path-lib">${LIB}/${item.file}/</span>${item.name}</a></li>`;
    const changed = items.filter(item => item.key === 'logger');
    const dependent = items.filter(item => item.key !== 'logger');
    const tile = (id, glyph, label, list) => `
      <div class="tile" data-tile="${id}">
        <div class="tile-head">${icon(glyph)}${label}</div>
        <div class="tile-count">${list.length}</div>
        <ul class="tile-list">${list.slice(0, 3).map(tile_item).join('')}</ul>
        ${list.length > 3 ? `<div class="tile-more">+ ${list.length - 3} more</div>` : ''}
      </div>`;
    const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

    const levels = [1, 2, 3].map(level => {
      const sources = items.filter(item => item.level === level);
      return `
        <tr class="level-row" data-level="${level}"><td colspan="4">
          <div class="level-head">${icon('chevron-down', 'toggle-icon')}<span class="lvl-name">${level}. level</span>
            <span class="obi-muted">· ${plural(sources.length, 'object')}</span><span class="spacer"></span>
            <span class="level-sum before">${counts_html(done ? after(sources) : { open: sources.length })}</span>
            <span class="level-sum after">${counts_html(after(sources))}</span>
          </div>
        </td></tr>
        ${sources.map(item => `
          <tr class="src-row" data-src="${item.key}">
            <td class="col-check"><input type="checkbox" class="obi-check" checked></td>
            <td><span class="object">${icon('file-code')}<a><span class="path-lib">${LIB} / ${item.file} / </span><b>${item.name}</b></a></span></td>
            <td class="col-status">${status_pill(done ? 'success' : 'new', item.key)}</td>
            <td class="col-cmds"><span class="cmds-toggle">${item.cmds} commands${icon('chevron-right')}</span></td>
          </tr>
          ${item.key === 'testsqlerr' && !done ? failed_commands() : ''}`).join('')}`;
    }).join('');

    return `
      <div class="summary${done ? ' built' : ''}">
        <div class="summary-scroll">
          <div class="page-header">
            <h1>Build summary</h1>
            <span class="pills before">${counts_html(done ? after(items) : { open: items.length }, true)}</span>
            <span class="pills after">${counts_html(after(items), true)}</span>
            <span class="spacer"></span>
            <div class="page-actions">
              ${done
                ? `<span class="btn" data-btn="start-workflow">${icon('rocket')}Start i-Releaser workflow</span>`
                : `<span class="btn" data-btn="run-build">${icon('run-all')}Run build</span>`}
              <span class="btn secondary">${icon('add')}Add source</span>
              <span class="icon-btn">${icon('json')}</span>
              <span class="icon-btn">${icon('output')}</span>
            </div>
          </div>
          <div class="page-meta">
            <span>${icon('history')}${created}</span>
            <span>${icon('remote')}${PROJECT.user}@${PROJECT.host}</span>
            <span>${icon('folder')}${PROJECT.remote_dir}</span>
            <span>${icon('git-branch')}main · ${done ? '7c41e0b' : '3f9c2a1'}</span>
          </div>
          ${done ? ir_card() : ''}
          <div class="tiles">
            ${tile('new', 'diff-added', 'New sources', [])}
            ${tile('changed', 'diff-modified', 'Changed sources', changed)}
            ${tile('dependent', 'references', 'Dependent objects', dependent)}
          </div>
          <div class="section-head"><h2>Build list</h2><span class="obi-muted">${plural(items.length, 'object')} · 3 levels</span></div>
          <table class="build-list">
            <thead><tr><th class="col-check"></th><th>object</th><th class="col-status">status</th><th class="col-cmds">commands</th></tr></thead>
            <tbody>${levels}</tbody>
          </table>
        </div>
      </div>`;
  }

  /** The commands of the source that fails in the video; the scene opens them (class `open`) once the build ran */
  function failed_commands() {
    const ICON = { success: 'pass obi-passed', failed: 'error obi-failed', new: 'circle-large-outline obi-muted' };
    const BUTTON = { Joblog: 'list-flat', Spool: 'file-text', Error: 'error' };
    const cmd = (time, status, text, buttons, code = '') => `
      <div class="cmd${status === 'failed' ? ' is-failed' : ''}">
        <input type="checkbox" class="obi-check" checked>
        <details class="cmd-details" ${code ? 'open' : ''}>
          <summary><i class="codicon codicon-${ICON[status]}"></i><span class="cmd-time">${time}</span><code class="cmd-text">${text}</code></summary>
          ${code ? `<div class="cmd-code"><span class="icon-btn cmd-copy">${icon('copy')}</span>${code}</div>` : ''}
        </details>
        <div class="cmd-actions"><span class="icon-btn">${icon('edit')}</span>${buttons.map(name => `<span class="btn secondary small" data-btn="${name.toLowerCase()}">${icon(BUTTON[name])}${name}</span>`).join('')}</div>
      </div>`;
    return `
      <tr class="cmds-row is-failed" data-cmds="testsqlerr"><td colspan="4">
        ${cmd('09:41:26.358', 'success', "CHGATR OBJ('src/prouzalib/qrpglesrc/testsqlerr.sqlrpgle.pgm') ATR(*CCSID) VALUE(1208)", ['Joblog'])}
        ${cmd('09:41:27.698', 'failed', 'liblist -a prouzat1 ; CRTSQLRPGI OBJ(PROUZAT1/TESTSQLERR) SRCSTMF(...)', ['Joblog', 'Spool', 'Error'],
          "liblist -a prouzat1\nCRTSQLRPGI OBJ(PROUZAT1/TESTSQLERR) SRCSTMF('src/prouzalib/qrpglesrc/testsqlerr.sqlrpgle.pgm') OBJTYPE(*PGM)")}
        ${cmd('not run', 'new', 'liblist -a prouzat1 ; CRTPGM PGM(PROUZAT1/TESTSQLERR)', [])}
      </td></tr>`;
  }


  // ---------------------------------------------------------------- i-Releaser deployment card of the build summary

  const IR_STAGES = ['START', 'TEST', 'PROD'];
  /** The kinds of a stage (StatusKind of src/shared/IReleaserDeployments.ts) and the icon in its dot */
  const IR_DOT = { running: icon('sync', 'spin'), finished: icon('check'), ready: icon('play'), failed: icon('close') };

  /** Hidden until the summary has class `deployed`; the attention line needs class `attention` on the card */
  function ir_card() {
    return `
      <div class="ir-card">
        <div class="ir-head">
          ${icon('rocket')}<span class="ir-title">i-Releaser deployment ${PROJECT.deployment}</span>
          <span class="ir-meta">${PROJECT.workflow} · version ${PROJECT.deployment}</span>
          <span class="status-pill ir-running">${icon('sync', 'spin')}in process</span>
          <span class="ir-spacer"></span>
          <span class="ir-meta">updated <span class="ir-updated">10:41:07</span></span>
          <a class="ir-open">${icon('link-external')}Open in i-Releaser</a>
        </div>
        <div class="ir-progress"><div class="ir-progress-bar" style="width:0%"></div></div>
        <ol class="ir-stages">
          ${IR_STAGES.map((name, index) => `
            <li class="ir-stage ir-${index === 0 ? 'running' : 'new'}" data-stage="${name.toLowerCase()}">
              <span class="ir-dot"><b class="dot-no">${index + 1}</b>${Object.entries(IR_DOT).map(([kind, glyph]) => `<span class="dot-${kind}">${glyph}</span>`).join('')}</span>
              <span class="ir-name">${name}</span><span class="ir-state">${index === 0 ? 'in process' : 'new'}</span>
            </li>`).join('')}
        </ol>
        <div class="ir-attention ir-ready">
          ${icon('play-circle')}<span class="ir-attention-text">Stage PROD is ready to run.</span><span class="ir-spacer"></span>
          <span class="ir-action btn" data-btn="run-stage">${icon('play')}Run stage</span>
        </div>
      </div>`;
  }

  /** Sets kind and status of a stage of the card over time. steps: [[seconds, kind, status], ...] ascending */
  function ir_stage(tl, card, name, steps) {
    const stage = card.querySelector(`[data-stage=${name}]`);
    const next = stage.nextElementSibling;
    const label = stage.querySelector('.ir-state');
    steps.forEach(([at, kind, status], index) => {
      const from = index === 0 ? -Infinity : at;
      const until = index + 1 < steps.length ? steps[index + 1][0] : Infinity;
      tl.cls(stage, `ir-${kind}`, from, until);
      if (next && kind === 'finished')
        tl.cls(next, 'ir-after-finished', from, until);
      tl.text(label, status, from === -Infinity ? -1e9 : at);
    });
    // The class of the page (ir-running / ir-new) stays out of the way of the timeline
    stage.className = 'ir-stage';
  }

  /** The Problems view below the editor */
  function problems_panel() {
    const problem = (text, code, position) => `
      <div class="row" style="--depth:1"><i class="twistie-gap"></i>${icon('error', 'row-icon failed')}
        <span class="row-label">${text}</span><span class="row-desc">IBM i compiler(${code}) [${position}]</span></div>`;
    return `
      <div class="vsc-panel">
        <div class="panel-tabs">
          <span class="active">Problems<b>2</b></span><span>Output</span><span>Debug Console</span><span>Terminal</span><span>Ports</span>
          <span class="spacer"></span>${icon('filter')}${icon('collapse-all')}${icon('chevron-up')}${icon('close')}
        </div>
        <div class="panel-body">
          <div class="row" style="--depth:0">${icon('chevron-down', 'twistie')}${icon('file-code', 'row-icon')}
            <span class="row-label">testsqlerr.sqlrpgle.pgm</span><span class="row-desc">src/${LIB}/qrpglesrc</span><b class="count">2</b></div>
          ${problem('The name or indicator SQLSTAT is not defined.', 'RNF7030', 'Ln 27, Col 8')}
          ${problem('Compilation stopped. Severity 30 errors found in program.', 'RNF7086', 'Ln 1, Col 1')}
        </div>
      </div>`;
  }

  /** Quick pick at the top of the window. items: [{ label (HTML), desc? }] */
  function quick_pick({ title = '', value = '', placeholder = '', items, id = 'pick' }) {
    return `
      <div class="quick" data-quick="${id}">
        ${title ? `<div class="quick-title">${esc(title)}</div>` : ''}
        <div class="quick-input"><span class="quick-value">${esc(value)}</span><span class="caret"></span><span class="quick-placeholder">${esc(placeholder)}</span></div>
        <div class="quick-list">
          ${items.map((item, index) => `<div class="quick-item ${index === 0 ? 'focus' : ''}"><span class="quick-label">${item.label}</span>${item.desc ? `<span class="quick-desc">${esc(item.desc)}</span>` : ''}</div>`).join('')}
        </div>
      </div>`;
  }

  /** Notification at the bottom right */
  function toast({ kind = 'info', text, button = '', id = 'toast' }) {
    return `
      <div class="toast" data-toast="${id}">
        <div class="toast-text">${icon(kind, `toast-icon ${kind}`)}<span>${text}</span>${icon('close')}</div>
        ${button ? `<div class="toast-foot"><span>Source: Object Builder for IBM i (OBI)</span><span class="vbtn text small">${button}</span></div>` : ''}
      </div>`;
  }


  window.UI = {
    html, esc, icon, rect, fx, head, show_head, hide_head, Cursor, callout, show_callout, hide_callout, background, chapters,
    LOGO, LIB, SOURCES, PROJECT, source, built,
    vscode_window, status_bar, states, spin, pane, row, controller_pane, run_clock, filters_pane, history_pane, releaser_pane,
    code_editor, LOGGER_SOURCE, status_pill, summary_page, ir_stage, problems_panel, quick_pick, toast,
  };

})();
