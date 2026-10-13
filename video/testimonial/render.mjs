// Renders scene.html to a 1080x1920 H.264 video with the voice note muxed in.
//   node render.mjs <pilgrim#> stills 0.5 3 8 14 20   -> stills/t_<sec>.png (for review)
//   node render.mjs <pilgrim#> video                  -> hausaly_pilgrim_review_<#>_tiktok.mp4
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const FPS = 30, AUDIO_START = 1.2, TAIL = 2.6;
const [N, mode, ...args] = process.argv.slice(2);
const VOICE = join(ROOT, `assets/pilgrim_${N}.ogg`);
const VOICE_LEN = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', VOICE]).toString());
const DURATION = AUDIO_START + VOICE_LEN + TAIL;           // total length
const mime = { '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  try {
    const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/scene.html'));
    const body = await readFile(p);
    res.writeHead(200, { 'content-type': mime[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--font-render-hinting=none'] });
const page = await (await browser.newContext({ viewport: { width: 1080, height: 1920 } })).newPage();
await page.goto(`http://127.0.0.1:${port}/scene.html?n=${N}`);
await page.evaluate(() => loadSpec());
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => Promise.all([...document.images].map(i => i.decode())));

if (mode === 'stills') {
  await mkdir(join(ROOT, 'stills'), { recursive: true });
  for (const t of args.map(Number)) {
    await page.evaluate(t => render(t), t);
    await page.screenshot({ path: join(ROOT, `stills/t_${String(t).padStart(5, '0')}.png`) });
  }
} else if (mode === 'video') {
  const out = args[0] || join(ROOT, `hausaly_pilgrim_review_${N}_tiktok.mp4`);
  const total = Math.round(DURATION * FPS);
  const ff = spawn('ffmpeg', [
    '-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-i', VOICE,
    '-filter_complex',
    `[1:a]highpass=f=70,loudnorm=I=-14:TP=-1.5:LRA=9,adelay=${AUDIO_START * 1000}|${AUDIO_START * 1000},apad,` +
    `afade=t=out:st=${(DURATION - 0.6).toFixed(2)}:d=0.6[a]`,
    '-map', '0:v', '-map', '[a]', '-t', DURATION.toFixed(3),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-profile:v', 'high', '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', out,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let f = 0; f < total; f++) {
    const t = f / FPS;
    await page.evaluate(t => {
      render(t);
      // closing fade-to-white for the last 0.5 s
    }, t);
    await page.evaluate(([t, d]) => { document.getElementById('fade').style.opacity = Math.max(0, (t - (d - 0.5)) / 0.5); }, [t, DURATION]);
    const png = await page.screenshot({ type: 'png' });
    if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r));
    if (f % 60 === 0) process.stdout.write(`frame ${f}/${total}\n`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  console.log('wrote', out);
}
await browser.close();
server.close();
