'use strict';
// Intro: the hammer of the logo is put together, then the name.

window.SCENES.push({
  id: 'intro',
  dur: 5.4,

  build(tl, scene, t0) {
    const { html, LOGO, fx } = window.UI;
    const SPARKS = [-72, -48, -24, 24, 48, 72];

    scene.append(html(`
      <div class="brand">
        <div class="brand-logo">
          ${LOGO}
          <div class="brand-ring"></div>
          ${SPARKS.map(() => '<i class="brand-spark"></i>').join('')}
        </div>
        <div class="brand-name"><span>O</span><span>B</span><span>I</span></div>
        <div class="brand-sub">Object Builder for IBM i</div>
        <div class="brand-tag">Automatic builds for IBM i — <em>right inside VS Code</em></div>
      </div>`));

    const hit = t0 + 1.0;

    // The handle comes up, the head drops onto it
    tl.to(scene.querySelector('.logo-handle'), { opacity: [0, 1], translate: ['0 70px', '0 0'] }, t0 + 0.25, 0.7);
    tl.to(scene.querySelector('.logo-head'), { opacity: [0, 1, 1], translate: ['0 -190px', '0 -150px', '0 0'], offset: [0, 0.25, 1] }, t0 + 0.5, 0.5, { ease: 'in' });
    tl.to(scene.querySelector('.brand-logo .logo'), { scale: ['1 1', '1.07 .9', '.98 1.03', '1 1'] }, hit, 0.5, { ease: 'soft' });

    tl.to(scene.querySelector('.brand-ring'), [
      { opacity: 0, scale: 0.15, offset: 0 }, { opacity: 0.85, scale: 0.4, offset: 0.15 }, { opacity: 0, scale: 1.25, offset: 1 },
    ], hit, 0.9, { ease: 'out' });
    scene.querySelectorAll('.brand-spark').forEach((spark, index) => {
      const angle = SPARKS[index];
      tl.to(spark, [
        { opacity: 0, transform: `rotate(${angle}deg) translateY(-70px) scaleY(.3)`, offset: 0 },
        { opacity: 1, transform: `rotate(${angle}deg) translateY(-110px) scaleY(1)`, offset: 0.3 },
        { opacity: 0, transform: `rotate(${angle}deg) translateY(-190px) scaleY(.5)`, offset: 1 },
      ], hit, 0.6, { ease: 'out' });
    });

    fx.up(tl, scene.querySelectorAll('.brand-name span'), hit + 0.12, { gap: 0.08, y: 46, dur: 0.8 });
    fx.up(tl, scene.querySelector('.brand-sub'), hit + 0.6, { y: 22 });
    fx.up(tl, scene.querySelector('.brand-tag'), hit + 1.0, { y: 18 });
  },
});
