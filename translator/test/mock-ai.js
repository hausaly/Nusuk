// Test double for the three AI providers. Never used in production.
//   node test/mock-ai.js 3198      → serves /gemini/*, /openai/*, /claude/*
// Behaviour per engine can be changed at runtime:  POST /_mode {"gemini":"quota"}  (ok | quota | badkey | busy | garbage)
import http from 'node:http';

const arDoc = {
  sourceLanguage: { code: 'en', name: 'English' }, documentType: 'Birth Certificate',
  pages: [
    { blocks: [
      { type: 'heading', level: 1, align: 'center', text: 'جمهورية نيجيريا الاتحادية' },
      { type: 'heading', level: 2, align: 'center', text: 'شهادة ميلاد' },
      { type: 'table', borders: true, header: false, rows: [
        ['الاسم الكامل', 'محمد أحمد إبراهيم'], ['تاريخ الميلاد', '12-05-1990'], ['مكان الميلاد', 'مايدوغوري، ولاية بورنو'], ['الجنس', 'ذكر'],
        ['اسم الأب', 'أحمد إبراهيم'], ['اسم الأم', 'عائشة موسى'], ['رقم الشهادة', 'NPC/BR/2290471'], ['تاريخ الإصدار', '03-02-1991'] ] },
      { type: 'paragraph', align: 'justify', text: 'نشهد بأن المعلومات الواردة أعلاه صحيحة ومطابقة للسجلات الرسمية المحفوظة لدى اللجنة الوطنية للسكان، وقد صدرت هذه الشهادة بناءً على طلب صاحب الشأن لتقديمها إلى من يهمه الأمر.' },
      { type: 'list', ordered: false, items: ['يسري هذا المستند على جميع الجهات الرسمية.', 'لا يعتد بأي كشط أو تعديل.'] },
      { type: 'note', text: '[ختم رسمي: اللجنة الوطنية للسكان — فرع بورنو]' }, { type: 'note', text: '[توقيع]' },
    ] },
    { blocks: [
      { type: 'heading', level: 2, align: 'start', text: 'سجل التطعيمات' },
      { type: 'table', borders: true, header: true, rows: [['م', 'اللقاح', 'التاريخ'], ...Array.from({ length: 34 }, (_, i) => [String(i + 1), `لقاح رقم ${i + 1}`, `${String((i % 27) + 1).padStart(2, '0')}-0${(i % 9) + 1}-1991`])] },
      { type: 'paragraph', align: 'start', text: 'انتهى المستند.' },
    ] },
  ],
};
const enDoc = {
  sourceLanguage: { code: 'ar', name: 'Arabic' }, documentType: 'Certificate',
  pages: [{ blocks: [
    { type: 'heading', level: 1, align: 'center', text: 'Certificate of Residence' },
    { type: 'table', borders: false, header: false, rows: [['Name', 'Khalid Al-Rashid'], ['Nationality', 'Saudi'], ['Address', 'Al-Olaya District, Riyadh']] },
    { type: 'paragraph', align: 'justify', text: 'This is to certify that the above-named person resides at the stated address.' },
    { type: 'note', text: '[Official stamp]' },
  ] }],
};

export const state = { modes: { gemini: 'ok', openai: 'ok', claude: 'ok' }, calls: { gemini: 0, openai: 0, claude: 0 }, last: {} };

function answer(engine, system, user) {
  if (/correction assistant/.test(system)) {
    const m = user.match(/CURRENT DOCUMENT:\n([\s\S]*?)\n\nREVIEWER INSTRUCTION:\n"""([\s\S]*?)"""/);
    const doc = JSON.parse(m[1]), ins = m[2];
    const name = (ins.match(/NAME=(\S.*)$/) || [])[1];
    if (name) for (const p of doc.pages) for (const b of p.blocks) if (b.type === 'table') for (const r of b.rows) if (r[0] === 'الاسم الكامل') r[1] = name;
    if (/GARBAGE/.test(ins)) return 'sorry I cannot';
    if (/TRUNCATE/.test(ins)) { doc.pages = [{ blocks: [{ type: 'paragraph', text: 'x' }] }]; }
    return JSON.stringify({ summary: name ? `Changed the full name to ${name}.` : 'No change needed.', document: doc });
  }
  return JSON.stringify(/into English/.test(system) ? enDoc : arDoc);
}

export function startMock(port = 3198) {
  const srv = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {};
    const send = (s, o, h = {}) => { res.writeHead(s, { 'Content-Type': 'application/json', ...h }); res.end(JSON.stringify(o)); };
    if (req.url === '/_mode') { Object.assign(state.modes, body); return send(200, state); }
    if (req.url === '/_state') return send(200, state);
    const engine = req.url.startsWith('/gemini') ? 'gemini' : req.url.startsWith('/openai') ? 'openai' : req.url.startsWith('/claude') ? 'claude' : null;
    if (!engine) return send(404, {});
    state.calls[engine]++;
    const mode = state.modes[engine];
    state.last[engine] = { url: req.url, headers: req.headers, hasFile: JSON.stringify(body).includes('application/pdf') || JSON.stringify(body).includes('image/') };
    if (mode === 'quota') return engine === 'gemini'
      ? send(429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'You exceeded your current quota, please check your plan and billing details.', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '34s' }] } })
      : engine === 'openai' ? send(429, { error: { message: 'You exceeded your current quota, please check your plan and billing details.', type: 'insufficient_quota', code: 'insufficient_quota' } })
      : send(429, { type: 'error', error: { type: 'rate_limit_error', message: 'rate limited' } }, { 'retry-after': '45' });
    if (mode === 'badkey') return engine === 'gemini' ? send(400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } }) : send(401, { error: { message: 'Incorrect API key provided' } });
    if (mode === 'busy') return send(529, { error: { message: 'Overloaded' } });
    let system = '', user = '';
    if (engine === 'gemini') { system = body.systemInstruction.parts[0].text; user = body.contents[0].parts[0].text; }
    else if (engine === 'openai') { system = body.messages[0].content; user = body.messages[1].content[0].text; }
    else { system = body.system; user = body.messages[0].content.find(c => c.type === 'text').text; }
    const text = mode === 'garbage' ? 'I am sorry, I cannot help with that.' : answer(engine, system, user);
    await new Promise(r => setTimeout(r, Number(process.env.MOCK_DELAY_MS) || 150));
    if (engine === 'gemini') return send(200, { candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] });
    if (engine === 'openai') return send(200, { choices: [{ message: { content: text }, finish_reason: 'stop' }] });
    return send(200, { content: [{ type: 'text', text }], stop_reason: 'end_turn' });
  });
  return new Promise(r => srv.listen(port, () => r(srv)));
}

if (import.meta.url === `file://${process.argv[1]}`) startMock(Number(process.argv[2]) || 3198).then(() => console.log('mock AI on', process.argv[2] || 3198));
