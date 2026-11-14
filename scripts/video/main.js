'use strict';
// Puts the scenes one after the other on the timeline and exposes it:
// window.__ready (promise for the duration in seconds) and window.__seek(seconds) for render.mjs, a scrubber for the preview.

(function () {

  const FPS = 30;
  // Scenes overlap: the next one comes in while the one before fades out
  const OVERLAP = 0.4;
  const FADE_OUT = 0.5;

  const rendering = new URLSearchParams(location.search).has('render');
  document.documentElement.classList.toggle('rendering', rendering);

  const timeline = new Timeline();
  const holder = document.getElementById('scenes');
  const chapters = [];
  let start = 0;

  function build() {
    for (const scene of window.SCENES) {
      const element = document.createElement('section');
      element.className = `scene scene-${scene.id}`;
      holder.append(element);
      scene.build(timeline, element, start);
      timeline.scene(element, start, start + scene.dur);
      if (!scene.last)
        timeline.to(element, { opacity: [1, 0] }, start + scene.dur - FADE_OUT, FADE_OUT, { ease: 'inOut' });
      if (scene.chapter)
        chapters.push({ label: scene.chapter, start, end: start + scene.dur - OVERLAP });
      start += scene.dur - (scene.last ? 0 : OVERLAP);
    }
    window.UI.background(timeline, start);
    window.UI.chapters(timeline, chapters);
    timeline.build();
    return start;
  }

  window.__ready = document.fonts.ready.then(async () => {
    // Fonts that no text uses yet at load (codicons in hidden parts) would otherwise come in mid-video
    await Promise.all([...document.fonts].map(font => font.load().catch(() => undefined)));
    const duration = build();
    window.__seek = seconds => timeline.seek(Math.min(seconds, duration - 1 / FPS / 2));
    window.__seek(0);
    return duration;
  });

  if (rendering)
    return;


  // ----- Preview -----

  const viewport = document.getElementById('viewport');
  const stage = document.getElementById('stage');
  const play = document.getElementById('play');
  const scrub = document.getElementById('scrub');
  const clock = document.getElementById('clock');

  function fit() {
    const scale = Math.min(window.innerWidth / 1920, (window.innerHeight - 48) / 1080);
    stage.style.transform = `scale(${scale})`;
    viewport.style.width = `${1920 * scale}px`;
    viewport.style.height = `${1080 * scale}px`;
  }

  window.__ready.then(duration => {
    let now = Number(new URLSearchParams(location.search).get('t') ?? 0);
    let playing = false;
    let last = 0;

    const show = () => {
      window.__seek(now);
      scrub.value = String(now / duration);
      clock.textContent = `${now.toFixed(2)} / ${duration.toFixed(2)} s`;
    };
    const tick = stamp => {
      if (!playing)
        return;
      now += (stamp - last) / 1000;
      last = stamp;
      if (now >= duration) {
        now = 0;
      }
      show();
      requestAnimationFrame(tick);
    };
    const toggle = () => {
      playing = !playing;
      play.textContent = playing ? 'Pause' : 'Play';
      if (playing) {
        last = performance.now();
        requestAnimationFrame(tick);
      }
    };
    const step = seconds => {
      now = Math.min(duration, Math.max(0, now + seconds));
      show();
    };

    play.addEventListener('click', toggle);
    scrub.addEventListener('input', () => { now = Number(scrub.value) * duration; show(); });
    window.addEventListener('keydown', event => {
      if (event.key === ' ') { event.preventDefault(); toggle(); }
      if (event.key === 'ArrowRight') step(event.shiftKey ? 1 : 1 / FPS);
      if (event.key === 'ArrowLeft') step(event.shiftKey ? -1 : -1 / FPS);
    });
    window.addEventListener('resize', fit);
    fit();
    show();
  });

})();
