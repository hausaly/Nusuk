// Umrah visa B2C ad (visa_ad.html) with the supplied background track.
//   node render_visa.mjs stills 1 5 11 16   -> stills/visa_<sec>.png
//   node render_visa.mjs video              -> hausaly_umrah_visa_ad_tiktok.mp4
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const FPS = 30, MUSIC = join(ROOT, 'assets/visa_bg.m4a');
const mime = { '.html': 'text/html', '.png': 'image/png', '.svg': 'image/svg+xml' };
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
await page.goto(`http://127.0.0.1:${port}/visa_ad.html`);
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => Promise.all([...document.images].map(i => i.decode())));
const DURATION = await page.evaluate(() => window.AD_DURATION);

const [mode, ...args] = process.argv.slice(2);
if (mode === 'stills') {
  await mkdir(join(ROOT, 'stills'), { recursive: true });
  for (const t of args.map(Number)) { await page.evaluate(t => render(t), t); await page.screenshot({ path: join(ROOT, `stills/visa_${t}.png`) }); }
} else if (mode === 'video') {
  const out = args[0] || join(ROOT, 'hausaly_umrah_visa_ad_tiktok.mp4');
  const total = Math.round(DURATION * FPS);
  const audio = join(ROOT, 'build/visa_mix.wav');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', MUSIC, '-af',
    `loudnorm=I=-16:TP=-1.5:LRA=7,afade=t=in:d=0.6,afade=t=out:st=${(DURATION - 1.4).toFixed(2)}:d=1.4,atrim=0:${DURATION},apad=whole_dur=${DURATION}`,
    '-ar', '48000', '-ac', '2', audio]);
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
