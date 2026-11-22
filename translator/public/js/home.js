import { html, mount, $, $$ } from './ui.js';
import { S } from './state.js';
import { renderDocument } from './render.js';

const SAMPLE = { meta: { sourceLanguage: { code: 'en', name: 'English' }, documentType: 'Certificate' }, pages: [{ blocks: [
  { type: 'heading', level: 1, align: 'center', text: 'شهادة ميلاد' },
  { type: 'paragraph', align: 'center', text: 'جمهورية نيجيريا الاتحادية' },
  { type: 'table', borders: true, header: false, rows: [['الاسم الكامل', 'أحمد موسى إبراهيم'], ['تاريخ الميلاد', '12-05-1990'], ['مكان الميلاد', 'مايدوغوري، ولاية بورنو'], ['اسم الأب', 'موسى إبراهيم'], ['اسم الأم', 'عائشة محمد'], ['رقم الشهادة', 'NPC/BR/2290471']] },
  { type: 'paragraph', align: 'justify', text: 'نشهد بأن المعلومات الواردة أعلاه صحيحة ومطابقة للسجلات الرسمية المحفوظة لدى اللجنة الوطنية للسكان.' },
  { type: 'note', text: '[ختم رسمي: اللجنة الوطنية للسكان]' }, { type: 'note', text: '[توقيع]' },
] }] };

async function mini(layoutId, scale) {
  const tmp = document.createElement('div');
  const [page] = await renderDocument(tmp, { task: { layout: layoutId, targetLang: 'ar', translatorId: 'HET/T002/26', translationDate: '25-09-2026' }, doc: SAMPLE, cfg: S.cfg });
  page.style.transform = `scale(${scale})`; page.style.transformOrigin = 'top left';
  const box = document.createElement('div'); box.style.cssText = `width:${816 * scale}px;height:${1056 * scale}px;position:relative;overflow:hidden`;
  box.appendChild(page); return box;
}

export async function home() {
  const c = S.cfg, loggedIn = !!S.user;
  mount($('#view'), html`
  <section class="hero"><div class="in">
    <div>
      <span class="eyebrow">Certified translation desk</span>
      <h1>Arabic <em>⇄</em> English translations, <em>ready to certify</em>.</h1>
      <p class="lead">Upload a PDF or a photo of any document. We read it, detect the language, translate it and place it on the official ${c.branding.companyName} page — in a layout that mirrors your original. Review, correct, then download as PDF or Word.</p>
      <div class="cta">
        <a class="btn accent lg" href="${loggedIn ? '#/translate' : '#/login'}">${loggedIn ? 'Start a translation' : 'Sign in to start'}</a>
        <a class="btn ghost lg" href="#/" data-scroll="layouts">See page layouts</a>
      </div>
      <p class="small muted" style="margin-top:18px">Source language detected automatically · Target: Arabic or English · PDF, JPG, PNG</p>
    </div>
    <div class="hero-art" id="heroArt" aria-hidden="true"></div>
  </div></section>

  <section class="section"><div class="head"><h2>From upload to certified copy in four steps</h2><p>Built for accuracy: nothing is final until a person has read it.</p></div>
    <div class="steps">
      <div class="step"><h3>Upload</h3><p>Drop a PDF or a clear photo. Text is read with AI vision — even from scans.</p></div>
      <div class="step"><h3>Translate</h3><p>The language is detected for you. Pick Arabic or English as the target.</p></div>
      <div class="step"><h3>Review &amp; correct</h3><p>See the finished page. Click any text to edit, or type a command such as “change the father’s name to …”.</p></div>
      <div class="step"><h3>Approve &amp; download</h3><p>Approve it once and download a print-ready PDF and an editable Word file. It is saved to your records.</p></div>
    </div></section>

  <section class="section" id="layouts"><div class="head"><h2>Professional page layouts</h2><p>Choose how the translation is presented. Every layout carries the translator ID and translation date, and works in both directions.</p></div>
    <div class="layouts" id="layGrid">${c.layouts.map(l => html`<article class="lay-card"><div class="thumb" data-l="${l.id}"><div class="mini"></div></div><div class="meta"><span class="chip accent">${l.tag}</span><h3>${l.name}</h3><p>${l.description}</p></div></article>`)}</div></section>

  <section class="section"><div class="head"><h2>Why teams choose this desk</h2></div>
    <div class="features">
      <div class="feat"><div class="ic">🔎</div><h3>Reads scans &amp; photos</h3><p>Built-in OCR through AI vision: stamps, tables, handwriting notes and forms are rebuilt, not just typed out.</p></div>
      <div class="feat"><div class="ic">🔁</div><h3>Never blocked by a quota</h3><p>Gemini, ChatGPT and Claude work as a team. If one runs out of free allowance, the next one takes over automatically.</p></div>
      <div class="feat"><div class="ic">✍️</div><h3>Fix it before it ships</h3><p>Edit text directly on the page or describe the correction in plain words. Every change can be undone.</p></div>
      <div class="feat"><div class="ic">📄</div><h3>PDF &amp; Word</h3><p>Download a print-ready PDF and a fully editable Word document with the same header, footer and layout.</p></div>
      <div class="feat"><div class="ic">🗂️</div><h3>Complete records</h3><p>Every approved translation is logged with reference number, translator, languages, engine and date.</p></div>
      <div class="feat"><div class="ic">🔒</div><h3>Private by design</h3><p>Staff-only access. Original uploads are deleted as soon as a translation is approved.</p></div>
    </div></section>

  <section class="band"><div class="in"><h2>Have a document to translate?</h2><a class="btn accent lg" href="${loggedIn ? '#/translate' : '#/login'}">${loggedIn ? 'New translation' : 'Sign in'}</a></div></section>`);

  $('[data-scroll]')?.addEventListener('click', e => { e.preventDefault(); $('#' + e.currentTarget.dataset.scroll)?.scrollIntoView({ behavior: 'smooth' }); });
  // live miniatures (rendered with the real engine so they always match the output)
  const art = $('#heroArt');
  const a = await mini('official', 0.4), b = await mini('letterhead', 0.34);
  a.className = 'mini-wrap'; a.style.cssText += ';left:8%;top:6px;transform:rotate(-3deg)';
  b.className = 'mini-wrap'; b.style.cssText += ';right:4%;top:50px;transform:rotate(4deg)';
  art.append(b, a);
  for (const t of $$('.thumb')) {
    const w = t.clientWidth || 380, s = Math.min(0.46, (w - 50) / 816), m = await mini(t.dataset.l, s);
    m.style.boxShadow = '0 6px 22px rgba(0,0,0,.2)'; t.firstElementChild.replaceWith(m);
  }
}
