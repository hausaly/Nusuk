// Rawdah long ad: transparent overlay (rawdah_long.html) over build/rawdah_footage.mp4,
// music bed (assets/visa_bg.m4a) plus the shop clip's own sound.
//   python3 -I rawdah_footage.py
//   node render_rawdah.mjs stills 1 4.5 8 14      -> stills/rawdah_<sec>.png
//   node render_rawdah.mjs video                  -> hausaly_rawdah_long_ad_tiktok.mp4
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const FPS = 30, MUSIC = process.env.MUSIC || join(ROOT, 'assets/visa_bg.m4a');   // MUSIC=/path/to/track to swap the music
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
await page.goto(`http://127.0.0.1:${port}/rawdah_long.html`);
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => Promise.all([...document.images].map(i => i.decode())));
const DURATION = await page.evaluate(() => window.RAWDAH_DURATION);

const [mode, ...args] = process.argv.slice(2);
if (mode === 'stills') {
  await mkdir(join(ROOT, 'stills'), { recursive: true });
  for (const t of args.map(Number)) {
    await page.evaluate(t => render(t), t);
    const ov = join(ROOT, `stills/ov_${t}.png`), out = join(ROOT, `stills/rawdah_${t}.png`);
    await page.screenshot({ path: ov, omitBackground: true });
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', join(ROOT, 'build/rawdah_footage.mp4'), '-i', ov, '-filter_complex', '[0:v][1:v]overlay=format=auto', '-frames:v', '1', out]);
  }
} else if (mode === 'video') {
  const out = args[0] || join(ROOT, 'hausaly_rawdah_long_ad_tiktok.mp4');
  const total = Math.round(DURATION * FPS);
  const audio = join(ROOT, 'build/rawdah_mix.wav');
  // music looped twice with a cross-fade (the track is shorter than the video), plus the clips' own sound
  // audio: the Rawdah Visit recording is the whole soundtrack; it is trimmed at a pause (~63 s) and faded out
  const RAW = join(ROOT, 'assets/rawdah_visit.mp3');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', RAW, '-af',
    `loudnorm=I=-16:TP=-1.5:LRA=7,atrim=0:${DURATION},afade=t=in:d=0.4,afade=t=out:st=${(DURATION - 1.4).toFixed(2)}:d=1.4`,
    '-ar', '48000', '-ac', '2', '-t', String(DURATION), audio]);
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-i', join(ROOT, 'build/rawdah_footage.mp4'), '-i', audio,
    '-filter_complex', '[1:v][0:v]overlay=format=auto:shortest=1[v]', '-map', '[v]', '-map', '2:a', '-t', DURATION.toFixed(3),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-profile:v', 'high', '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '192k', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  let dead = false;
  ff.on('close', c => { if (c) { console.error('ffmpeg exited with', c); process.exit(1); } });
  ff.stdin.on('error', () => { dead = true; });
  for (let f = 0; f < total && !dead; f++) {
    await page.evaluate(t => render(t), f / FPS);
    const png = await page.screenshot({ type: 'png', omitBackground: true });
    if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r));
    if (f % 150 === 0) console.log(`frame ${f}/${total}`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  console.log('wrote', out);
}
await browser.close();
server.close();
