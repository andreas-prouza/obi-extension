'use strict';
// Show changes: find the changed source, add everything that depends on it, build level by level.

window.SCENES.push({
  id: 'changes',
  dur: 16.4,
  chapter: 'Changes',

  build(tl, scene, t0) {
    const { html, head, show_head, hide_head, icon, source, fx } = window.UI;

    const CHIP_W = 392, CHIP_H = 58;
    // The sources as a grid (all of them), then as a graph (only what gets built)
    const GRID = [
      ['hello', 'testlog', 'file1', 'testlog2'],
      ['date', 'logger', 'testcl', 'testsqlerr'],
      ['errhdlsql', 'cpysrc2ifs', 'errhdlsqlp', 'testmod'],
    ];
    const grid_at = (col, row) => ({ x: 143 + col * 414, y: 462 + row * 88 });

    const COLUMN_X = [150, 764, 1378];
    const MIDDLE = 676;
    const LEVELS = [['logger'], ['testlog', 'testmod', 'errhdlsql', 'date'], ['testlog2', 'testsqlerr', 'errhdlsqlp']];
    const graph = {};
    LEVELS.forEach((keys, level) => keys.forEach((key, index) => {
      graph[key] = { x: COLUMN_X[level], y: MIDDLE + (index - (keys.length - 1) / 2) * 92 - CHIP_H / 2, level };
    }));
    const EDGES = [
      ['logger', 'testlog'], ['logger', 'testmod'], ['logger', 'errhdlsql'], ['logger', 'date'],
      ['testmod', 'testlog2'], ['errhdlsql', 'testsqlerr'], ['errhdlsql', 'errhdlsqlp'], ['date', 'errhdlsqlp'],
    ];
    const HASHES = ['a41f9c', '7d03be', 'e85a12', '3c9f70', 'b2d641', '5b70e3', '91ac0f', 'f04d27', '68e1b9', 'c7325a', '2ef8d4', '0b96a1'];

    const edge_path = ([from, to]) => {
      const a = graph[from], b = graph[to];
      const x1 = a.x + CHIP_W, y1 = a.y + CHIP_H / 2, x2 = b.x, y2 = b.y + CHIP_H / 2;
      return `M${x1} ${y1} C${x1 + 120} ${y1} ${x2 - 120} ${y2} ${x2} ${y2}`;
    };

    const heads = [
      head({ eyebrow: 'Show changes', title: 'Finds what changed', sub: 'OBI keeps a hash of every source it has built. Only what differs is built again.' }),
      head({ eyebrow: 'Show changes', title: '…and everything that depends on it', sub: 'A changed service program or table pulls in every object that uses it.' }),
      head({ eyebrow: 'Run build', title: 'Builds it all in the right order', sub: 'Level by level — so a service program is ready before the programs that use it.' }),
    ];
    scene.append(...heads);

    const chips = {};
    let index = 0;
    const holder = html('<div></div>');
    GRID.forEach((row, row_index) => row.forEach((key, col) => {
      const at = grid_at(col, row_index);
      const chip = html(`
        <div class="chip" style="transform:translate(${at.x}px, ${at.y}px)">
          <i class="chip-dot"></i><span class="chip-name">${source(key).name}</span>
          <span class="chip-hash">${HASHES[index++]}</span><span class="chip-tag">changed</span>${icon('check', 'chip-check')}<i class="chip-ring"></i>
        </div>`);
      chips[key] = { element: chip, at, col, order: row_index * 4 + col };
      holder.append(chip);
    }));

    scene.append(html(`<svg class="edges" viewBox="0 0 1920 1080">${EDGES.map(edge => `<path d="${edge_path(edge)}" pathLength="1"/>`).join('')}</svg>`));
    scene.append(holder);
    scene.append(html('<div class="scan"></div>'));
    const pulses = EDGES.map(edge => {
      const pulse = html(`<i class="pulse" style="offset-path:path('${edge_path(edge)}'); offset-rotate:0deg"></i>`);
      scene.append(pulse);
      return pulse;
    });
    LEVELS.forEach((_, level) => scene.append(html(`<div class="level-label" style="left:${COLUMN_X[level]}px">Level ${level + 1}</div>`)));
    scene.append(html('<div class="skip-note">4 unchanged sources that nothing changed depends on are skipped</div>'));
    scene.append(html(`
      <div class="progress">
        <div class="progress-text"><span class="progress-label">Building on IBM i …</span><span class="progress-count">0 / 8</span></div>
        <div class="progress-track"><div class="progress-fill"></div></div>
      </div>`));

    const q = selector => scene.querySelector(selector);
    const all = selector => [...scene.querySelectorAll(selector)];
    const edge_elements = all('.edges path');
    const LINE = 'rgba(130,165,225,.24)', CYAN = '#2bd4ee', AMBER = '#f6b03c', GREEN = '#4ade80', GREY = '#5d6d88';

    // ----- 1: finds what changed
    show_head(tl, heads[0], t0 + 0.25);
    for (const chip of Object.values(chips))
      tl.to(chip.element, { opacity: [0, 1], scale: [0.92, 1] }, t0 + 0.8 + chip.order * 0.045, 0.6);

    const SCAN_AT = t0 + 1.9, SCAN_DUR = 1.7, SCAN_FROM = 130, SCAN_TO = 1800;
    tl.to(q('.scan'), { opacity: [0, 1, 1, 0], transform: [`translateX(${SCAN_FROM}px)`, `translateX(${SCAN_FROM + 80}px)`, `translateX(${SCAN_TO - 80}px)`, `translateX(${SCAN_TO}px)`], offset: [0, 0.05, 0.95, 1] }, SCAN_AT, SCAN_DUR, { ease: 'linear' });

    for (const [key, chip] of Object.entries(chips)) {
      const passed = SCAN_AT + (chip.at.x + CHIP_W * 0.75 - SCAN_FROM) / (SCAN_TO - SCAN_FROM) * SCAN_DUR;
      const hash = chip.element.querySelector('.chip-hash');
      if (key === 'logger') {
        tl.to(chip.element, { borderColor: [LINE, AMBER], boxShadow: ['0 12px 30px rgba(0,0,0,.35)', '0 12px 30px rgba(0,0,0,.35), 0 0 34px rgba(246,176,60,.45)'] }, passed, 0.35);
        tl.to(chip.element.querySelector('.chip-dot'), { backgroundColor: [GREY, AMBER] }, passed, 0.35);
        tl.to(hash, { opacity: [1, 0] }, passed, 0.2);
        fx.pop(tl, chip.element.querySelector('.chip-tag'), passed + 0.1, { dur: 0.45 });
        tl.to(chip.element.querySelector('.chip-ring'), [{ opacity: 0, scale: 1, offset: 0 }, { opacity: 0.9, scale: 1, offset: 0.1 }, { opacity: 0, scale: '1.14 1.7', offset: 1 }], passed + 0.1, 0.9);
      }
      else {
        // Same hash as at the last build: nothing to do
        tl.to(hash, { color: [GREY, CYAN, GREY], offset: [0, 0.25, 1] }, passed, 0.7, { ease: 'soft' });
        tl.to(chip.element, { opacity: [1, 0.5] }, passed + 0.25, 0.5, { ease: 'soft' });
      }
    }

    // ----- 2: what depends on it
    const B = t0 + 4.8;
    hide_head(tl, heads[0], B - 0.35);
    show_head(tl, heads[1], B);

    for (const [key, chip] of Object.entries(chips)) {
      const target = graph[key];
      if (!target) {
        tl.to(chip.element, { opacity: [0.5, 0], translate: ['0 0', '0 18px'] }, B + 0.1 + chip.col * 0.05, 0.5, { ease: 'inOut' });
        continue;
      }
      const moved = B + 0.45 + target.level * 0.08;
      tl.to(chip.element, { transform: [`translate(${chip.at.x}px, ${chip.at.y}px)`, `translate(${target.x}px, ${target.y}px)`] }, moved, 1.0, { ease: 'inOut' });
      tl.to(chip.element.querySelector('.chip-hash'), { opacity: [1, 0] }, moved, 0.4);
      if (key !== 'logger') {
        // Reached by an edge: it has to be built as well
        const reached = B + (target.level === 1 ? 2.0 : 2.75) + LEVELS[target.level].indexOf(key) * 0.07;
        tl.to(chip.element, { opacity: [0.5, 1], borderColor: [LINE, CYAN] }, reached, 0.4);
        tl.to(chip.element.querySelector('.chip-dot'), { backgroundColor: [GREY, CYAN] }, reached, 0.4);
      }
    }
    fx.in(tl, q('.skip-note'), B + 0.5, { dur: 0.6 });
    edge_elements.forEach((edge, edge_index) => {
      const second = edge_index >= 4;
      tl.to(edge, { strokeDashoffset: [1, 0] }, B + (second ? 2.35 : 1.6) + (edge_index % 4) * 0.06, 0.55, { ease: 'inOut' });
    });

    // ----- 3: builds in the right order
    const C = t0 + 9.1;
    hide_head(tl, heads[1], C - 0.35);
    show_head(tl, heads[2], C);
    tl.to(q('.skip-note'), { opacity: [1, 0] }, C - 0.4, 0.4, { ease: 'soft' });
    fx.up(tl, all('.level-label'), C + 0.3, { gap: 0.1, y: 14 });
    fx.up(tl, q('.progress'), C + 0.5, { y: 18 });

    let done = 0;
    const count = q('.progress-count');
    const fill = q('.progress-fill');
    const build_chip = (key, start, finish) => {
      const chip = chips[key].element;
      const dot = chip.querySelector('.chip-dot');
      // Working: the dot pulses
      tl.to(dot, { scale: [1, 1.7, 1, 1.7, 1] }, start, finish - start, { ease: 'inOut' });
      tl.to(chip, { borderColor: [key === 'logger' ? AMBER : CYAN, GREEN], boxShadow: ['0 12px 30px rgba(0,0,0,.35)', '0 12px 30px rgba(0,0,0,.35), 0 0 30px rgba(74,222,128,.32)'] }, finish, 0.35);
      tl.to(dot, { backgroundColor: [key === 'logger' ? AMBER : CYAN, GREEN] }, finish, 0.35);
      if (key === 'logger')
        tl.to(chip.querySelector('.chip-tag'), { opacity: [1, 0] }, finish - 0.1, 0.25);
      fx.pop(tl, chip.querySelector('.chip-check'), finish, { dur: 0.45, from: 0.3 });
      done++;
      tl.text(count, `${done} / 8`, finish);
      tl.to(fill, { scale: [`${(done - 1) / 8} 1`, `${done / 8} 1`] }, finish, 0.35);
    };
    const run_edges = (from, to, at) => {
      for (let i = from; i < to; i++) {
        tl.to(pulses[i], { opacity: [0, 1, 1, 0], offsetDistance: ['0%', '15%', '85%', '100%'], offset: [0, 0.15, 0.85, 1] }, at + (i - from) * 0.05, 0.55, { ease: 'inOut' });
        tl.to(edge_elements[i], { stroke: [CYAN, GREEN] }, at + 0.3, 0.4);
      }
    };

    build_chip('logger', C + 1.1, C + 1.8);
    run_edges(0, 4, C + 1.85);
    LEVELS[1].forEach((key, i) => build_chip(key, C + 2.4, C + 3.0 + i * 0.17));
    run_edges(4, 8, C + 3.6);
    LEVELS[2].forEach((key, i) => build_chip(key, C + 4.15, C + 4.75 + i * 0.2));

    const finished = C + 5.3;
    tl.text(q('.progress-label'), 'Done — 8 objects built in the right order', finished);
    tl.to(q('.progress-label'), { color: ['#f1f5fb', GREEN] }, finished, 0.4);
  },
});
