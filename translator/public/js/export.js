// PDF (one-click, rendered from the exact preview), vector print, and Word download.
import { renderClean } from './render.js';
import { api, ApiError } from './ui.js';

const loaded = {};
const loadScript = src => loaded[src] ||= new Promise((res, rej) => {
  const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('Could not load the PDF component. Check your connection.')); };
  document.head.appendChild(s);
});

function saveBlob(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

export async function downloadPdf(opts, filename, build, onProgress) {
  await Promise.all([loadScript(`vendor/html2canvas.min.js?v=${build}`), loadScript(`vendor/jspdf.umd.min.js?v=${build}`)]);
  const { host, pages } = await renderClean(opts);
  try {
    const pdf = new window.jspdf.jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait', compress: true });
    pdf.setProperties({ title: filename.replace(/\.pdf$/, ''), creator: 'Hausaly EduTravels Ltd — Translation Desk' });
    for (let i = 0; i < pages.length; i++) {
      onProgress?.(i + 1, pages.length);
      const canvas = await window.html2canvas(pages[i], {
        scale: 2.4, backgroundColor: '#ffffff', useCORS: true, logging: false, width: 816, height: 1056, windowWidth: 816, x: 0, y: 0, scrollX: 0, scrollY: 0,
        onclone: (_doc, el) => { const h = el.closest('.export-host'); if (h) { h.style.left = '0'; h.style.top = '0'; } },
      });
      if (i) pdf.addPage('letter', 'portrait');
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, 612, 792, undefined, 'FAST');
    }
    pdf.save(filename);
  } finally { host.remove(); }
}

/** Vector output with selectable text via the browser's print dialog ("Save as PDF"). */
export async function printDoc(opts) {
  const { host } = await renderClean(opts);
  const done = () => { host.remove(); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  await new Promise(r => setTimeout(r, 250));
  window.print();
  setTimeout(() => { if (document.body.contains(host)) done(); }, 120000);
}

export async function downloadDocx(task) {
  const r = await fetch(`api/tasks/${task.id}/docx`, { credentials: 'same-origin' });
  if (!r.ok) { let m = 'Could not create the Word file.'; try { m = (await r.json()).error || m; } catch {} throw new ApiError(m, r.status); }
  saveBlob(await r.blob(), `${task.ref}.docx`);
}
export const countDownload = id => api('POST', `tasks/${id}/downloaded`, {}).catch(() => {});
