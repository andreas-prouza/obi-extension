#!/usr/bin/env node
// Renders the intro video (index.html in this folder) to an MP4.
// Headless Chrome shows the page, the timeline is set to the time of each frame, a screenshot is taken
// and piped to ffmpeg. Several Chrome/ffmpeg pairs render parts of the video in parallel.
//
//   node scripts/video/render.mjs                      -> asserts/video/obi-intro.mp4 (1920x1080, 30 fps)
//   node scripts/video/render.mjs --scale 2            -> 3840x2160
//   node scripts/video/render.mjs --stills 3,12.5,40 --out /tmp/stills   -> PNG files of single moments
//   node scripts/video/render.mjs --small-copy 10      -> asserts/video/obi-intro-small.mp4 with less than 10 MB,
//                                                         from the rendered video (GitHub takes 10 MB on a free plan)
//
// Needs Chrome or Chromium (CHROME_PATH overrides the search) and ffmpeg. No npm packages.

import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const WIDTH = 1920;
const HEIGHT = 1080;
const CHROME_NAMES = ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser', 'chrome'];


function parse_args(argv) {
  const options = {
    out: undefined, fps: 30, scale: 1, crf: 17,
    workers: Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2))),
    stills: undefined, from: 0, to: undefined, small_copy: undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i];
    const value = () => {
      if (i + 1 >= argv.length)
        throw new Error(`${name} needs a value`);
      return argv[++i];
    };
    switch (name) {
      case '--out': options.out = value(); break;
      case '--fps': options.fps = Number(value()); break;
      case '--scale': options.scale = Number(value()); break;
      case '--crf': options.crf = Number(value()); break;
      case '--workers': options.workers = Math.max(1, Number(value())); break;
      case '--stills': options.stills = value().split(',').map(Number); break;
      case '--from': options.from = Number(value()); break;
      case '--to': options.to = Number(value()); break;
      case '--small-copy': options.small_copy = Number(value()); break;
      case '-h':
      case '--help':
        console.log('Options: --out <file|dir> --fps <n> --scale <n> --crf <n> --workers <n> --from <s> --to <s> --stills <s,s,...> --small-copy <MB>');
        process.exit(0);
        break;
      default: throw new Error(`Unknown option ${name}`);
    }
  }
  for (const key of ['fps', 'scale', 'crf', 'workers', 'from'])
    if (!Number.isFinite(options[key]) || options[key] < 0)
      throw new Error(`--${key} is not a number`);
  if (options.small_copy !== undefined && !(options.small_copy > 0))
    throw new Error('--small-copy needs the size in MB');
  return options;
}


function find_chrome() {
  if (process.env.CHROME_PATH)
    return process.env.CHROME_PATH;
  for (const dir of (process.env.PATH ?? '').split(path.delimiter))
    for (const name of CHROME_NAMES)
      if (dir && existsSync(path.join(dir, name)))
        return path.join(dir, name);
  throw new Error('Chrome or Chromium not found. Set CHROME_PATH.');
}


/** Chrome DevTools Protocol over the WebSocket of Node */
class Cdp {

  constructor(socket) {
    this.socket = socket;
    this.last_id = 0;
    this.pending = new Map();
    this.on_event = () => undefined;
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id === undefined) {
        this.on_event(message);
        return;
      }
      const waiting = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error)
        waiting?.reject(new Error(`${waiting.method}: ${message.error.message}`));
      else
        waiting?.resolve(message.result);
    });
    socket.addEventListener('close', () => {
      for (const waiting of this.pending.values())
        waiting.reject(new Error('Chrome closed the connection'));
      this.pending.clear();
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', () => reject(new Error('No connection to Chrome')), { once: true });
    });
    return new Cdp(socket);
  }

  send(method, params = {}, sessionId = undefined) {
    const id = ++this.last_id;
    this.socket.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject, method }));
  }

  close() {
    this.socket.close();
  }
}


/** A headless Chrome with the video page loaded */
class Page {

