// Dependency-free .docx writer for translated documents (header/footer artwork, bidi/RTL aware).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { LANGS } from './doc.js';
import { layoutById, brandingGet, assetPath, imageSize, titleFor, footerLineFor } from './branding.js';

// ---------- tiny ZIP writer ----------
function zip(entries) {
  const files = [], central = [];
  let offset = 0;
  const d = new Date(), dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const { name, data } of entries) {
    const nameB = Buffer.from(name), raw = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const comp = zlib.deflateRawSync(raw), crc = zlib.crc32(raw);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8);
    h.writeUInt16LE(dosTime, 10); h.writeUInt16LE(dosDate, 12); h.writeUInt32LE(crc, 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(nameB.length, 26);
    files.push(h, nameB, comp);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt16LE(dosTime, 12); c.writeUInt16LE(dosDate, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(nameB.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, nameB);
    offset += h.length + nameB.length + comp.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...files, cd, end]);
}

// ---------- XML helpers ----------
const esc = s => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
const EMU = 914400, TW = 1440;                       // per inch
const FONT = 'Times New Roman', ORANGE = 'F79646';

export function buildDocx({ task, doc }) {
  const L = layoutById(task.layout), B = brandingGet();
  const rtl = LANGS[task.target_lang]?.dir === 'rtl';
  const media = [];                                  // { name, data }
  const imgRel = new Map();                          // part -> [{id, target}]
  let drawId = 1;

  const imageXml = (part, name, widthIn, { align } = {}) => {
    const buf = fs.readFileSync(assetPath(name)), { w, h, ext } = imageSize(buf);
    const fname = `${name}.${ext}`;
    if (!media.some(m => m.name === fname)) media.push({ name: fname, data: buf });
    const rels = imgRel.get(part) || []; imgRel.set(part, rels);
    let rel = rels.find(r => r.target === `media/${fname}`);
    if (!rel) { rel = { id: `rIdImg${rels.length + 1}`, target: `media/${fname}` }; rels.push(rel); }
    const cx = Math.round(widthIn * EMU), cy = Math.round(cx * h / w), id = drawId++;
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="${esc(name)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${esc(fname)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rel.id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  };

  // run + paragraph builders. `r` = rtl content?
  const rPr = (o = {}) => {
    const size = o.size || 22, f = o.font || FONT;
    return `<w:rPr><w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:cs="${f}" w:eastAsia="${f}"/>${o.bold ? '<w:b/><w:bCs/>' : ''}${o.italic ? '<w:i/><w:iCs/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}<w:sz w:val="${size}"/><w:szCs w:val="${o.csSize || size + (o.r ? 4 : 0)}"/>${o.r ? '<w:rtl/>' : ''}<w:lang w:val="en-US" w:bidi="ar-SA"/></w:rPr>`;
  };
  const runs = (text, o) => String(text ?? '').split('\n').map((line, i) => `<w:r>${rPr(o)}${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${esc(line)}</w:t></w:r>`).join('');
  const jc = (a, r) => ({ start: 'left', end: 'right', center: 'center', justify: 'both' }[a] || 'left');   // Word flips left/right itself inside bidi paragraphs
  const para = (inner, { align = 'start', r = false, before = 0, after = 120, line = 276, keepNext = false, pb = false, border, ind } = {}) =>
    `<w:p><w:pPr>${keepNext ? '<w:keepNext/>' : ''}${pb ? '<w:pageBreakBefore/>' : ''}${border || ''}${r ? '<w:bidi/>' : ''}<w:spacing w:before="${before}" w:after="${after}" w:line="${line}" w:lineRule="auto"/>${ind || ''}<w:jc w:val="${jc(align, r)}"/></w:pPr>${inner}</w:p>`;

  // ---------- body ----------
  const body = [];
  const cellParas = (text, o) => String(text ?? '').split('\n').map(line => para(runs(line, o), { r: rtl, align: 'start', after: 40, line: 252 })).join('');
  doc.pages.forEach((page, pi) => {
    let first = true;
    const pb = () => { const v = first && pi > 0; first = false; return v; };
    for (const b of page.blocks) {
      const o = { r: rtl, size: 22 };
      if (b.type === 'heading') {
        const size = b.level === 1 ? 32 : b.level === 2 ? 26 : 23;
        body.push(para(runs(b.text, { ...o, bold: true, size }), { r: rtl, align: b.align, before: b.level === 1 ? 60 : 160, after: 140, keepNext: true, pb: pb() }));
      } else if (b.type === 'paragraph') {
        body.push(para(runs(b.text, { ...o, bold: b.bold }), { r: rtl, align: b.align, pb: pb() }));
      } else if (b.type === 'note') {
        body.push(para(runs(b.text, { ...o, italic: true, color: '595959', size: 20 }), { r: rtl, align: 'center', pb: pb() }));
      } else if (b.type === 'divider') {
        body.push(para('', { r: rtl, after: 100, pb: pb(), border: '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="808080"/></w:pBdr>' }));
      } else if (b.type === 'list') {
        b.items.forEach((it, i) => body.push(para(runs(`${b.ordered ? i + 1 + '.' : '•'}  ${it}`, o), { r: rtl, after: 60, pb: i === 0 ? pb() : false, ind: '<w:ind w:left="360" w:hanging="360"/>' })));
      } else if (b.type === 'table') {
        const cols = b.rows[0].length, bd = b.borders ? 'single' : 'nil';
        const edge = n => `<w:${n} w:val="${bd}" w:sz="4" w:space="0" w:color="808080"/>`;
        let tbl = `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>${rtl ? '<w:bidiVisual/>' : ''}<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(edge).join('')}</w:tblBorders><w:tblLayout w:type="autofit"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${Array(cols).fill(`<w:gridCol w:w="${Math.floor(9000 / cols)}"/>`).join('')}</w:tblGrid>`;
        b.rows.forEach((row, ri) => {
          const head = b.header && ri === 0;
          tbl += `<w:tr>${head ? '<w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>' : '<w:trPr><w:cantSplit/></w:trPr>'}${row.map(c => `<w:tc><w:tcPr><w:tcW w:w="${Math.floor(5000 / cols)}" w:type="pct"/>${head ? '<w:shd w:val="clear" w:color="auto" w:fill="EDEDED"/>' : ''}</w:tcPr>${cellParas(c, { ...o, bold: head, size: 21 })}</w:tc>`).join('')}</w:tr>`;
        });
        tbl += '</w:tbl>';
        if (pb()) body.push(para('', { r: rtl, after: 0, pb: true, line: 120 }));
        body.push(tbl, para('', { r: rtl, after: 80, line: 160 }));
      }
    }
  });
  const sectPr = `<w:sectPr><w:headerReference w:type="default" r:id="rIdHdr"/><w:footerReference w:type="default" r:id="rIdFtr"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="${L.id === 'minimal' ? 1500 : 2350}" w:right="${L.frame ? 1500 : 1300}" w:bottom="${L.id === 'minimal' ? 1500 : L.footerBand ? 2400 : 1700}" w:left="${L.frame ? 1500 : 1300}" w:header="${L.id === 'minimal' ? 500 : 560}" w:footer="${L.footerBand ? 380 : 500}" w:gutter="0"/>${L.frame ? '<w:pgBorders w:offsetFrom="text"><w:top w:val="single" w:sz="6" w:space="10" w:color="BFBFBF"/><w:left w:val="single" w:sz="6" w:space="10" w:color="BFBFBF"/><w:bottom w:val="single" w:sz="6" w:space="10" w:color="BFBFBF"/><w:right w:val="single" w:sz="6" w:space="10" w:color="BFBFBF"/></w:pgBorders>' : ''}</w:sectPr>`;
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body.join('')}${sectPr}</w:body></w:document>`;

  // ---------- header ----------
  const hp = [];
  const small = (t, o = {}) => runs(t, { size: 16, font: 'Arial', ...o });
  const noBorders = `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(n => `<w:${n} w:val="nil"/>`).join('')}</w:tblBorders>`;
  if (L.headerBand) {
    hp.push(`<w:tbl><w:tblPr><w:tblW w:w="9200" w:type="dxa"/><w:jc w:val="center"/>${noBorders}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="6350"/><w:gridCol w:w="2850"/></w:tblGrid><w:tr>` +
      `<w:tc><w:tcPr><w:tcW w:w="6350" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${para(imageXml('header', 'header-left', 4.4), { after: 0, line: 240 })}</w:tc>` +
      `<w:tc><w:tcPr><w:tcW w:w="2850" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="C4C4C4"/><w:vAlign w:val="center"/></w:tcPr>${para(small(B.badgeLine, { bold: true, color: '7F7F7F' }), { after: 0, line: 240, ind: '<w:ind w:left="120"/>' })}${para(small(`TRANSLATOR ID: ${task.translator_id}`, { bold: true, color: '7F7F7F' }), { after: 0, line: 240, ind: '<w:ind w:left="120"/>' })}</w:tc>` +
      `</w:tr></w:tbl>`);
    hp.push(para('', { after: 60, line: 120, border: '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="000000"/></w:pBdr>' }));
    if (L.title) hp.push(para(runs(titleFor(task, doc), { size: 26, font: 'Arial Narrow', color: ORANGE, bold: false }), { align: 'center', before: 100, after: 120 }));
  } else {
    hp.push(para(imageXml('header', 'logo', 1.1), { after: 40 }));
    hp.push(para(small(`${B.companyName} — ${titleFor(task, doc)}`, { color: '595959' }), { after: 60, border: '<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="4" w:color="BFBFBF"/></w:pBdr>' }));
  }
  const headerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${NS}>${hp.join('')}</w:hdr>`;

  // ---------- footer ----------
  const fp = [];
  fp.push(para(runs(footerLineFor(task), { size: L.id === 'official' ? 24 : 18, font: L.id === 'official' ? 'Arial Narrow' : 'Arial', color: L.id === 'official' ? ORANGE : '595959' }), { align: 'center', after: 60, before: 40 }));
  if (L.footerLine) fp.push(para(small(B.registeredLine, { size: 14, color: '404040' }), { align: 'center', after: 40, line: 240, border: '<w:pBdr><w:top w:val="single" w:sz="6" w:space="3" w:color="000000"/></w:pBdr>' }));
  if (L.footerBand) fp.push(para(imageXml('footer', 'footer-band', 6.0), { align: 'center', after: 20, line: 240 }));
  const contact = esc(B.contactLine).split(esc(B.companyName)).map(t => `<w:r>${rPr({ size: 14, font: 'Arial', color: '404040' })}<w:t xml:space="preserve">${t}</w:t></w:r>`).join(`<w:r>${rPr({ size: 14, font: 'Arial', bold: true, color: '404040' })}<w:t xml:space="preserve">${esc(B.companyName)}</w:t></w:r>`);
  fp.push(para(contact, { align: 'center', after: 0, line: 240 }));
  const footerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}>${fp.join('')}</w:ftr>`;

  // ---------- package ----------
  const relsFor = part => (imgRel.get(part) || []).map(r => `<Relationship Id="${r.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${r.target}"/>`).join('');
  const relsXml = inner => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${inner}</Relationships>`;
  const entries = [
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
    { name: '_rels/.rels', data: relsXml(`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>`) },
    { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(task.ref)} — ${esc(titleFor(task, doc))}</dc:title><dc:creator>${esc(B.companyName)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>` },
    { name: 'word/document.xml', data: documentXml },
    { name: 'word/header1.xml', data: headerXml },
    { name: 'word/footer1.xml', data: footerXml },
    { name: 'word/styles.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/><w:sz w:val="22"/><w:szCs w:val="26"/><w:lang w:val="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>` },
    { name: 'word/settings.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings ${NS}><w:bordersDoNotSurroundHeader/><w:bordersDoNotSurroundFooter/><w:defaultTabStop w:val="720"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>` },
    { name: 'word/_rels/document.xml.rels', data: relsXml(`<Relationship Id="rIdHdr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdFtr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/><Relationship Id="rIdSty" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdSet" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>`) },
    { name: 'word/_rels/header1.xml.rels', data: relsXml(relsFor('header')) },
    { name: 'word/_rels/footer1.xml.rels', data: relsXml(relsFor('footer')) },
    ...media.map(m => ({ name: `word/media/${m.name}`, data: m.data })),
  ];
  return zip(entries);
}
