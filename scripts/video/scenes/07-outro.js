'use strict';
// Outro: where to get it.

window.SCENES.push({
  id: 'outro',
  dur: 5.6,
  last: true,

  build(tl, scene, t0) {
    const { html, LOGO, fx } = window.UI;

    scene.append(html(`
      <div class="brand small">
        <div class="brand-logo">${LOGO}</div>
        <div class="brand-name"><span>O</span><span>B</span><span>I</span></div>
        <div class="brand-sub">Object Builder for IBM i</div>
        <div class="brand-link">github.com/andreas-prouza/obi-extension</div>
        <div class="brand-note">Free &amp; open source · MIT license</div>
      </div>`));

    fx.pop(tl, scene.querySelector('.brand-logo'), t0 + 0.35, { from: 0.6, dur: 0.7 });
    fx.up(tl, scene.querySelectorAll('.brand-name span'), t0 + 0.55, { gap: 0.07, y: 40 });
    fx.up(tl, scene.querySelector('.brand-sub'), t0 + 0.95, { y: 20 });
    fx.pop(tl, scene.querySelector('.brand-link'), t0 + 1.4, { from: 0.9 });
    fx.in(tl, scene.querySelector('.brand-note'), t0 + 1.9, { dur: 0.7 });
    // The last second fades to black
    tl.to(scene, { opacity: [1, 0] }, t0 + 4.9, 0.7, { ease: 'inOut' });
    tl.to('#bg', { opacity: [1, 0] }, t0 + 4.9, 0.7, { ease: 'inOut' });
  },
});