  static async open(chrome_path, scale) {
    const page = new Page();
    page.profile = await mkdtemp(path.join(os.tmpdir(), 'obi-video-chrome-'));
    page.process = spawn(chrome_path, [
      '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${page.profile}`,
      '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
      '--force-color-profile=srgb', '--font-render-hinting=none', '--disable-lcd-text',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      `--window-size=${WIDTH},${HEIGHT}`, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });

    const endpoint = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error(`Chrome did not start:\n${output}`)), 30000);
      page.process.stderr.on('data', chunk => {
        output += chunk;
        const match = /DevTools listening on (ws:\/\/\S+)/.exec(output);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      });
      page.process.once('exit', code => {
        clearTimeout(timer);
        reject(new Error(`Chrome exited with ${code}:\n${output}`));
      });
    });

    page.cdp = await Cdp.connect(endpoint);
    const { targetId } = await page.cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await page.cdp.send('Target.attachToTarget', { targetId, flatten: true });
    page.session = sessionId;

    page.cdp.on_event = message => {
      if (message.method === 'Runtime.exceptionThrown')
        console.error(`Page error: ${message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text}`);
      if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type))
        console.error(`Page ${message.params.type}: ${message.params.args.map(arg => arg.value ?? arg.description).join(' ')}`);
      if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error')
        console.error(`Page error: ${message.params.entry.text} ${message.params.entry.url ?? ''}`);
    };

    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Log.enable');
    await page.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: scale, mobile: false });
    await page.send('Page.navigate', { url: `${pathToFileURL(path.join(HERE, 'index.html'))}?render` });

    // The page sets window.__ready (a promise for the duration in seconds) once fonts and timeline are there
    page.duration = await page.evaluate(`new Promise((resolve, reject) => {
      const started = Date.now();
      const wait = () => {
        if (window.__ready) window.__ready.then(resolve, reject);
        else if (Date.now() - started > 20000) reject(new Error('The page did not get ready'));
        else setTimeout(wait, 20);
      };
      wait();
    })`);
    return page;
  }

  send(method, params = {}) {
    return this.cdp.send(method, params, this.session);
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails)
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  }

  /** The frame at `seconds` as a PNG */
  async frame(seconds) {
    await this.evaluate(`window.__seek(${seconds})`);
    const { data } = await this.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
    return Buffer.from(data, 'base64');
  }

  async close() {
    this.cdp?.close();
    if (this.process && this.process.exitCode === null) {
      this.process.kill();
      await once(this.process, 'exit').catch(() => undefined);
    }
    await rm(this.profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => undefined);
  }
}


