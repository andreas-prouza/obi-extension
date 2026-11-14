'use strict';
// Deterministic timeline for the intro video.
// Every animation is a paused Web Animation; a frame is `seek(seconds)`. Nothing depends on the wall clock,
// so the renderer (render.mjs) can take one screenshot per frame, and the preview can scrub.

(function () {

  const EASE = {
    out: 'cubic-bezier(.16,1,.3,1)',
    soft: 'cubic-bezier(.25,.8,.25,1)',
    inOut: 'cubic-bezier(.65,0,.35,1)',
    in: 'cubic-bezier(.5,0,.75,0)',
    back: 'cubic-bezier(.34,1.56,.64,1)',
    linear: 'linear',
  };

  const NOT_A_PROPERTY = new Set(['offset', 'easing', 'composite']);

  function elements(target) {
    if (!target)
      return [];
    if (typeof target === 'string')
      return [...document.querySelectorAll(target)];
    if (target instanceof Element)
      return [target];
    return [...target];
  }

  function properties(keyframes) {
    const names = Array.isArray(keyframes) ? keyframes.flatMap(frame => Object.keys(frame)) : Object.keys(keyframes);
    return [...new Set(names.filter(name => !NOT_A_PROPERTY.has(name)))];
  }

  const clamp01 = value => Math.min(1, Math.max(0, value));


  class Timeline {

    constructor() {
      this.specs = [];
      this.callbacks = [];
      this.switches = [];
      this.classes = [];
      this.texts = [];
      this.scenes = [];
      this.animations = [];
      this.end = 0;
    }

    /** Animates `target` (selector, element or list) from `at` seconds for `dur` seconds. */
    to(target, keyframes, at, dur = 0.6, options = {}) {
      for (const element of elements(target))
        this.specs.push({ element, keyframes, at, dur, options });
      if (!options.loop)
        this.end = Math.max(this.end, at + dur);
      return this;
    }

    /** Like `to`, each element `gap` seconds after the one before. */
    stagger(target, keyframes, at, dur, gap, options = {}) {
      elements(target).forEach((element, index) => this.to(element, keyframes, at + index * gap, dur, options));
      return this;
    }

    /** Calls `callback(progress 0..1, seconds)` on every frame; 0 before `at`, 1 after `at + dur`. */
    each(at, dur, callback) {
      this.callbacks.push({ at, dur, callback });
      this.end = Math.max(this.end, at + dur);
      return this;
    }

    /** Calls `callback(true)` once the time is in [at, until), `callback(false)` outside. Only on a change. */
    when(at, callback, until = Infinity) {
      this.switches.push({ at, until, callback, state: undefined });
      return this;
    }

    /** Adds `name` to the class list of `target` while the time is in [at, until). Several ranges may be given. */
    cls(target, name, at, until = Infinity) {
      for (const element of elements(target)) {
        let entry = this.classes.find(item => item.element === element && item.name === name);
        if (!entry)
          this.classes.push(entry = { element, name, ranges: [], state: undefined });
        entry.ranges.push([at, until]);
      }
      return this;
    }

    /** Replaces the text of `target` from `at` on; before the first change, it keeps the text of the page. */
    text(target, value, at) {
      for (const element of elements(target)) {
        let entry = this.texts.find(item => item.element === element);
        if (!entry)
          this.texts.push(entry = { element, steps: [{ at: -Infinity, value: element.textContent }], shown: undefined });
        entry.steps.push({ at, value });
        entry.steps.sort((a, b) => a.at - b.at);
      }
      return this;
    }

    /** A scene is only laid out and painted in [start, end). */
    scene(element, start, end) {
      this.scenes.push({ element, start, end });
      this.end = Math.max(this.end, end);
      return this;
    }

    build() {
      // In the order of their start: a later animation of the same property overrides the earlier one.
      // The first animation of a property also applies before its start (the element waits in its first keyframe);
      // later ones must not, or they would hide the earlier ones.
      const sorted = this.specs.map((spec, index) => ({ spec, index }))
        .sort((a, b) => a.spec.at - b.spec.at || a.index - b.index)
        .map(entry => entry.spec);
      const animated = new WeakMap();

      for (const { element, keyframes, at, dur, options } of sorted) {
        const names = properties(keyframes);
        const seen = animated.get(element) ?? new Set();
        const first = names.every(name => !seen.has(name));
        names.forEach(name => seen.add(name));
        animated.set(element, seen);

        const animation = element.animate(keyframes, {
          duration: Math.max(1, dur * 1000),
          delay: at * 1000,
          easing: EASE[options.ease ?? 'out'] ?? options.ease,
          fill: options.loop ? 'none' : (first ? 'both' : 'forwards'),
          iterations: options.loop ? Infinity : 1,
          direction: options.direction ?? 'normal',
        });
        animation.pause();
        this.animations.push(animation);
      }
      return this;
    }

    seek(seconds) {
      const ms = seconds * 1000;
      for (const animation of this.animations)
        animation.currentTime = ms;
      for (const scene of this.scenes)
        scene.element.style.visibility = seconds >= scene.start && seconds < scene.end ? 'visible' : 'hidden';
      for (const item of this.switches) {
        const state = seconds >= item.at && seconds < item.until;
        if (state !== item.state) {
          item.state = state;
          item.callback(state);
        }
      }
      for (const item of this.classes) {
        const state = item.ranges.some(([at, until]) => seconds >= at && seconds < until);
        if (state !== item.state) {
          item.state = state;
          item.element.classList.toggle(item.name, state);
        }
      }
      for (const item of this.texts) {
        let value = item.steps[0].value;
        for (const step of item.steps)
          if (seconds >= step.at)
            value = step.value;
        if (value !== item.shown) {
          item.shown = value;
          item.element.textContent = value;
        }
      }
      for (const { at, dur, callback } of this.callbacks)
        callback(clamp01(dur > 0 ? (seconds - at) / dur : (seconds >= at ? 1 : 0)), seconds);
    }
  }

  window.Timeline = Timeline;
  window.EASE = EASE;

})();
