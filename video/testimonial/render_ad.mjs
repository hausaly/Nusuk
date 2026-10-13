// Renders ad_ramadan.html (Umrah Ramadan 2027 ad) to a 1080x1920 H.264 video with looped background music.
//   node render_ad.mjs stills 1 6 14 ...   -> stills/ad_<sec>.png (for review)
//   node render_ad.mjs video               -> hausaly_umrah_ramadan_2027_ad_tiktok.mp4
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const FPS = 30, LOOPS = 3, XFADE = 1.0;
const MUSIC = join(ROOT, 'assets/caller_tune_umrah.mp3');
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
await page.goto(`http://127.0.0.1:${port}/ad_ramadan.html`);
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => Promise.all([...document.images].map(i => i.decode())));
const DURATION = await page.evaluate(() => window.AD_DURATION);

const [mode, ...args] = process.argv.slice(2);
if (mode === 'stills') {
  await mkdir(join(ROOT, 'stills'), { recursive: true });
  for (const t of args.map(Number)) {
    await page.evaluate(t => render(t), t);
    await page.screenshot({ path: join(ROOT, `stills/ad_${String(t).padStart(5, '0')}.png`) });
  }
} else if (mode === 'video') {
  const out = args[0] || join(ROOT, 'hausaly_umrah_ramadan_2027_ad_tiktok.mp4');
  const total = Math.round(DURATION * FPS);
  // N copies of the tune, cross-faded at the seams, then levelled and faded in/out
  const ins = Array.from({ length: LOOPS }, () => ['-i', MUSIC]).flat();
  let chain = '[1:a]', filt = '';
  for (let i = 2; i <= LOOPS; i++) { filt += `${chain}[${i}:a]acrossfade=d=${XFADE}:c1=tri:c2=tri[x${i}];`; chain = `[x${i}]`; }
  filt += `${chain}atrim=0:${DURATION},loudnorm=I=-16:TP=-1.5:LRA=7,afade=t=in:d=0.8,afade=t=out:st=${(DURATION - 1.4).toFixed(2)}:d=1.4[a]`;
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', ...ins,
    '-filter_complex', filt, '-map', '0:v', '-map', '[a]', '-t', DURATION.toFixed(3),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-profile:v', 'high', '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let f = 0; f < total; f++) {
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