function run_ffmpeg(args, input = 'ignore') {
  const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: [input, 'inherit', 'inherit'] });
  const done = new Promise((resolve, reject) => {
    child.once('error', error => reject(new Error(`ffmpeg could not be started: ${error.message}`)));
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`)));
  });
  return { child, done };
}


async function render_stills(options, chrome_path) {
  const dir = path.resolve(options.out ?? 'stills');
  await mkdir(dir, { recursive: true });
  const page = await Page.open(chrome_path, options.scale);
  try {
    for (const seconds of options.stills) {
      const file = path.join(dir, `still-${seconds.toFixed(2).padStart(6, '0')}.png`);
      await writeFile(file, await page.frame(seconds));
      console.log(file);
    }
  }
  finally {
    await page.close();
  }
}


async function render_video(options, chrome_path) {
  const out = path.resolve(options.out ?? path.join(ROOT, 'asserts', 'video', 'obi-intro.mp4'));
  await mkdir(path.dirname(out), { recursive: true });
  const work = await mkdtemp(path.join(os.tmpdir(), 'obi-video-'));
  const pages = [];
  const started = Date.now();

  try {
    const first = await Page.open(chrome_path, options.scale);
    pages.push(first);
    const first_frame = Math.round(options.from * options.fps);
    const last_frame = Math.round(Math.min(options.to ?? first.duration, first.duration) * options.fps);
    const total = last_frame - first_frame;
    if (total <= 0)
      throw new Error('Nothing to render');
    const workers = Math.min(options.workers, Math.ceil(total / options.fps));
    console.log(`${(total / options.fps).toFixed(1)} s, ${total} frames, ${WIDTH * options.scale}x${HEIGHT * options.scale} at ${options.fps} fps, ${workers} workers`);

    while (pages.length < workers)
      pages.push(await Page.open(chrome_path, options.scale));

    let rendered = 0;
    const report = setInterval(() => process.stdout.write(`\r${Math.floor(rendered / total * 100)} %  `), 1000);
    const parts = [];

    await Promise.all(pages.map(async (page, index) => {
      const begin = first_frame + Math.floor(total * index / workers);
      const end = first_frame + Math.floor(total * (index + 1) / workers);
      const part = path.join(work, `part-${String(index).padStart(2, '0')}.mp4`);
      parts[index] = part;
      // Full-range RGB to BT.709: the usual tagging of HD video, so players show the dark colours as the page has them
      const encoder = run_ffmpeg([
        '-f', 'image2pipe', '-framerate', String(options.fps), '-c:v', 'png', '-i', 'pipe:0',
        '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
        // A key frame every 10 s: the fine grain of the background makes key frames large
        '-c:v', 'libx264', '-preset', 'slow', '-crf', String(options.crf), '-g', String(options.fps * 10),
        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
        '-an', part,
      ], 'pipe');
      encoder.child.stdin.on('error', () => undefined);

      for (let frame = begin; frame < end; frame++) {
        const png = await page.frame(frame / options.fps);
        if (!encoder.child.stdin.write(png))
          await once(encoder.child.stdin, 'drain');
        rendered++;
      }
      encoder.child.stdin.end();
      await encoder.done;
    }));

    clearInterval(report);
    const list = path.join(work, 'parts.txt');
    await writeFile(list, parts.map(part => `file '${part.replaceAll("'", "'\\''")}'\n`).join(''));
    await run_ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out]).done;
    console.log(`\r${out} (${((Date.now() - started) / 1000).toFixed(0)} s)`);
  }
  finally {
    await Promise.all(pages.map(page => page.close()));
    await rm(work, { recursive: true, force: true });
  }
}


/** A copy of the rendered video below a size limit: two passes, so the size is hit and the quality is spread evenly */
async function small_copy(options) {
  const source = path.resolve(options.out ?? path.join(ROOT, 'asserts', 'video', 'obi-intro.mp4'));
  if (!existsSync(source))
    throw new Error(`${source} not found: render the video first`);
  const target = source.replace(/(\.[^./\\]+)?$/, '-small.mp4');
  const probe = await promisify(execFile)('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', source]);
  const seconds = Number(probe.stdout.trim());
  if (!(seconds > 0))
    throw new Error(`The duration of ${source} is unknown`);
  // 8 % below the limit: the container and the rate control need some room
  const kbit = Math.floor(options.small_copy * 1000 * 1000 * 8 * 0.92 / seconds / 1000);
  const work = await mkdtemp(path.join(os.tmpdir(), 'obi-video-'));
  try {
    const encode = [
      '-i', source, '-c:v', 'libx264', '-preset', 'slower', '-b:v', `${kbit}k`, '-g', '300', '-pix_fmt', 'yuv420p',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
      '-an', '-passlogfile', path.join(work, 'pass'),
    ];
    await run_ffmpeg([...encode, '-pass', '1', '-f', 'null', os.devNull]).done;
    await run_ffmpeg([...encode, '-pass', '2', '-movflags', '+faststart', target]).done;
  }
  finally {
    await rm(work, { recursive: true, force: true });
  }
  const size = (await stat(target)).size;
  console.log(`${target} (${(size / 1000 / 1000).toFixed(1)} MB, ${kbit} kbit/s)`);
  if (size > options.small_copy * 1000 * 1000)
    throw new Error(`The copy is larger than ${options.small_copy} MB`);
}


try {
  const options = parse_args(process.argv.slice(2));
  if (options.small_copy !== undefined) {
    await small_copy(options);
    process.exit(0);
  }
  const chrome_path = find_chrome();
  if (options.stills)
    await render_stills(options, chrome_path);
  else
    await render_video(options, chrome_path);
}
catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
