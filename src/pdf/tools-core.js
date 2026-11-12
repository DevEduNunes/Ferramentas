/* ====== núcleo compartilhado das novas ferramentas ====== */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const hexRgb = c => { const n = parseInt(c.slice(1), 16); return rgb((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255); };
const dlPdf = (bytes, name) => download(bytes, name, 'application/pdf');
const FONT_KEYS = {
  Helvetica: [StandardFonts.Helvetica, StandardFonts.HelveticaBold],
  Times: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold],
  Courier: [StandardFonts.Courier, StandardFonts.CourierBold],
};
const CSS_FONT = { Helvetica: 'Helvetica, Arial, sans-serif', Times: '"Times New Roman", Times, serif', Courier: '"Courier New", Courier, monospace' };
const encodeErr = e => /encode|WinAnsi/i.test(e?.message || '') ? new Error('O texto contém caracteres que a fonte padrão do PDF não suporta (use letras latinas, números e acentos comuns).') : e;

/* aplica um intervalo ("1-3, 5", "pares", "ímpares", "todas") e devolve índices 0-based */
function pagesFromSpec(spec, n) {
  const s = (spec || '').trim().toLowerCase();
  if (!s || s === 'todas' || s === 'todos') return Array.from({ length: n }, (_, i) => i);
  if (s === 'pares') return Array.from({ length: n }, (_, i) => i).filter(i => i % 2 === 1);
  if (s === 'impares' || s === 'ímpares') return Array.from({ length: n }, (_, i) => i).filter(i => i % 2 === 0);
  return [...new Set(parseRanges(spec, n).flat())].sort((a, b) => a - b);
}
const rangeField = (label = 'Páginas', value = 'todas') => {
  const inp = h('input', { type: 'text', value, placeholder: 'todas, pares, ímpares, 1-3, 5', style: 'width:240px' });
  return { inp, el: h('label', { class: 'f' }, label, inp) };
};

/* PDF de entrada que o pdf.js abre (inclusive com senha); devolve { pdf, bytes, file, n } */
async function loadPdfJsPw(bytes, password) {
  return pdfjsLib.getDocument({ data: bytes.slice(), password: password || undefined, isEvalSupported: false }).promise;
}
/* seletor de um PDF sem exigir que o pdf-lib consiga abri-lo (para reparar/desbloquear) */
function rawPdf(root, onLoaded, note) {
  const info = h('div', { class: 'item hide' });
  const dz = dropzone({ accept: '.pdf,application/pdf', multiple: false, label: 'Arraste o PDF aqui', onFiles: async ([f]) => {
    const bytes = await readBytes(f);
    info.classList.remove('hide');
    info.replaceChildren(h('span', { class: 'name' }, f.name), h('span', { class: 'meta' }, fmtSize(f.size)));
    onLoaded({ file: f, bytes });
  } });
  root.append(dz, info);
  if (note) root.append(h('p', { class: 'note' }, note));
}

/* rasteriza uma página (para ocultar, desbloquear, reparar): devolve { w, h, bytes(JPEG) } */
async function rasterPage(pdf, n, dpi, q, decorate) {
  const page = await pdf.getPage(n), base = page.getViewport({ scale: 1 });
  const cv = await renderPage(pdf, n, dpi / 72);
  if (decorate) decorate(cv.getContext('2d'), cv.width / base.width);
  const bytes = new Uint8Array(await (await blobOf(cv, 'image/jpeg', q)).arrayBuffer());
  cv.width = cv.height = 0;
  return { w: base.width, h: base.height, bytes };
}
/* camada de texto invisível (busca e seleção) por cima da imagem da página; ignora páginas giradas */
async function addInvisibleText(pdf, n, page, font) {
  try {
    const pg = await pdf.getPage(n); if ((pg.rotate || 0) % 360) return;
    const tc = await pg.getTextContent();
    for (const it of tc.items) {
      if (typeof it.str !== 'string') continue;
      const s = [...it.str].map(ch => { const c = ch.codePointAt(0); return c >= 32 && (c < 256 || WINANSI_EXTRA.has(ch)) ? ch : (c === 9 ? ' ' : '?'); }).join('');
      if (!s.trim()) continue;
      const size = Math.hypot(it.transform[0], it.transform[1]) || 10;
      try { page.drawText(s, { x: it.transform[4] - pg.view[0], y: it.transform[5] - pg.view[1], size, font, opacity: 0 }); } catch {}
    }
  } catch {}
}
async function rasterToPdf(pdf, idxs, dpi, q, prog, decorateFor, textLayer) {
  const out = await PDFDocument.create(), font = textLayer ? await out.embedFont(StandardFonts.Helvetica) : null;
  for (let k = 0; k < idxs.length; k++) {
    prog?.(k, idxs.length, `Página ${idxs[k] + 1}…`);
    const r = await rasterPage(pdf, idxs[k] + 1, dpi, q, decorateFor ? decorateFor(idxs[k]) : null);
    const img = await out.embedJpg(r.bytes), page = out.addPage([r.w, r.h]);
    page.drawImage(img, { x: 0, y: 0, width: r.w, height: r.h });
    if (textLayer) await addInvisibleText(pdf, idxs[k] + 1, page, font);
  }
  return out;
}

