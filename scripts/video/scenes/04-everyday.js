'use strict';
// Four things for the daily work: profiles, quick search, source filters, build history.

window.SCENES.push({
  id: 'everyday',
  dur: 15.0,
  chapter: 'Everyday',

  build(tl, scene, t0) {
    const UI = window.UI;
    const { html, icon, row, pane, fx, source, LIB, PROJECT } = UI;

    /** A part of the VS Code window in its own small frame */
    const part = (zoom, width, title, body, cls = '') => `
      <div class="win"><div class="vsc part ${cls}" style="zoom:${zoom}; width:${width}px">
        <div class="part-title"><span class="vsc-dots"><i></i><i></i><i></i></span>${title}</div>
        ${body}
      </div></div>`;

    const path = key => `${LIB}/${source(key).file}/${source(key).name}`;
    const mark = (text, word) => text.replace(word, `<b>${word}</b>`);

    // ----- 01 build profiles
    const profiles = part(2.5, 272, 'OBI Build', `
      ${UI.controller_pane()}
      <div class="profile-room"></div>
      <div class="vsc-status">
        <span class="status-item">${icon('git-branch')}main</span>
        <span class="status-item status-obi" data-state="idle"><span data-s="idle">${icon('server-environment')}<span class="profile-name">default</span></span></span>
      </div>`);

    // ----- 02 quick search
    const everything = ['logger', 'testlog', 'testmod', 'errhdlsql', 'date', 'testlog2', 'testsqlerr'];
    const found = ['logger', 'testlog', 'testlog2'];
    const search = part(1.7, 570, 'Source quick search', `
      <div data-list="all">${UI.quick_pick({ placeholder: 'Search for a source by name or description...', items: everything.map(key => ({ label: path(key), desc: source(key).text })) })}</div>
      <div data-list="found">${UI.quick_pick({ value: 'log', items: found.map(key => ({ label: mark(path(key), 'log'), desc: source(key).text })) })}</div>`);

    // ----- 03 source filters
    const members = ['logger', 'testlog', 'testlog2'];
    const filter_table = `
      <div class="filter-page">
        <h1>Source filter: <code>Logger</code></h1><hr>
        <table class="filter-table">
          <tr>${['source-lib', 'source-file', 'source-member', 'description'].map(name => `<th>${name}<span class="sort">▲▼</span><i></i></th>`).join('')}</tr>
          ${members.map(key => `<tr><td>${LIB}</td><td>${source(key).file}</td><td><a>${source(key).name}</a></td><td>${source(key).text}</td></tr>`).join('')}
        </table>
        <div class="filter-foot">Showing 1 to 3 of 3 rows</div>
      </div>`;
    const filter_tree = part(1.7, 330, 'Source filters', pane({
      id: 'filters', name: 'Source filters', actions: ['search', 'add', 'open-preview', 'settings-gear', 'refresh'], body: [
        row({ depth: 0, open: false, glyph: 'filter', label: 'All sources' }),
        row({ depth: 0, open: false, glyph: 'filter', label: 'Logger', cls: 'selected', actions: ['open-preview', 'settings-gear', 'trash'] }),
        row({ depth: 0, open: false, glyph: 'filter', label: 'SQL error handling' }),
      ].join(''),
    }));
    const filters = filter_tree + part(1.7, 590, 'Source filter: Logger', filter_table, 'page');

    // ----- 04 build history and timeline
    const history = part(1.7, 420, 'Build history', pane({
      id: 'history', name: 'Build history', actions: ['search', 'references', 'clear-all'], body: [
        row({ depth: 0, open: true, glyph: 'calendar', label: PROJECT.day }),
        row({ depth: 1, open: true, glyph: 'file-text', label: '10:40:12', desc: `i-Releaser ${PROJECT.deployment}` }),
        ...['logger', 'testlog', 'testmod'].map(key => row({ depth: 2, glyph: 'file-code', label: path(key) })),
        row({ depth: 1, open: false, glyph: 'file-text', label: '09:41:26' }),
        row({ depth: 0, open: false, glyph: 'calendar', label: '2026-11-12' }),
      ].join(''),
    }));
    const timeline_row = (glyph, color, label, desc, time) => `
      <div class="row" style="--depth:1">${icon(glyph, `row-icon ${color}`)}<span class="row-label">${label}</span><span class="row-desc">${desc}</span><span class="timeline-time">${time}</span></div>`;
    const timeline = part(1.7, 420, 'Timeline', pane({
      id: 'timeline', name: 'Timeline: logger.sqlrpgle.srvpgm', actions: ['pin', 'refresh', 'filter'], body: [
        timeline_row('pass', 'passed', 'Build OK', '5 commands · current version', 'now'),
        timeline_row('error', 'failed', 'Build failed', 'failed at command 2 of 5', '1 hr'),
        timeline_row('git-commit', '', 'Log the job name', 'Andreas', '2 hrs'),
        timeline_row('pass', 'passed', 'Build OK', '5 commands', '1 day'),
      ].join(''),
    }));

    const FEATURES = [
      { name: 'Build profiles', desc: 'Another user, library list or target library? Switch the profile with one click.', shot: profiles },
      { name: 'Quick search', desc: 'Find any source of the project by name or description — as you type.', shot: search },
      { name: 'Source filters', desc: 'Your own views of the project: group sources, describe them, sort and filter them in a table.', shot: filters, cls: 'stacked' },
      { name: 'Build history', desc: 'Every build is kept: by date, by source, and in the Timeline of each file.', shot: history + timeline, cls: 'stacked' },
    ];

    scene.append(html('<div class="head"><div class="eyebrow">Made for everyday IBM i work</div></div>'));
    scene.append(html(`<div class="feature-dots">${FEATURES.map(() => '<i></i>').join('')}</div>`));
    const dots = [...scene.querySelectorAll('.feature-dots i')];
    fx.in(tl, scene.querySelector('.head .eyebrow'), t0 + 0.2);
    fx.in(tl, dots, t0 + 0.4, { gap: 0.05 });

    const EACH = 3.55;
    const items = FEATURES.map((feature, index) => {
      const text = html(`
        <div class="feature-text">
          <div class="feature-no">0${index + 1}</div>
          <div class="feature-name">${feature.name}</div>
          <div class="feature-desc">${feature.desc}</div>
        </div>`);
      const shot = html(`<div class="feature-shot ${feature.cls ?? ''}">${feature.shot}</div>`);
      scene.append(text, shot);
      return { text, shot, at: t0 + 0.35 + index * EACH };
    });

    items.forEach(({ text, shot, at }, index) => {
      fx.up(tl, text.children, at, { gap: 0.08, y: 24 });
      tl.to(shot, { opacity: [0, 1], translate: ['60px 0', '0 0'], scale: [0.97, 1] }, at + 0.1, 0.8);
      tl.to(dots[index], { backgroundColor: ['rgba(150,180,230,.2)', '#2bd4ee'] }, at, 0.3);
      if (index < items.length - 1) {
        // The next one comes in while this one goes
        fx.out(tl, text.children, at + EACH - 0.3, { gap: 0.02 });
        tl.to(shot, { opacity: [1, 0], translate: ['0 0', '-40px 0'] }, at + EACH - 0.3, 0.4, { ease: 'inOut' });
        tl.to(dots[index], { backgroundColor: ['#2bd4ee', 'rgba(150,180,230,.2)'] }, at + EACH - 0.2, 0.3);
      }
    });

    // ----- 01: pick another profile
    {
      const { shot, at } = items[0];
      const dropdown = shot.querySelector('.dropdown');
      dropdown.append(html('<div class="dropdown-list"><div>Default User Config</div><div>Test system</div><div>Production</div></div>'));
      const options = [...dropdown.querySelectorAll('.dropdown-list div')];
      // The list has to be laid out to know where "Test system" is
      dropdown.classList.add('open');
      const target = UI.rect(options[1]);
      dropdown.classList.remove('open');

      const cursor = new UI.Cursor(shot, 0, 0);
      const base = UI.rect(shot);
      const local = box => ({ x: box.cx - base.x, y: box.cy - base.y });
      cursor.x = 760;
      cursor.y = 640;
      cursor.show(tl, at + 0.7);
      const opened = cursor.move(tl, local(UI.rect(dropdown)), at + 0.75, 0.6);
      cursor.click(tl, opened);
      tl.cls(dropdown, 'open', opened + 0.1, opened + 1.25);
      tl.cls(options[0], 'focus', opened + 0.1, opened + 0.75);
      tl.cls(options[1], 'focus', opened + 0.75, opened + 1.25);
      const picked = cursor.move(tl, local(target), opened + 0.35, 0.5);
      cursor.click(tl, picked + 0.3);
      tl.text(dropdown.querySelector('.dropdown-value'), 'Test system', picked + 0.4);
      tl.text(shot.querySelector('.profile-name'), 'test', picked + 0.4);
      fx.flash(tl, shot.querySelector('.status-obi'), picked + 0.45, 'rgba(43,212,238,.35)');
      cursor.hide(tl, picked + 1.0);
    }

    // ----- 03: open the table of a filter
    {
      const { shot, at } = items[2];
      const table = shot.querySelectorAll('.win')[1];
      const cursor = new UI.Cursor(shot, 0, 0);
      const base = UI.rect(shot);
      const button = UI.rect(shot.querySelector('.row.selected .codicon-open-preview'));
      cursor.x = 700;
      cursor.y = 330;
      cursor.show(tl, at + 0.5);
      const clicked = cursor.move(tl, { x: button.cx - base.x, y: button.cy - base.y }, at + 0.55, 0.6);
      cursor.click(tl, clicked);
      tl.to(table, { opacity: [0, 1], translate: ['0 -24px', '0 0'], scale: [0.97, 1] }, clicked + 0.2, 0.6);
      cursor.hide(tl, clicked + 0.9);
    }

    // ----- 02: type "log"
    {
      const { shot, at } = items[1];
      const all = shot.querySelector('[data-list=all]');
      const hits = shot.querySelector('[data-list=found]');
      const typed = at + 1.0;
      const value = all.querySelector('.quick-value');
      tl.text(value, 'l', typed).text(value, 'lo', typed + 0.22).text(value, 'log', typed + 0.44);
      tl.cls(all.querySelector('.quick'), 'typed', typed);
      tl.cls(hits.querySelector('.quick'), 'typed', -1);
      tl.when(typed + 0.44, on => {
        all.style.display = on ? 'none' : '';
        hits.style.display = on ? '' : 'none';
      });
      fx.flash(tl, hits.querySelector('.quick-item'), typed + 0.5);
    }
  },
});
