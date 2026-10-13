// Client-experience video: transparent HTML overlay (client_experience.html) composited over build/footage.mp4,
// with the looped background music and the clips' own sound.
//   python3 -I client_footage.py                 (once: builds build/footage.mp4 + build/ambience.wav)
//   node render_client.mjs stills 1 4 7 12 16    -> stills/client_<sec>.png (overlay on footage, for review)
//   node render_client.mjs video                 -> hausaly_client_experience_1oct2026_tiktok.mp4
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const FPS = 30, XFADE = 1.0;
const MUSIC = join(ROOT, 'assets/caller_tune_umrah.mp3');
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
await page.goto(`http://127.0.0.1:${port}/client_experience.html`);
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => Promise.all([...document.images].map(i => i.decode())));
const DURATION = await page.evaluate(() => window.CLIENT_DURATION);
const shot = () => page.screenshot({ type: 'png', omitBackground: true });

const [mode, ...args] = process.argv.slice(2);
if (mode === 'stills') {
  await mkdir(join(ROOT, 'stills'), { recursive: true });
  for (const t of args.map(Number)) {
    await page.evaluate(t => render(t), t);
    const ov = join(ROOT, `stills/ov_${t}.png`), out = join(ROOT, `stills/client_${t}.png`);
    await page.screenshot({ path: ov, omitBackground: true });
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', join(ROOT, 'build/footage.mp4'), '-i', ov,
      '-filter_complex', '[0:v][1:v]overlay=format=auto', '-frames:v', '1', out]);
  }
} else if (mode === 'video') {
  const out = args[0] || join(ROOT, 'hausaly_client_experience_1oct2026_tiktok.mp4');
  const total = Math.round(DURATION * FPS);
  // 1) audio first, in its own ffmpeg run: tune looped x2 with a cross-fade, ducked under the clips' own sound
  const audio = join(ROOT, 'build/mix.wav');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', join(ROOT, 'build/ambience.wav'), '-i', MUSIC, '-i', MUSIC, '-filter_complex',
    `[1:a][2:a]acrossfade=d=${XFADE}:c1=tri:c2=tri,atrim=0:${DURATION},loudnorm=I=-17:TP=-1.5:LRA=7[m];` +
    `[0:a]highpass=f=60,volume=1.6[n];` +
    `[m][n]amix=inputs=2:normalize=0:duration=longest,atrim=0:${DURATION},alimiter=limit=0.95,afade=t=in:d=0.6,afade=t=out:st=${(DURATION - 1.4).toFixed(2)}:d=1.4[a]`,
    '-map', '[a]', '-ar', '48000', '-ac', '2', audio]);
  // 2) picture: overlay frames piped in over the footage, then mux the finished audio
  const ff = spawn('ffmpeg', ['-y', '-v', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-i', join(ROOT, 'build/footage.mp4'), '-i', audio,
    '-filter_complex', '[1:v][0:v]overlay=format=auto:shortest=1[v]', '-map', '[v]', '-map', '2:a', '-t', DURATION.toFixed(3),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-profile:v', 'high', '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '192k', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  let dead = false;
  ff.on('close', c => { if (c) { console.error('ffmpeg exited with', c); process.exit(1); } });
  ff.stdin.on('error', () => { dead = true; });
  const limit = process.env.FRAMES ? Number(process.env.FRAMES) : total;
  for (let f = 0; f < limit && !dead; f++) {
    await page.evaluate(t => render(t), f / FPS);
    const png = await shot();
    if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r));
    if (f % 150 === 0) console.log(`frame ${f}/${total}`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  console.log('wrote', out);
}
await browser.close();
server.close();