/* visualizador de página com camada de desenho (canvas por cima).
   Coordenadas de "exibição": pontos do viewport em escala 1 (origem no canto superior esquerdo, já com a rotação da página). */
function pageViewer(pdf, opt = {}) {
  const V = { n: 1, total: pdf.numPages, scale: opt.scale || 1.3, vp: null, vp1: null, token: 0 };
  const base = h('canvas'), top = h('canvas', { style: 'position:absolute;left:0;top:0;touch-action:none;cursor:crosshair' });
  const stage = h('div', { style: 'position:relative;display:inline-block;line-height:0;background:#fff' }, base, top);
  const scroller = h('div', { style: 'overflow:auto;max-width:100%;max-height:78vh;border:1px solid var(--line);background:#16151b;padding:10px;text-align:center' }, stage);
  const label = h('span', { class: 'meta' });
  const prev = h('button', { class: 'btn', type: 'button', onclick: () => V.go(V.n - 1) }, '←');
  const next = h('button', { class: 'btn', type: 'button', onclick: () => V.go(V.n + 1) }, '→');
  const zoom = h('select', {}, [1, 1.3, 1.7, 2.2].map(z => h('option', { value: z, selected: z === V.scale }, Math.round(z * 100) + '%')));
  zoom.addEventListener('change', () => { V.scale = +zoom.value; V.go(V.n); });
  const bar = h('div', { class: 'row', style: 'margin-bottom:10px' }, prev, label, next, h('span', { class: 'grow' }), h('label', { class: 'f inline' }, 'Zoom', zoom));
  V.el = h('div', {}, bar, scroller); V.top = top; V.stage = stage;
  V.redraw = () => { const c = top.getContext('2d'); c.clearRect(0, 0, top.width, top.height); opt.draw?.(c, V); };
  V.pos = e => { const r = top.getBoundingClientRect(); return { x: (e.clientX - r.left) * top.width / r.width / V.scale, y: (e.clientY - r.top) * top.height / r.height / V.scale }; };
  V.user = (x, y) => { const [ux, uy] = V.vp1.convertToPdfPoint(x, y); return { x: ux, y: uy }; };   // exibição -> espaço do PDF
  V.go = async n => {
    n = clamp(n, 1, V.total); const my = ++V.token; V.n = n;
    const page = await pdf.getPage(n); if (my !== V.token) return;
    V.page = page; V.vp = page.getViewport({ scale: V.scale }); V.vp1 = page.getViewport({ scale: 1 });
    const w = Math.ceil(V.vp.width), hh = Math.ceil(V.vp.height);
    const off = document.createElement('canvas'); off.width = w; off.height = hh;
    const ctx = off.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hh);
    await page.render({ canvasContext: ctx, viewport: V.vp }).promise;
    if (my !== V.token) return;
    base.width = top.width = w; base.height = top.height = hh;
    base.getContext('2d').drawImage(off, 0, 0);
    label.textContent = `Página ${n} de ${V.total}`; prev.disabled = n <= 1; next.disabled = n >= V.total;
    V.redraw(); opt.onPage?.(n, V);
  };
  return V;
}
