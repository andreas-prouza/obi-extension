'use strict';
// The concept: sources live on the PC and in git, IBM i only builds.

window.SCENES.push({
  id: 'concept',
  dur: 9.3,
  chapter: 'Concept',

  build(tl, scene, t0) {
    const { html, head, show_head, LOGO, fx } = window.UI;

    const svg = body => `<svg viewBox="0 0 24 24">${body}</svg>`;
    const GIT = svg('<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>');
    const PC = svg('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M1 20h22"/><path d="M10 8l-2 2 2 2M14 8l2 2-2 2"/>');
    const IBMI = svg('<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><line x1="7" y1="6.5" x2="7.01" y2="6.5"/><line x1="7" y1="17.5" x2="7.01" y2="17.5"/>');

    const card = (id, x, glyph, name, text) => `
      <div class="node-card" data-card="${id}" style="left:${x}px">${glyph}<b>${name}</b><span>${text}</span><div class="node-glow"></div></div>`;

    // Two lanes: the upper one runs to the right, the lower one to the left
    const lanes = (top, bottom) => `
      <svg viewBox="0 0 270 130">
        <g class="${top}"><line class="lane" x1="16" y1="52" x2="250" y2="52" pathLength="1"/><path class="tip" d="M238 41 L252 52 L238 63"/></g>
        <g class="${bottom}"><line class="lane" x1="254" y1="84" x2="20" y2="84" pathLength="1"/><path class="tip" d="M32 73 L18 84 L32 95"/></g>
      </svg>`;

    const head_el = head({
      eyebrow: 'The concept',
      title: 'Work locally. Build on IBM i.',
      sub: 'Your sources live on your PC and in git. OBI sends them to IBM i only to build them — and brings the results back.',
    });
    scene.append(head_el);

    scene.append(html(`
      <div>
        ${card('git', 195, GIT, 'git', 'Shared with your team')}
        ${card('pc', 795, PC, 'Your PC', 'You edit sources in VS Code')}
        ${card('ibmi', 1395, IBMI, 'IBM i', 'Compiles in the IFS')}

        <div class="link" data-link="git" style="left:525px">
          ${lanes('cyan', 'cyan')}
          <div class="link-label top cyan" style="color:var(--cyan)">push / pull</div>
          ${[0, 1].map(() => '<i class="pkt cyan" data-lane="top" style="left:16px; top:52px"></i>').join('')}
          ${[0, 1].map(() => '<i class="pkt cyan back" data-lane="bottom" style="left:228px; top:84px"></i>').join('')}
        </div>

        <div class="link" data-link="ibmi" style="left:1125px">
          ${lanes('amber', 'green')}
          <div class="link-label top" style="color:var(--amber)">sources · ssh</div>
          <div class="link-label bottom" style="color:var(--green)">results</div>
          ${[0, 1, 2].map(() => '<i class="pkt amber" data-lane="top" style="left:16px; top:52px"></i>').join('')}
          ${[0, 1, 2].map(() => '<i class="pkt green" data-lane="bottom" style="left:228px; top:84px"></i>').join('')}
        </div>

        <div class="obi-tag">${LOGO}<span>OBI</span></div>

        <div class="steps">
          <div class="step"><i>1</i>Edit your sources locally</div>
          <div class="step"><i>2</i>OBI transfers what changed</div>
          <div class="step"><i>3</i>IBM i compiles</div>
          <div class="step"><i>4</i>Results come back</div>
        </div>
      </div>`));

    const q = selector => scene.querySelector(selector);
    const all = selector => [...scene.querySelectorAll(selector)];

    show_head(tl, head_el, t0 + 0.25);

    // The PC first, then git and IBM i from the sides
    fx.pop(tl, q('[data-card=pc]'), t0 + 0.9, { from: 0.85 });
    tl.to(q('[data-card=git]'), { opacity: [0, 1], translate: ['90px 0', '0 0'] }, t0 + 1.25, 0.8);
    tl.to(q('[data-card=ibmi]'), { opacity: [0, 1], translate: ['-90px 0', '0 0'] }, t0 + 1.4, 0.8);
    tl.stagger(all('.link .lane'), { strokeDashoffset: [1, 0], strokeDasharray: [1, 1], opacity: [0, 1] }, t0 + 1.7, 0.6, 0.1, { ease: 'inOut' });
    tl.stagger(all('.link .tip'), { opacity: [0, 1] }, t0 + 2.15, 0.3, 0.1);
    fx.in(tl, all('.link-label'), t0 + 2.1, { gap: 0.1 });
    fx.pop(tl, q('.obi-tag'), t0 + 2.3);
    fx.up(tl, all('.step'), t0 + 2.5, { gap: 0.1, y: 20 });

    // git: packets run both ways for the rest of the scene
    all('[data-link=git] .pkt').forEach((packet, index) => {
      const back = packet.dataset.lane === 'bottom';
      tl.to(packet, { opacity: [0, 1, 1, 0], translate: back ? ['0 0', '-30px 0', '-180px 0', '-212px 0'] : ['0 0', '30px 0', '180px 0', '212px 0'], offset: [0, 0.15, 0.85, 1] },
        t0 + 2.9 + (index % 2) * 0.9 + (back ? 0.45 : 0), 1.8, { ease: 'linear', loop: true });
    });

    // The four steps, one after the other
    const steps = all('.step');
    const light = (index, at, color) => {
      tl.to(steps[index], { borderColor: ['rgba(130,165,225,.16)', color], color: ['#8d9eb9', '#f1f5fb'], backgroundColor: ['rgba(11,19,34,.8)', 'rgba(16,30,54,.95)'] }, at, 0.4, { ease: 'soft' });
      tl.to(steps[index].querySelector('i'), { color: ['#8d9eb9', color] }, at, 0.4, { ease: 'soft' });
    };
    const glow = (id, at, dur, color) => {
      const element = q(`[data-card=${id}] .node-glow`);
      element.style.setProperty('--c', color);
      tl.to(element, { opacity: [0, 1, 1, 0], offset: [0, 0.2, 0.7, 1] }, at, dur, { ease: 'soft' });
    };
    const send = (selector, at, distance) => {
      tl.stagger(all(selector), { opacity: [0, 1, 1, 0], translate: ['0 0', `${distance * 0.15}px 0`, `${distance * 0.85}px 0`, `${distance}px 0`], offset: [0, 0.15, 0.85, 1] }, at, 0.9, 0.22, { ease: 'linear' });
    };

    const CYAN = '#2bd4ee', AMBER = '#f6b03c', GREEN = '#4ade80';
    light(0, t0 + 3.2, CYAN);
    glow('pc', t0 + 3.2, 1.0, CYAN);

    light(1, t0 + 4.2, AMBER);
    send('[data-link=ibmi] .pkt.amber', t0 + 4.2, 212);

    light(2, t0 + 5.4, CYAN);
    glow('ibmi', t0 + 5.3, 1.2, CYAN);

    light(3, t0 + 6.5, GREEN);
    send('[data-link=ibmi] .pkt.green', t0 + 6.5, -212);
    glow('pc', t0 + 7.3, 1.2, GREEN);
  },
});
