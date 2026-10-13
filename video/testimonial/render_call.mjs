// Outgoing-call caller-tune video (call_screen.html) with the tune as audio plus two end-of-call beeps.
//   python3 -I prep_call.py                    (once: assets/call_audio.json)
//   node render_call.mjs stills 1 3 8 14 16.6 19   -> stills/call_<sec>.png
//   node render_call.mjs video                     -> hausaly_caller_tune_outgoing_call_tiktok.mp4
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const FPS = 30;
const TUNE = join(ROOT, 'assets/caller_tune_umrah.mp3');
const mime = { '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  try {
    const body = await readFile(join(ROOT, decodeURIComponent(req.url.split('?')[0])));
    res.writeHead(200, { 'content-type': mime[extname(req.url.split('?')[0])] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--font-render-hinting=none'] });
const page = await (await browser.newContext({ viewport: { width: 1080, height: 1920 } })).newPage();
page.on('pageerror', e => console.error('PAGE ERROR', e.message));
await page.goto(`http://127.0.0.1:${port}/call_screen.html`);
await page.evaluate(() => loadAssets());
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => Promise.all([...document.images].map(i => i.decode())));
const { DURATION, AUDIO_START, END_CALL } = await page.evaluate(() => ({ DURATION: CALL_DURATION, AUDIO_START: CALL_AUDIO_START, END_CALL: 16.25 }));

const [mode, ...args] = process.argv.slice(2);
if (mode === 'stills') {
  await mkdir(join(ROOT, 'stills'), { recursive: true });
  for (const t of args.map(Number)) {
    await page.evaluate(t => render(t), t);
    await page.screenshot({ path: join(ROOT, `stills/call_${t}.png`) });
  }
} else if (mode === 'video') {
  const out = args[0] || join(ROOT, 'hausaly_caller_tune_outgoing_call_tiktok.mp4');
  const total = Math.round(DURATION * FPS);
  // audio first, in its own run: tune delayed to its start time + two short "call ended" beeps
  const ms = Math.round(AUDIO_START * 1000), b1 = Math.round((END_CALL + 0.05) * 1000), b2 = b1 + 260;
  const audio = join(ROOT, 'build/call_mix.wav');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', TUNE, '-f', 'lavfi', '-i', 'sine=f=425:d=0.16', '-f', 'lavfi', '-i', 'sine=f=425:d=0.16',
    '-filter_complex',
    `[0:a]loudnorm=I=-16:TP=-1.5:LRA=7,adelay=${ms}|${ms},apad[m];` +
    `[1:a]volume=0.2,afade=t=in:d=0.01,afade=t=out:st=0.12:d=0.04,aformat=channel_layouts=stereo,adelay=${b1}|${b1}[x];` +
    `[2:a]volume=0.2,afade=t=in:d=0.01,afade=t=out:st=0.12:d=0.04,aformat=channel_layouts=stereo,adelay=${b2}|${b2}[y];` +
    `[m][x][y]amix=inputs=3:normalize=0:duration=longest,atrim=0:${DURATION},afade=t=out:st=${(DURATION - 0.9).toFixed(2)}:d=0.9[a]`,
    '-map', '[a]', '-ar', '48000', '-ac', '2', audio]);
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-i', audio,
    '-map', '0:v', '-map', '1:a', '-t', DURATION.toFixed(3),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-profile:v', 'high', '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '192k', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  let dead = false;
  ff.on('close', c => { if (c) { console.error('ffmpeg exited with', c); process.exit(1); } });
  ff.stdin.on('error', () => { dead = true; });
  for (let f = 0; f < total && !dead; f++) {
    await page.evaluate(t => render(t), f / FPS);
    const png = await page.screenshot({ type: 'png' });
    if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r));
    if (f % 150 === 0) console.log(`frame ${f}/${total}`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  console.log('wrote', out);
}
await browser.close();
server.close();
