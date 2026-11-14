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

  /** The OBI Build view: what to build, the two buttons, the profile */
  function controller_pane({ run_all = true, profile = 'Default User Config' } = {}) {
    return pane({
      id: 'controller', name: 'OBI Build', actions: ['extensions', 'symbol-class', 'rocket', 'globe', 'settings-gear'],
      body: `
        <div class="ctl">
          <div class="ctl-radios">
            <span class="radio ${run_all ? '' : 'on'}"></span><span>*CURRENT</span>
            <span class="radio ${run_all ? 'on' : ''}"></span><span>*ALL</span>
          </div>
          <div class="ctl-buttons">
            <span class="vbtn wide" data-btn="run">${icon('run-all')}</span>
            <span class="vbtn wide" data-btn="list">${icon('checklist')}</span>
            <span class="ctl-ring">${icon('loading', 'spin')}</span>
          </div>
          <div class="ctl-label">Use profile</div>
          <div class="ctl-profile">
            <span class="dropdown" data-btn="profile"><span class="dropdown-value">${esc(profile)}</span>${icon('chevron-down')}</span>
            <span class="vbtn square">${icon('trash')}</span>
            <span class="vbtn square">${icon('add')}</span>
          </div>
        </div>`,
    });
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

  const status_badge = (status, key = '') => `<span class="st ${status.replace(' ', '_')}" ${key ? `data-st="${key}"` : ''}>${status}</span>`;

  /**
   * The build summary page (asserts/templates/show_changes/index.html).
   * done: all commands succeeded (the page then offers the i-Releaser workflow instead of "Run build").
   */
  function summary_page({ done = false, created = `${PROJECT.day}T09:40:12.433Z` } = {}) {
    const status = done ? 'success' : 'new';
    const link = item => `<li><a>${LIB}/${item.file}/${item.name}</a></li>`;
    const changed = SOURCES.filter(item => item.key === 'logger');
    const dependent = built().filter(item => item.key !== 'logger');

    const levels = [1, 2, 3].map(level => `
      <tr class="lvl" data-level="${level}"><th colspan="4"><span class="tri">▼</span>&nbsp;${level}. level</th></tr>
      ${SOURCES.filter(item => item.level === level).map(item => `
        <tr class="src" data-src="${item.key}">
          <td><span class="check on">${icon('check')}</span></td>
          <td><a>${LIB} / ${item.file} / ${item.name}</a></td>
          <td>${status_badge(status, item.key)}</td>
          <td class="cmds">
            <div class="cmds-summary"><span class="tri">▶</span> ${item.cmds} commands</div>
            ${item.key === 'testsqlerr' ? failed_commands() : ''}
          </td>
        </tr>`).join('')}`).join('');

    return `
      <div class="summary">
        <div class="summary-scroll">
          <div class="sum-top">
            <span>Created at <b><u>${created}</u></b></span>
            <a>open JSON file</a>
            <a>open OBI log</a>
            ${done
              ? `<span class="vbtn text" data-btn="start-workflow">${icon('rocket')}Start i-Releaser workflow</span><a class="sum-deployment">i-Releaser deployment ${PROJECT.deployment}</a>`
              : '<span class="vbtn text" data-btn="run-build">Run build</span>'}
          </div>
          ${done ? `
          <div class="ir-status">
            <div>${icon('rocket')} i-Releaser deployment ${PROJECT.deployment} · version ${PROJECT.deployment}: ${status_badge('in process', 'deployment')} <small>(updated <span class="ir-updated">10:41:07</span>)</small></div>
            <div class="ir-stages">START ${status_badge('in process', 'stage-start')} &nbsp;→&nbsp; TEST ${status_badge('new', 'stage-test')} &nbsp;→&nbsp; PROD ${status_badge('new', 'stage-prod')}</div>
          </div>` : ''}
          <div><span class="vbtn text">${icon('add')}Add source</span></div>
          <hr>
          <div class="sum-grid">
            <div><h6><span class="tri">▼</span> 0 New sources</h6></div>
            <div data-box="changed"><h6><span class="tri">▼</span> ${changed.length} Changed sources</h6><ul>${changed.map(link).join('')}</ul></div>
            <div data-box="dependent"><h6><span class="tri">▼</span> ${dependent.length} Dependent objects</h6><ul>${dependent.map(link).join('')}</ul></div>
          </div>
          <hr>
          <h3>Details</h3>
          <div class="sum-remote">Remote host: <code>${PROJECT.user}@${PROJECT.host}</code> <span class="gap"></span> IBM i IFS path: <code>${PROJECT.remote_dir}</code></div>
          <div class="sum-divider"></div>
          <table class="sum-table">
            <thead><tr><th>level</th><th>object</th><th>status</th><th>commands</th></tr></thead>
            <tbody>${levels}</tbody>
          </table>
        </div>
      </div>`;
  }

  /** The commands of the source that fails in the video, shown once the build ran */
  function failed_commands() {
    const cmd = (time, status, text, buttons) => `
      <tr>
        <td><span class="check on">${icon('check')}</span></td>
        <td>${time}</td>
        <td>${status_badge(status)}</td>
        <td><span class="tri">▶</span> <code>${text}</code></td>
        <td class="cmd-buttons"><span class="vbtn square secondary">${icon('edit')}</span>${buttons.map(name => `<span class="vbtn text small" data-btn="${name.toLowerCase()}">${name}</span>`).join('')}</td>
      </tr>`;
    return `
      <table class="cmd-table">
        <tr><th></th><th>timestamp</th><th>status</th><th>command</th><th></th></tr>
        ${cmd('09:41:26.358', 'success', "CHGATR OBJ('src/prouzalib/qrpgle...", ['Joblog'])}
        ${cmd('09:41:27.698', 'failed', 'liblist -a prouzat1 ; CRTSQLRPGI ...', ['Joblog', 'Spool', 'Error'])}
        ${cmd('', 'new', 'liblist -a prouzat1 ; CRTPGM PGM(...', [])}
      </table>`;
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
    vscode_window, status_bar, states, spin, pane, row, controller_pane, filters_pane, history_pane, releaser_pane,
    code_editor, LOGGER_SOURCE, status_badge, summary_page, problems_panel, quick_pick, toast,
  };

})();
