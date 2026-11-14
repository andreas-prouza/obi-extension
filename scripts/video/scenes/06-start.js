'use strict';
// Get started: backend on IBM i, initialize the project, configure the connection.

window.SCENES.push({
  id: 'start',
  dur: 10.0,
  chapter: 'Start',

  build(tl, scene, t0) {
    const UI = window.UI;
    const { html, icon, fx, head, show_head, PROJECT } = UI;
    const ZOOM = 1.5;

    const part = (title, body, cls = '') => `
      <div class="win"><div class="vsc part ${cls}" style="zoom:${ZOOM}; width:${452 / ZOOM}px; height:${322 / ZOOM}px">
        <div class="part-title"><span class="vsc-dots"><i></i><i></i><i></i></span>${title}</div>
        ${body}
      </div></div>`;

    const terminal = `
      <div class="terminal"><div class="line"><span class="prompt">$ </span><span data-type="git clone https://github.com/"></span></div><div class="line"><span data-type="    andreas-prouza/obi"></span></div><div class="line dim" data-after="0">Cloning into 'obi'...</div><div class="line"><span class="prompt">$ </span><span data-type="cd obi &amp;&amp; ./setup.sh"></span><i class="caret"></i></div><div class="line ok" data-after="1">✓ OBI backend is ready</div></div>`;

    const welcome = part('Object Builder for i', `
      <div class="welcome">
        You need to open a folder containing an OBI project:<br>
        <span class="vbtn text">Open folder</span><br>
        Or initialize your current folder with OBI:<br>
        <span class="vbtn text" data-btn="initialize">Initialize</span>
      </div>`);

    const field = (label, value, cls = '') => `<div class="field ${cls}"><label>${label}</label><div><span data-type="${value}"></span></div></div>`;
    const config = part('Configuration', `
      <div class="config-page">
        ${field('Remote host', PROJECT.host)}
        ${field('User', PROJECT.user)}
        ${field('Remote ifs path', PROJECT.remote_dir)}
      </div>`, 'page');

    const STEPS = [
      { name: 'Install the backend', desc: 'Clone OBI into the IFS of your IBM i and run its setup script.', ui: terminal },
      { name: 'Initialize the project', desc: 'Open your project folder in VS Code and click <b>Initialize</b>.', ui: welcome },
      { name: 'Configure the connection', desc: 'Remote host, user and the path in the IFS. Then: <b>Run build</b>.', ui: config },
    ];

    const head_el = head({ eyebrow: 'Get started', title: 'Up and running in three steps' });
    scene.append(head_el);
    show_head(tl, head_el, t0 + 0.25);

    const cards = STEPS.map((step, index) => {
      const card = html(`
        <div class="start-card" style="left:${140 + index * 560}px">
          <div class="start-no">${index + 1}</div>
          <div class="start-name">${step.name}</div>
          <div class="start-desc">${step.desc}</div>
          <div class="start-ui">${step.ui}</div>
        </div>`);
      scene.append(card);
      return card;
    });
    scene.append(html('<div class="start-foot">Needs SSH access to your IBM i, with bash and Python 3.12 or newer</div>'));

    /** Types the text of the data-type attribute; returns the time it is done */
    const type = (element, at, per_char = 0.035) => {
      const text = element.dataset.type;
      const dur = text.length * per_char;
      tl.each(at, dur, progress => {
        const shown = text.slice(0, Math.round(progress * text.length));
        if (element.textContent !== shown)
          element.textContent = shown;
      });
      return at + dur;
    };

    const starts = [t0 + 0.9, t0 + 3.3, t0 + 5.3];
    cards.forEach((card, index) => fx.up(tl, card, starts[index], { y: 40, dur: 0.8 }));

    // 1: the commands in the IFS
    {
      const typed = [...cards[0].querySelectorAll('[data-type]')];
      const after = [...cards[0].querySelectorAll('[data-after]')];
      let at = type(typed[0], starts[0] + 0.5, 0.03);
      at = type(typed[1], at, 0.03);
      fx.in(tl, after[0], at + 0.15, { dur: 0.15 });
      at = type(typed[2], at + 0.45, 0.04);
      fx.in(tl, after[1], at + 0.45, { dur: 0.25 });
    }

    // 2: click Initialize
    {
      const cursor = new UI.Cursor(cards[1], 0, 0);
      const base = UI.rect(cards[1]);
      const button = UI.rect(cards[1].querySelector('[data-btn=initialize]'));
      cursor.x = 400;
      cursor.y = 560;
      cursor.show(tl, starts[1] + 0.6);
      const arrived = cursor.move(tl, { x: button.cx - base.x, y: button.cy - base.y }, starts[1] + 0.65, 0.6);
      cursor.click(tl, arrived + 0.05);
      tl.cls(cards[1].querySelector('[data-btn=initialize]'), 'pressed', arrived + 0.1, arrived + 0.4);
      fx.flash(tl, cards[1].querySelector('[data-btn=initialize]'), arrived + 0.1);
      cursor.hide(tl, arrived + 1.0);
    }

    // 3: fill in the connection, one field after the other
    {
      let at = starts[2] + 0.5;
      const fields = [...cards[2].querySelectorAll('.field')];
      fields.forEach((item, index) => {
        const done = type(item.querySelector('[data-type]'), at, 0.03) + 0.2;
        tl.cls(item, 'focus', index === 0 ? -1 : at, index === fields.length - 1 ? Infinity : done);
        at = done;
      });
    }

    fx.in(tl, scene.querySelector('.start-foot'), t0 + 6.4, { dur: 0.7 });
  },
});
