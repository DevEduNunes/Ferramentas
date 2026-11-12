/* ====== ferramentas visuais: editar, assinar, formulários, ocultar, comparar ====== */

/* ---------- distâncias e caixas (coordenadas de exibição) ---------- */
const distSeg = (p, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};
const scratchCtx = document.createElement('canvas').getContext('2d');
function textBox(el) {
  scratchCtx.font = `${el.size}px ${CSS_FONT[el.family]}`;
  const ls = el.text.split('\n');
  return { x: el.x, y: el.y - el.size * 0.9, w: Math.max(...ls.map(l => scratchCtx.measureText(l).width), 4), h: ls.length * el.size * 1.2 };
}
function boxOf(el) {
  if (el.t === 'text') return textBox(el);
  if (el.t === 'line') return { x: Math.min(el.x1, el.x2), y: Math.min(el.y1, el.y2), w: Math.abs(el.x1 - el.x2), h: Math.abs(el.y1 - el.y2) };
  if (el.t === 'free') { const xs = el.pts.map(p => p.x), ys = el.pts.map(p => p.y), x = Math.min(...xs), y = Math.min(...ys); return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }; }
  return { x: el.x, y: el.y, w: el.w, h: el.h };
}
function hitEl(el, p) {
  if (el.t === 'line') return distSeg(p, { x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 }) <= 6;
  if (el.t === 'free') return el.pts.some((q, i) => i && distSeg(p, el.pts[i - 1], q) <= 6) || (el.pts.length === 1 && Math.hypot(p.x - el.pts[0].x, p.y - el.pts[0].y) <= 6);
  const b = boxOf(el); return p.x >= b.x - 3 && p.x <= b.x + b.w + 3 && p.y >= b.y - 3 && p.y <= b.y + b.h + 3;
}
function moveEl(el, dx, dy) {
  if (el.t === 'line') { el.x1 += dx; el.x2 += dx; el.y1 += dy; el.y2 += dy; }
  else if (el.t === 'free') el.pts.forEach(q => { q.x += dx; q.y += dy; });
  else { el.x += dx; el.y += dy; }
}
function drawEl(c, el, s) {
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
  switch (el.t) {
    case 'text':
      c.fillStyle = el.color; c.font = `${el.size * s}px ${CSS_FONT[el.family]}`; c.textBaseline = 'alphabetic';
      el.text.split('\n').forEach((l, i) => c.fillText(l, el.x * s, (el.y + i * el.size * 1.2) * s)); break;
    case 'rect': c.strokeStyle = el.color; c.lineWidth = el.lw * s; c.strokeRect(el.x * s, el.y * s, el.w * s, el.h * s); break;
    case 'hl': c.globalAlpha = .38; c.fillStyle = el.fill; c.fillRect(el.x * s, el.y * s, el.w * s, el.h * s); break;
    case 'cover': c.fillStyle = '#fff'; c.fillRect(el.x * s, el.y * s, el.w * s, el.h * s); break;
    case 'line': c.strokeStyle = el.color; c.lineWidth = el.lw * s; c.beginPath(); c.moveTo(el.x1 * s, el.y1 * s); c.lineTo(el.x2 * s, el.y2 * s); c.stroke(); break;
    case 'free': c.strokeStyle = el.color; c.lineWidth = el.lw * s; c.beginPath(); el.pts.forEach((q, i) => i ? c.lineTo(q.x * s, q.y * s) : c.moveTo(q.x * s, q.y * s)); if (el.pts.length === 1) c.lineTo(el.pts[0].x * s + .1, el.pts[0].y * s); c.stroke(); break;
    case 'img': c.drawImage(el.bmp, el.x * s, el.y * s, el.w * s, el.h * s); break;
    case 'field': c.fillStyle = 'rgba(80,140,255,.15)'; c.fillRect(el.x * s, el.y * s, el.w * s, el.h * s); c.strokeStyle = '#508cff'; c.lineWidth = 1.2; c.setLineDash([5, 3]); c.strokeRect(el.x * s, el.y * s, el.w * s, el.h * s); c.setLineDash([]); c.fillStyle = '#7fa8ff'; c.font = `${11 * s}px sans-serif`; c.fillText(el.kind === 'check' ? '☑ caixa' : 'campo de texto', el.x * s + 4, el.y * s + 12 * s); break;
  }
  c.restore();
}

/* ---------- Editar / Assinar ---------- */
function mountEditor(root, { sign }) {
  let cur = null, pdf = null, V = null;
  const EL = {};                       // página (1-based) -> elementos
  let sel = null, tool = sign ? 'sig' : 'select', sigImg = null, drag = null, ta = null;
  const undoStack = [];
  const P = { color: '#d11a2a', fill: '#ffe600', lw: 2, size: 16, family: 'Helvetica' };
  const list = () => (EL[V.n] = EL[V.n] || []);

  const TOOLS = [['select', '↖ Selecionar'], ['text', 'T Texto'], ['rect', '▭ Retângulo'], ['hl', '▮ Realçar'], ['cover', '▯ Cobrir (branco)'], ['line', '╱ Linha'], ['free', '✎ Desenho livre'], ['img', '🖼 Imagem'], ['sig', '✍ Assinatura'], ['field', '▤ Campo de texto'], ['check', '☑ Caixa de seleção']];
  const tbar = h('div', { class: 'tbar' });
  const hints = { select: 'Clique em um item para selecioná-lo; arraste para mover. Delete remove.', text: 'Clique na página e digite. Enter confirma, Shift+Enter quebra a linha.', rect: 'Arraste para desenhar o contorno.', hl: 'Arraste sobre o texto para realçar.', cover: 'Arraste para cobrir uma área com branco (não apaga o texto de verdade: para isso use "Ocultar").', line: 'Arraste para traçar uma linha.', free: 'Mantenha o botão pressionado e desenhe.', img: 'Escolha uma imagem e clique na página para posicioná-la.', sig: 'Crie a assinatura abaixo e clique na página para colocá-la.', field: 'Arraste para criar um campo de texto preenchível.', check: 'Arraste para criar uma caixa de seleção.' };
  const hint = h('p', { class: 'note', style: 'margin:0 0 8px' });
  const setTool = t => {
    tool = t; if (ta) { ta.remove(); ta = null; }
    [...tbar.children].forEach(b => b.setAttribute('aria-pressed', String(b.dataset.t === t)));
    hint.textContent = hints[t] || ''; sigPanel.classList.toggle('hide', t !== 'sig'); imgPanel.classList.toggle('hide', t !== 'img');
    if (V) V.top.style.cursor = t === 'select' ? 'default' : 'crosshair';
  };
  TOOLS.forEach(([t, l]) => tbar.append(h('button', { class: 'tb', type: 'button', 'data-t': t, 'aria-pressed': 'false', onclick: () => setTool(t) }, l)));

  /* propriedades */
  const pc = h('input', { type: 'color', value: P.color }), pf = h('input', { type: 'color', value: P.fill });
  const plw = h('input', { type: 'number', min: '1', max: '20', value: P.lw, style: 'width:70px' });
  const psz = h('input', { type: 'number', min: '6', max: '200', value: P.size, style: 'width:70px' });
  const pfam = h('select', {}, ['Helvetica', 'Times', 'Courier'].map(f => h('option', { value: f }, f)));
  const delBtn = h('button', { class: 'btn', onclick: () => removeSel() }, 'Excluir selecionado');
  const undoBtn = h('button', { class: 'btn', onclick: () => undo() }, '↶ Desfazer');
  const applySel = () => { if (!sel) return; if ('color' in sel) sel.color = P.color; if (sel.t === 'hl') sel.fill = P.fill; if ('lw' in sel) sel.lw = P.lw; if (sel.t === 'text') { sel.size = P.size; sel.family = P.family; } if (sel.t === 'img') { const k = P.size / 16; const r = sel.h / sel.w; sel.w = (sel.baseW || sel.w) * k; sel.h = sel.w * r; } V.redraw(); };
  pc.addEventListener('input', () => { P.color = pc.value; applySel(); });
  pf.addEventListener('input', () => { P.fill = pf.value; applySel(); });
  plw.addEventListener('input', () => { P.lw = clamp(+plw.value || 1, 1, 20); applySel(); });
  psz.addEventListener('input', () => { P.size = clamp(+psz.value || 12, 6, 200); applySel(); });
  pfam.addEventListener('change', () => { P.family = pfam.value; applySel(); });
  const props = h('div', { class: 'row', style: 'margin:10px 0' }, h('label', { class: 'f' }, 'Cor', pc), h('label', { class: 'f' }, 'Realce', pf), h('label', { class: 'f' }, 'Espessura', plw), h('label', { class: 'f' }, 'Tamanho (texto / imagem %)', psz), h('label', { class: 'f' }, 'Fonte', pfam), h('span', { class: 'grow' }), undoBtn, delBtn);

  /* desfazer */
  const undo = () => { const u = undoStack.pop(); if (u) { u(); sel = null; V.redraw(); } };
  const addEl = (el, page = V.n) => { (EL[page] = EL[page] || []).push(el); undoStack.push(() => { const l = EL[page]; const i = l.indexOf(el); if (i >= 0) l.splice(i, 1); }); sel = el; V.redraw(); };
  const removeSel = () => { if (!sel) return; const l = list(), i = l.indexOf(sel), el = sel; if (i < 0) return; l.splice(i, 1); const pg = V.n; undoStack.push(() => { (EL[pg] = EL[pg] || []).splice(i, 0, el); }); sel = null; V.redraw(); };

  /* painel de imagem */
  const imgPick = h('input', { type: 'file', accept: 'image/*', class: 'hide' });
  const imgPanel = h('div', { class: 'row hide', style: 'margin-bottom:10px' }, h('button', { class: 'btn', onclick: () => imgPick.click() }, 'Escolher imagem…'), imgPick, h('span', { class: 'meta' }, 'Depois clique na página para colocar.'));
  const toPng = async blob => { const bmp = await createImageBitmap(blob), cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height; cv.getContext('2d').drawImage(bmp, 0, 0); return { bytes: new Uint8Array(await (await blobOf(cv, 'image/png')).arrayBuffer()), bmp }; };
  imgPick.addEventListener('change', async () => { if (!imgPick.files[0]) return; try { sigImg = await toPng(imgPick.files[0]); toast('Imagem pronta: clique na página.'); } catch { toast('Não foi possível ler a imagem.', 'err'); } imgPick.value = ''; });

  /* painel de assinatura */
  const pad = h('canvas', { width: 600, height: 200, style: 'width:100%;max-width:600px;background:#fff;border:1px solid var(--line2);touch-action:none;cursor:crosshair' });
  const pctx = pad.getContext('2d'); let padDown = false, padInk = false;
  const inkColor = h('input', { type: 'color', value: '#101a6e' });
  const pp = e => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) * pad.width / r.width, (e.clientY - r.top) * pad.height / r.height]; };
  pad.addEventListener('pointerdown', e => { padDown = true; padInk = true; pad.setPointerCapture(e.pointerId); const [x, y] = pp(e); pctx.strokeStyle = inkColor.value; pctx.lineWidth = 3.2; pctx.lineCap = pctx.lineJoin = 'round'; pctx.beginPath(); pctx.moveTo(x, y); pctx.lineTo(x + .1, y + .1); pctx.stroke(); });
  pad.addEventListener('pointermove', e => { if (!padDown) return; const [x, y] = pp(e); pctx.lineTo(x, y); pctx.stroke(); pctx.beginPath(); pctx.moveTo(x, y); });
  pad.addEventListener('pointerup', () => { padDown = false; });
  const tyText = h('input', { type: 'text', placeholder: 'Seu nome', style: 'width:240px' });
  const tyFont = h('select', {}, [['"Segoe Script","Brush Script MT","Lucida Handwriting","Snell Roundhand",cursive', 'Manuscrita'], ['italic 1em "Georgia","Times New Roman",serif', 'Itálico serifado'], ['"Bradley Hand","Segoe Print","Comic Sans MS",cursive', 'Traço livre']].map(([v, t]) => h('option', { value: v }, t)));
  const tyPrev = h('canvas', { width: 600, height: 200, style: 'width:100%;max-width:600px;background:#fff;border:1px solid var(--line2)' });
  const drawTyped = () => { const c = tyPrev.getContext('2d'); c.clearRect(0, 0, 600, 200); c.fillStyle = '#fff'; c.fillRect(0, 0, 600, 200); c.fillStyle = inkColor.value; c.textBaseline = 'middle'; const f = tyFont.value; c.font = f.startsWith('italic') ? f.replace('1em', '90px') : `90px ${f}`; c.fillText(tyText.value || '', 24, 100, 552); };
  [tyText, tyFont, inkColor].forEach(e => e.addEventListener('input', drawTyped));
  const upPick = h('input', { type: 'file', accept: 'image/*', class: 'hide' });
  const upNoBg = h('input', { type: 'checkbox', checked: true });
  const finishSig = async cv => {
    // recorta o espaço vazio e deixa o fundo branco transparente
    const w = cv.width, hh = cv.height, c = cv.getContext('2d'), img = c.getImageData(0, 0, w, hh), d = img.data;
    let x0 = w, y0 = hh, x1 = 0, y1 = 0;
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (d[i + 3] > 20 && !(d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    if (x1 <= x0 || y1 <= y0) throw new Error('A assinatura está vazia.');
    for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; if (l > 235) d[i + 3] = 0; else if (l > 150) d[i + 3] = Math.round(d[i + 3] * (235 - l) / 85); }
    c.putImageData(img, 0, 0);
    const out = document.createElement('canvas'); const pw = x1 - x0 + 1, ph = y1 - y0 + 1; out.width = pw; out.height = ph;
    out.getContext('2d').drawImage(cv, x0, y0, pw, ph, 0, 0, pw, ph);
    const bytes = new Uint8Array(await (await blobOf(out, 'image/png')).arrayBuffer());
    sigImg = { bytes, bmp: await createImageBitmap(out) }; setTool('sig'); toast('Assinatura pronta: clique na página para colocar.');
  };
  const sigTabs = { draw: h('div', {}, pad, h('div', { class: 'row', style: 'margin-top:8px' }, h('button', { class: 'btn', onclick: () => { pctx.clearRect(0, 0, 600, 200); padInk = false; } }, 'Limpar'), h('button', { class: 'primary', onclick: () => run('Preparando…', async () => { if (!padInk) throw new Error('Desenhe a assinatura primeiro.'); const cv = document.createElement('canvas'); cv.width = 600; cv.height = 200; const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, 600, 200); c.drawImage(pad, 0, 0); await finishSig(cv); }) }, 'Usar esta assinatura'))),
    type: h('div', { class: 'hide' }, h('div', { class: 'row' }, h('label', { class: 'f' }, 'Nome', tyText), h('label', { class: 'f' }, 'Estilo', tyFont)), h('div', { style: 'margin-top:8px' }, tyPrev), h('div', { class: 'row', style: 'margin-top:8px' }, h('button', { class: 'primary', onclick: () => run('Preparando…', async () => { if (!tyText.value.trim()) throw new Error('Digite o nome.'); drawTyped(); await finishSig(tyPrev); drawTyped(); }) }, 'Usar esta assinatura'))),
    image: h('div', { class: 'hide' }, h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => upPick.click() }, 'Escolher imagem da assinatura…'), upPick, h('label', { class: 'f inline' }, upNoBg, 'Tornar o fundo branco transparente')), h('p', { class: 'note' }, 'Dica: fotografe sua assinatura em papel branco.')) };
  upPick.addEventListener('change', () => run('Preparando…', async () => {
    const f = upPick.files[0]; if (!f) return; upPick.value = '';
    const bmp = await createImageBitmap(f), k = Math.min(1, 900 / Math.max(bmp.width, bmp.height)), cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height); c.drawImage(bmp, 0, 0, cv.width, cv.height);
    if (upNoBg.checked) await finishSig(cv); else { sigImg = { bytes: new Uint8Array(await (await blobOf(cv, 'image/png')).arrayBuffer()), bmp: await createImageBitmap(cv) }; toast('Imagem pronta: clique na página.'); }
  }));
  const sigTabBtns = h('div', { class: 'tbar' }, [['draw', 'Desenhar'], ['type', 'Digitar'], ['image', 'Imagem']].map(([k, l]) => h('button', { class: 'tb', type: 'button', 'aria-pressed': String(k === 'draw'), onclick: e => { Object.entries(sigTabs).forEach(([kk, el]) => el.classList.toggle('hide', kk !== k)); [...sigTabBtns.children].forEach(b => b.setAttribute('aria-pressed', String(b === e.currentTarget))); if (k === 'type') drawTyped(); } }, l)));
  const sigPanel = h('div', { class: 'card hide', style: 'background:var(--panel2)' }, h('div', { class: 'row', style: 'justify-content:space-between' }, sigTabBtns, h('label', { class: 'f inline' }, 'Cor da tinta', inkColor)), sigTabs.draw, sigTabs.type, sigTabs.image);

  /* texto: caixa de digitação sobre a página */
  const startText = p => {
    if (ta) ta.remove();
    const s = V.scale, size = P.size;
    ta = h('textarea', { rows: '1', style: `position:absolute;left:${p.x * s}px;top:${(p.y - size * .95) * s}px;min-width:140px;min-height:0;width:auto;height:${size * 1.25 * s}px;padding:0 2px;margin:0;font:${size * s}px/${size * 1.2 * s}px ${CSS_FONT[P.family]};color:${P.color};background:rgba(255,255,255,.85);border:1px dashed #8a5bd8;resize:none;overflow:hidden;line-height:${size * 1.2 * s}px` });
    ta.addEventListener('input', () => { ta.style.height = (ta.value.split('\n').length * size * 1.2 * s + 2) + 'px'; });
    const commit = () => { if (!ta) return; const v = ta.value.replace(/\s+$/, ''); const t = ta; ta = null; t.remove(); if (v) addEl({ t: 'text', x: p.x, y: p.y, text: v, size, color: P.color, family: P.family }); };
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); } if (e.key === 'Escape') { ta.value = ''; commit(); } e.stopPropagation(); });
    ta.addEventListener('blur', commit);
    V.stage.append(ta); setTimeout(() => ta && ta.focus(), 0);
  };

  /* desenho e interação */
  const draw = (c, v) => {
    const s = v.scale; (EL[v.n] || []).forEach(el => drawEl(c, el, s));
    if (drag && drag.preview) drawEl(c, drag.preview, s);
    if (sel && (EL[v.n] || []).includes(sel)) { const b = boxOf(sel); c.save(); c.strokeStyle = '#a58be6'; c.lineWidth = 1.5; c.setLineDash([5, 3]); c.strokeRect((b.x - 3) * s, (b.y - 3) * s, (b.w + 6) * s, (b.h + 6) * s); c.restore(); }
  };
  const onDown = e => {
    if (ta) return; const p = V.pos(e);
    if (tool === 'select') {
      const l = list(); sel = null;
      for (let i = l.length - 1; i >= 0; i--) if (hitEl(l[i], p)) { sel = l[i]; break; }
      if (sel) { drag = { mode: 'move', last: p, start: { ...p }, moved: false }; V.top.setPointerCapture(e.pointerId);
        if (sel.color) { pc.value = sel.color; P.color = sel.color; } if (sel.t === 'text') { psz.value = sel.size; P.size = sel.size; pfam.value = sel.family; P.family = sel.family; } if (sel.t === 'img' && !sel.baseW) sel.baseW = sel.w; }
      V.redraw(); return;
    }
    if (tool === 'text') { e.preventDefault(); startText(p); return; }
    if (tool === 'img' || tool === 'sig') {
      if (!sigImg) { toast(tool === 'sig' ? 'Crie ou escolha a assinatura primeiro.' : 'Escolha uma imagem primeiro.', 'err'); return; }
      const w = tool === 'sig' ? 150 : 200, hh = w * sigImg.bmp.height / sigImg.bmp.width;
      addEl({ t: 'img', x: p.x - w / 2, y: p.y - hh / 2, w, h: hh, baseW: w, bytes: sigImg.bytes, bmp: sigImg.bmp });
      setTool('select'); return;
    }
    drag = { mode: 'new', a: p, preview: null }; V.top.setPointerCapture(e.pointerId);
    if (tool === 'free') drag.preview = { t: 'free', pts: [p], color: P.color, lw: P.lw };
  };
  const onMove = e => {
    if (!drag) return; const p = V.pos(e);
    if (drag.mode === 'move') { moveEl(sel, p.x - drag.last.x, p.y - drag.last.y); drag.last = p; drag.moved = true; V.redraw(); return; }
    const a = drag.a, box = { x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), w: Math.abs(p.x - a.x), h: Math.abs(p.y - a.y) };
    if (tool === 'rect') drag.preview = { t: 'rect', ...box, color: P.color, lw: P.lw };
    else if (tool === 'hl') drag.preview = { t: 'hl', ...box, fill: P.fill };
    else if (tool === 'cover') drag.preview = { t: 'cover', ...box };
    else if (tool === 'field' || tool === 'check') drag.preview = { t: 'field', kind: tool, ...box };
    else if (tool === 'line') drag.preview = { t: 'line', x1: a.x, y1: a.y, x2: p.x, y2: p.y, color: P.color, lw: P.lw };
    else if (tool === 'free') drag.preview.pts.push(p);
    V.redraw();
  };
  const onUp = () => {
    if (!drag) return; const d = drag; drag = null;
    if (d.mode === 'move') { if (d.moved) { const dx = d.last.x - d.start.x, dy = d.last.y - d.start.y, el = sel; undoStack.push(() => moveEl(el, -dx, -dy)); } V.redraw(); return; }
    const pv = d.preview; if (!pv) { V.redraw(); return; }
    const tiny = (pv.w != null && (pv.w < 3 || pv.h < 3)) || (pv.t === 'line' && Math.hypot(pv.x2 - pv.x1, pv.y2 - pv.y1) < 3);
    if (!tiny) { if (pv.kind === 'check') { const m = Math.max(pv.w, pv.h, 12); pv.w = pv.h = Math.min(m, 24); } addEl(pv); } else V.redraw();
  };
  const onKey = e => { if (!V || document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return; if (e.key === 'Delete' || e.key === 'Backspace') { removeSel(); e.preventDefault(); } if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { undo(); e.preventDefault(); } };
  document.addEventListener('keydown', onKey);

  /* exportação */
  const save = h('button', { class: 'primary', disabled: true, onclick: () => run('Gerando PDF…', async prog => {
    const doc = await PDFDocument.load(cur.bytes), fonts = {};
    const font = async fam => fonts[fam] || (fonts[fam] = await doc.embedFont(FONT_KEYS[fam][0]));
    const pages = Object.keys(EL).map(Number).filter(n => EL[n].length).sort((a, b) => a - b);
    if (!pages.length) throw new Error('Adicione ao menos um item antes de salvar.');
    let form = null, fieldN = 0; const existing = new Set(doc.getForm().getFields().map(f => f.getName()));
    const embeds = new Map();
    for (let k = 0; k < pages.length; k++) {
      const n = pages[k], page = doc.getPage(n - 1), vp1 = (await pdf.getPage(n)).getViewport({ scale: 1 }), rot = ((vp1.rotation % 360) + 360) % 360;
      const U = (x, y) => { const [ux, uy] = vp1.convertToPdfPoint(x, y); return { x: ux, y: uy }; };
      const rectU = (x, y, w, hh) => { const a = U(x, y), b = U(x + w, y + hh); return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }; };
      for (const el of EL[n]) {
        try {
          if (el.t === 'text') { const f = await font(el.family); el.text.split('\n').forEach((ln, i) => { const q = U(el.x, el.y + i * el.size * 1.2); if (ln) page.drawText(ln, { x: q.x, y: q.y, size: el.size, font: f, color: hexRgb(el.color), rotate: degrees(rot) }); }); }
          else if (el.t === 'rect') page.drawRectangle({ ...rectU(el.x, el.y, el.w, el.h), borderColor: hexRgb(el.color), borderWidth: el.lw });
          else if (el.t === 'hl') page.drawRectangle({ ...rectU(el.x, el.y, el.w, el.h), color: hexRgb(el.fill), opacity: .38 });
          else if (el.t === 'cover') page.drawRectangle({ ...rectU(el.x, el.y, el.w, el.h), color: rgb(1, 1, 1) });
          else if (el.t === 'line') { const a = U(el.x1, el.y1), b = U(el.x2, el.y2); page.drawLine({ start: a, end: b, thickness: el.lw, color: hexRgb(el.color), lineCap: PDFLib.LineCapStyle.Round }); }
          else if (el.t === 'free') { for (let i = 1; i < el.pts.length; i++) page.drawLine({ start: U(el.pts[i - 1].x, el.pts[i - 1].y), end: U(el.pts[i].x, el.pts[i].y), thickness: el.lw, color: hexRgb(el.color), lineCap: PDFLib.LineCapStyle.Round }); if (el.pts.length === 1) { const a = U(el.pts[0].x, el.pts[0].y); page.drawLine({ start: a, end: { x: a.x + .1, y: a.y }, thickness: el.lw, color: hexRgb(el.color), lineCap: PDFLib.LineCapStyle.Round }); } }
          else if (el.t === 'img') {
            let emb = embeds.get(el.bytes); if (!emb) { emb = await doc.embedPng(el.bytes); embeds.set(el.bytes, emb); }
            const q = U(el.x, el.y + el.h), swap = rot % 180 === 90;
            page.drawImage(emb, { x: q.x, y: q.y, width: el.w, height: el.h, rotate: degrees(rot) }); void swap;
          } else if (el.t === 'field') {
            form = form || doc.getForm(); let name; do { name = (el.kind === 'check' ? 'caixa_' : 'campo_') + (++fieldN); } while (existing.has(name));
            const r = rectU(el.x, el.y, el.w, el.h);
            if (el.kind === 'check') { const f = form.createCheckBox(name); f.addToPage(page, { ...r, borderColor: rgb(.3, .3, .3), borderWidth: 1 }); }
            else { const f = form.createTextField(name); f.addToPage(page, { ...r, borderColor: rgb(.3, .3, .3), borderWidth: 1, backgroundColor: rgb(.96, .97, 1) }); }
          }
        } catch (e) { throw encodeErr(e); }
      }
      prog(k + 1, pages.length);
    }
    dlPdf(await doc.save(), `${baseName(cur.file.name)}-${sign ? 'assinado' : 'editado'}.pdf`);
    toast('PDF gerado.');
  }) }, 'Salvar e baixar');

  const box = h('div', { class: 'card hide' }, tbar, hint, imgPanel, sigPanel, props);
  const vhost = h('div', { class: 'card hide' });
  const holder = h('div'); root.append(holder, box, vhost, h('div', { class: 'row end hide', id: 'savebar' }, save));
  const savebar = root.querySelector('#savebar');
  singlePdf(holder, async c => {
    cur = c; pdf = await loadPdfJs(c.bytes); Object.keys(EL).forEach(k => delete EL[k]); undoStack.length = 0; sel = null;
    V = pageViewer(pdf, { scale: 1.25, draw, onPage: () => { sel = null; } });
    V.top.addEventListener('pointerdown', onDown); V.top.addEventListener('pointermove', onMove); V.top.addEventListener('pointerup', onUp); V.top.addEventListener('pointercancel', onUp);
    vhost.replaceChildren(V.el);
    box.classList.remove('hide'); vhost.classList.remove('hide'); savebar.classList.remove('hide'); save.disabled = false;
    setTool(tool); await V.go(1);
  });
  setTool(tool);
  root.unmount = () => { document.removeEventListener('keydown', onKey); pdf?.destroy?.(); };
}
tools.push({ id: 'editar', icon: '✏', title: 'Editar PDF', desc: 'Adicione texto, formas, realces, desenhos, imagens e campos preenchíveis sobre as páginas.', mount: root => mountEditor(root, { sign: false }) });
tools.push({ id: 'assinar', icon: '✍', title: 'Assinar PDF', desc: 'Desenhe, digite ou envie sua assinatura e posicione onde quiser. É uma assinatura visual, sem certificado digital.', mount: root => mountEditor(root, { sign: true }) });

/* ---------- Formulários (preencher) ---------- */
tools.push({ id: 'formularios', icon: '📋', title: 'Preencher formulário', desc: 'Detecta os campos do PDF e permite preencher. Para criar campos novos, use "Editar PDF".',
  mount(root) {
    let cur = null, ctl = [];
    const box = h('div', { class: 'card hide' }), flat = h('input', { type: 'checkbox' });
    const go = h('button', { class: 'primary', onclick: () => run('Salvando…', async () => {
      const form = cur.doc.getForm();
      try {
        ctl.forEach(({ f, kind, get }) => {
          const v = get();
          if (kind === 'text') { f.setText(v || undefined); }
          else if (kind === 'check') { v ? f.check() : f.uncheck(); }
          else if (kind === 'drop' || kind === 'radio') { if (v) f.select(v); else if (kind === 'drop') f.clear?.(); }
          else if (kind === 'list') { f.select(v); }
        });
      } catch (e) { throw encodeErr(e); }
      if (flat.checked) form.flatten();
      dlPdf(await cur.doc.save(), `${baseName(cur.file.name)}-preenchido.pdf`);
      toast('Formulário salvo.');
    }) }, 'Salvar e baixar');
    const build = doc => {
      ctl = []; const rows = [];
      let fields = []; try { fields = doc.getForm().getFields(); } catch {}
      for (const f of fields) {
        const L = PDFLib, cn = f instanceof L.PDFTextField ? 'PDFTextField' : f instanceof L.PDFCheckBox ? 'PDFCheckBox' : f instanceof L.PDFDropdown ? 'PDFDropdown' : f instanceof L.PDFRadioGroup ? 'PDFRadioGroup' : f instanceof L.PDFOptionList ? 'PDFOptionList' : '', name = f.getName();
        let el = null, kind = null, get = null;
        if (cn === 'PDFTextField') { kind = 'text'; const multi = f.isMultiline?.(); el = multi ? h('textarea', { style: 'min-height:80px' }) : h('input', { type: 'text', style: 'width:100%' }); el.value = f.getText() || ''; get = () => el.value; }
        else if (cn === 'PDFCheckBox') { kind = 'check'; el = h('input', { type: 'checkbox' }); el.checked = f.isChecked(); get = () => el.checked; }
        else if (cn === 'PDFDropdown') { kind = 'drop'; const sel0 = f.getSelected()[0] || ''; el = h('select', {}, h('option', { value: '' }, '—'), f.getOptions().map(o => h('option', { value: o, selected: o === sel0 }, o))); get = () => el.value; }
        else if (cn === 'PDFRadioGroup') { kind = 'radio'; const cur0 = f.getSelected() || ''; el = h('select', {}, h('option', { value: '' }, '—'), f.getOptions().map(o => h('option', { value: o, selected: o === cur0 }, o))); get = () => el.value; }
        else if (cn === 'PDFOptionList') { kind = 'list'; const s0 = f.getSelected(); el = h('select', { multiple: true, size: Math.min(6, f.getOptions().length) }, f.getOptions().map(o => h('option', { value: o, selected: s0.includes(o) }, o))); get = () => [...el.selectedOptions].map(o => o.value); }
        else continue;
        ctl.push({ f, kind, get });
        rows.push(h('label', { class: 'f', style: kind === 'check' ? 'flex-direction:row;align-items:center;gap:10px' : '' }, kind === 'check' ? [el, name] : [name, el]));
      }
      box.replaceChildren();
      if (!rows.length) { box.append(h('p', { class: 'warn' }, 'Este PDF não tem campos de formulário. Para escrever sobre o documento, use "Editar PDF"; para criar campos preenchíveis, use os botões "Campo de texto" e "Caixa de seleção" lá.')); return; }
      box.append(h('p', { class: 'meta' }, `${rows.length} campo(s) encontrado(s).`), h('div', { class: 'cols2' }, rows),
        h('div', { class: 'row', style: 'margin-top:14px' }, h('label', { class: 'f inline' }, flat, 'Tornar não editável depois de preencher (achatar)'), h('span', { class: 'grow' }), go));
    };
    const holder = h('div'); root.append(holder, box);
    singlePdf(holder, c => { cur = c; box.classList.remove('hide'); build(c.doc); });
  } });

/* ---------- Ocultar (redação) ---------- */
tools.push({ id: 'ocultar', icon: '⬛', title: 'Ocultar informações', desc: 'Cubra trechos sensíveis de forma definitiva: as páginas afetadas viram imagem, então o texto escondido some de verdade.',
  mount(root) {
    let cur = null, pdf = null, V = null, sel = null, drag = null;
    const RED = {};
    const list = () => (RED[V.n] = RED[V.n] || []);
    const draw = (c, v) => { const s = v.scale; (RED[v.n] || []).forEach(b => { c.fillStyle = 'rgba(0,0,0,.88)'; c.fillRect(b.x * s, b.y * s, b.w * s, b.h * s); if (b === sel) { c.strokeStyle = '#e5646b'; c.lineWidth = 2; c.strokeRect(b.x * s - 2, b.y * s - 2, b.w * s + 4, b.h * s + 4); } }); if (drag && drag.box) { c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(drag.box.x * s, drag.box.y * s, drag.box.w * s, drag.box.h * s); c.strokeStyle = '#e5646b'; c.strokeRect(drag.box.x * s, drag.box.y * s, drag.box.w * s, drag.box.h * s); } };
    const total = () => Object.values(RED).reduce((s, l) => s + l.length, 0);
    const stat = h('span', { class: 'meta' });
    const upd = () => { const pgs = Object.keys(RED).filter(k => RED[k].length).length; stat.textContent = `${total()} área(s) em ${pgs} página(s)`; go.disabled = !total(); };
    const terms = h('input', { type: 'text', placeholder: 'Palavras ou frases separadas por ; (ex.: João Silva; 123.456)', style: 'width:100%' });
    const pat = { cpf: h('input', { type: 'checkbox' }), cnpj: h('input', { type: 'checkbox' }), mail: h('input', { type: 'checkbox' }), tel: h('input', { type: 'checkbox' }) };
    const dpi = h('select', {}, h('option', { value: '150' }, '150 dpi'), h('option', { value: '200', selected: true }, '200 dpi'), h('option', { value: '300' }, '300 dpi'));
    const PATS = { cpf: /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, cnpj: /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g, mail: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, tel: /(?:\(?\d{2}\)?\s?)?9?\d{4}-?\d{4}/g };
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const find = () => run('Procurando…', async prog => {
      const res = [];
      terms.value.split(';').map(s => s.trim()).filter(Boolean).forEach(t => res.push(new RegExp(esc(t), 'gi')));
      Object.entries(pat).forEach(([k, c]) => { if (c.checked) res.push(new RegExp(PATS[k].source, 'g')); });
      if (!res.length) throw new Error('Digite um termo ou marque um padrão.');
      let found = 0;
      for (let n = 1; n <= cur.n; n++) {
        prog(n - 1, cur.n, `Procurando na página ${n}…`);
        const pg = await pdf.getPage(n), vp = pg.getViewport({ scale: 1 }), tc = await pg.getTextContent();
        for (const it of tc.items) {
          if (typeof it.str !== 'string' || !it.str.trim()) continue;
          for (const re of res) {
            re.lastIndex = 0; let m;
            while ((m = re.exec(it.str))) {
              if (!m[0]) { re.lastIndex++; continue; }
              const len = it.str.length, size = Math.hypot(it.transform[0], it.transform[1]) || 10, x0 = it.transform[4] + it.width * (m.index / len), x1 = it.transform[4] + it.width * ((m.index + m[0].length) / len), y = it.transform[5];
              const r = vp.convertToViewportRectangle([x0 - 1.5, y - size * .25, x1 + 1.5, y + size * .9]);
              (RED[n] = RED[n] || []).push({ x: Math.min(r[0], r[2]), y: Math.min(r[1], r[3]), w: Math.abs(r[2] - r[0]), h: Math.abs(r[3] - r[1]) }); found++;
            }
          }
        }
      }
      toast(found ? `${found} trecho(s) marcado(s). Revise cada página.` : 'Nenhuma ocorrência encontrada.'); upd(); V.redraw();
    });
    const go = h('button', { class: 'primary', disabled: true, onclick: () => run('Aplicando…', async prog => {
      const src = await PDFDocument.load(cur.bytes), out = await PDFDocument.create(), d = +dpi.value;
      for (let i = 0; i < cur.n; i++) {
        prog(i, cur.n, `Página ${i + 1} de ${cur.n}…`);
        const boxes = RED[i + 1] || [];
        if (!boxes.length) { const [p] = await out.copyPages(src, [i]); out.addPage(p); continue; }
        const r = await rasterPage(pdf, i + 1, d, .85, (ctx, s) => { ctx.fillStyle = '#000'; boxes.forEach(b => ctx.fillRect(Math.floor(b.x * s), Math.floor(b.y * s), Math.ceil(b.w * s) + 1, Math.ceil(b.h * s) + 1)); });
        const img = await out.embedJpg(r.bytes); out.addPage([r.w, r.h]).drawImage(img, { x: 0, y: 0, width: r.w, height: r.h });
      }
      out.setProducer('PDF Local'); out.setCreator('PDF Local');
      dlPdf(await out.save(), `${baseName(cur.file.name)}-oculto.pdf`); toast('PDF gerado. Confira o resultado antes de compartilhar.');
    }) }, 'Aplicar e baixar');
    const onDown = e => { const p = V.pos(e), l = list(); sel = null; for (let i = l.length - 1; i >= 0; i--) { const b = l[i]; if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) { sel = b; break; } } if (!sel) { drag = { a: p, box: null }; V.top.setPointerCapture(e.pointerId); } V.redraw(); };
    const onMove = e => { if (!drag) return; const p = V.pos(e), a = drag.a; drag.box = { x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), w: Math.abs(p.x - a.x), h: Math.abs(p.y - a.y) }; V.redraw(); };
    const onUp = () => { if (!drag) return; const b = drag.box; drag = null; if (b && b.w > 3 && b.h > 3) { list().push(b); sel = b; upd(); } V.redraw(); };
    const delSel = () => { if (!sel) return; const l = list(); const i = l.indexOf(sel); if (i >= 0) l.splice(i, 1); sel = null; upd(); V.redraw(); };
    const onKey = e => { if (!V || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return; if (e.key === 'Delete' || e.key === 'Backspace') { delSel(); e.preventDefault(); } };
    document.addEventListener('keydown', onKey);
    const box = h('div', { class: 'card hide' },
      h('label', { class: 'f' }, 'Marcar automaticamente (todas as páginas)', terms),
      h('div', { class: 'row', style: 'margin-top:10px' }, h('label', { class: 'f inline' }, pat.cpf, 'CPF'), h('label', { class: 'f inline' }, pat.cnpj, 'CNPJ'), h('label', { class: 'f inline' }, pat.mail, 'E-mail'), h('label', { class: 'f inline' }, pat.tel, 'Telefone'), h('button', { class: 'btn', onclick: find }, 'Marcar ocorrências')),
      h('p', { class: 'note' }, 'Também dá para arrastar sobre a página para cobrir uma área. Clique em uma área e use Delete (ou o botão) para removê-la.'));
    const vhost = h('div', { class: 'card hide' });
    const bar = h('div', { class: 'card hide' }, h('div', { class: 'row' }, stat, h('span', { class: 'grow' }), h('button', { class: 'btn', onclick: delSel }, 'Remover área selecionada'), h('label', { class: 'f inline' }, 'Qualidade', dpi), go),
      h('p', { class: 'warn' }, 'As páginas que têm áreas cobertas são refeitas como imagem (o texto delas deixa de ser selecionável). As demais ficam intactas. Marcadores, anexos e campos do arquivo original não são mantidos nas páginas afetadas.'));
    const holder = h('div'); root.append(holder, box, vhost, bar);
    singlePdf(holder, async c => {
      cur = c; pdf = await loadPdfJs(c.bytes); Object.keys(RED).forEach(k => delete RED[k]); sel = null;
      V = pageViewer(pdf, { scale: 1.25, draw, onPage: () => { sel = null; } });
      V.top.addEventListener('pointerdown', onDown); V.top.addEventListener('pointermove', onMove); V.top.addEventListener('pointerup', onUp);
      vhost.replaceChildren(V.el); [box, vhost, bar].forEach(e => e.classList.remove('hide')); upd(); await V.go(1);
    });
    root.unmount = () => { document.removeEventListener('keydown', onKey); pdf?.destroy?.(); };
  } });

/* ---------- Comparar ---------- */
function diffWords(a, b) {
  const A = a.split(/\s+/).filter(Boolean), B = b.split(/\s+/).filter(Boolean);
  let s = 0; while (s < A.length && s < B.length && A[s] === B[s]) s++;
  let ea = A.length, eb = B.length; while (ea > s && eb > s && A[ea - 1] === B[eb - 1]) { ea--; eb--; }
  const n = ea - s, m = eb - s, ops = [];
  for (let i = 0; i < s; i++) ops.push(['=', A[i]]);
  if (n * m > 6e6) { A.slice(s, ea).forEach(w => ops.push(['-', w])); B.slice(s, eb).forEach(w => ops.push(['+', w])); }
  else {
    const W = m + 1, dp = new Uint16Array((n + 1) * W);
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i * W + j] = A[s + i] === B[s + j] ? dp[(i + 1) * W + j + 1] + 1 : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
    let i = 0, j = 0;
    while (i < n && j < m) { if (A[s + i] === B[s + j]) { ops.push(['=', A[s + i]]); i++; j++; } else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) { ops.push(['-', A[s + i]]); i++; } else { ops.push(['+', B[s + j]]); j++; } }
    while (i < n) ops.push(['-', A[s + i++]]); while (j < m) ops.push(['+', B[s + j++]]);
  }
  for (let i = ea; i < A.length; i++) ops.push(['=', A[i]]);
  return ops;
}
async function pageText(pdf, n) {
  if (n > pdf.numPages) return null;
  const pg = await pdf.getPage(n), tc = await pg.getTextContent();
  return tc.items.map(it => it.str + (it.hasEOL ? '\n' : ' ')).join('').replace(/[ \t]+/g, ' ').trim();
}
async function pageCanvas(pdf, n, scale) { if (n > pdf.numPages) return null; return renderPage(pdf, n, scale); }
function visualDiff(ca, cb) {
  const w = Math.max(ca?.width || 0, cb?.width || 0, 1), hh = Math.max(ca?.height || 0, cb?.height || 0, 1);
  const mk = src => { const c = document.createElement('canvas'); c.width = w; c.height = hh; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, hh); if (src) x.drawImage(src, 0, 0); return c; };
  const A = mk(ca), B = mk(cb), da = A.getContext('2d').getImageData(0, 0, w, hh), db = B.getContext('2d').getImageData(0, 0, w, hh);
  const out = document.createElement('canvas'); out.width = w; out.height = hh; const oc = out.getContext('2d'), od = oc.createImageData(w, hh);
  let diff = 0;
  for (let i = 0; i < da.data.length; i += 4) {
    const d = (Math.abs(da.data[i] - db.data[i]) + Math.abs(da.data[i + 1] - db.data[i + 1]) + Math.abs(da.data[i + 2] - db.data[i + 2])) / 3;
    const g = 255 - (255 - (db.data[i] + db.data[i + 1] + db.data[i + 2]) / 3) * .35;
    if (d > 40) { diff++; od.data[i] = 229; od.data[i + 1] = 57; od.data[i + 2] = 53; } else { od.data[i] = od.data[i + 1] = od.data[i + 2] = g; }
    od.data[i + 3] = 255;
  }
  oc.putImageData(od, 0, 0);
  return { A, B, out, pct: 100 * diff / (w * hh) };
}
tools.push({ id: 'comparar', icon: '⚖', title: 'Comparar PDFs', desc: 'Veja o que mudou entre duas versões: diferenças no texto e marcação visual página a página.',
  mount(root) {
    let A = null, B = null, rows = [], curPage = 1;
    const slot = lab => {
      const st = { pdf: null, file: null }, info = h('div', { class: 'item hide' });
      const dz = dropzone({ accept: '.pdf,application/pdf', multiple: false, label: lab, onFiles: async ([f]) => {
        try { const pdf = await loadPdfJs(await readBytes(f)); st.pdf = pdf; st.file = f; info.classList.remove('hide'); info.replaceChildren(h('span', { class: 'name' }, f.name), h('span', { class: 'meta' }, `${pdf.numPages} pág.`)); go.disabled = !(A.pdf && B.pdf); }
        catch (e) { toast(e?.name === 'PasswordException' ? 'Este PDF tem senha. Use "Desbloquear" antes.' : `Não foi possível abrir "${f.name}": ${errMsg(e)}`, 'err'); }
      } });
      dz.style.padding = '28px 14px';
      return { st, el: h('div', {}, dz, info) };
    };
    const sa = slot('PDF original'), sb = slot('PDF modificado'); A = sa.st; B = sb.st;
    const out = h('div'), detail = h('div');
    const showPage = async n => {
      curPage = n; detail.replaceChildren(h('p', { class: 'meta' }, 'Carregando…'));
      const [ta, tb, ca, cb] = await Promise.all([pageText(A.pdf, n), pageText(B.pdf, n), pageCanvas(A.pdf, n, 1.1), pageCanvas(B.pdf, n, 1.1)]);
      const ops = diffWords(ta || '', tb || ''), vd = visualDiff(ca, cb);
      const box = h('div', { class: 'diffbox' });
      ops.forEach(([t, w]) => box.append(t === '=' ? w + ' ' : h('span', { class: t === '+' ? 'add' : 'del' }, w), ' '));
      const nav = h('div', { class: 'row' }, h('button', { class: 'btn', disabled: n <= 1, onclick: () => showPage(n - 1) }, '←'), h('strong', {}, `Página ${n}`), h('button', { class: 'btn', disabled: n >= Math.max(A.pdf.numPages, B.pdf.numPages), onclick: () => showPage(n + 1) }, '→'),
        h('span', { class: 'stat' }, ta == null ? 'Só existe no modificado.' : tb == null ? 'Só existe no original.' : `${vd.pct.toFixed(2)}% dos pixels diferem`));
      const show = (c, t) => { const el = h('div', {}, h('div', { class: 'meta', style: 'margin-bottom:6px' }, t)); if (c) { c.className = 'cv'; el.append(c); } else el.append(h('p', { class: 'hint meta' }, '(página inexistente)')); return el; };
      detail.replaceChildren(h('div', { class: 'card' }, nav,
        h('div', { class: 'cols3', style: 'margin-top:14px' }, show(vd.A, 'Original'), show(vd.B, 'Modificado'), show(vd.out, 'Diferenças (vermelho)')),
        h('h3', { style: 'margin:18px 0 8px;font-size:15px' }, 'Diferenças no texto'), h('p', { class: 'note', style: 'margin:0 0 8px' }, h('span', { class: 'del' }, 'removido'), ' · ', h('span', { class: 'add' }, 'adicionado')), box));
    };
    const go = h('button', { class: 'primary', disabled: true, onclick: () => run('Comparando…', async prog => {
      rows = []; const N = Math.max(A.pdf.numPages, B.pdf.numPages);
      for (let n = 1; n <= N; n++) {
        prog(n - 1, N, `Comparando página ${n} de ${N}…`);
        const [ta, tb] = await Promise.all([pageText(A.pdf, n), pageText(B.pdf, n)]);
        const ops = diffWords(ta || '', tb || ''), add = ops.filter(o => o[0] === '+').length, del = ops.filter(o => o[0] === '-').length;
        const vd = visualDiff(await pageCanvas(A.pdf, n, .45), await pageCanvas(B.pdf, n, .45));
        rows.push({ n, add, del, pct: vd.pct, only: ta == null ? 'B' : tb == null ? 'A' : '' });
      }
      const changed = rows.filter(r => r.add || r.del || r.pct > .05 || r.only).length;
      out.replaceChildren(h('div', { class: 'card' }, h('p', { class: changed ? 'bad' : 'ok' }, changed ? `${changed} de ${N} página(s) com diferenças.` : 'Nenhuma diferença encontrada.'),
        h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Página', 'Texto', 'Visual', ''].map(x => h('th', {}, x)))),
          h('tbody', {}, rows.map(r => h('tr', {}, h('td', {}, String(r.n)),
            h('td', {}, r.only ? (r.only === 'B' ? 'só no modificado' : 'só no original') : (r.add || r.del) ? [h('span', { class: 'add' }, `+${r.add}`), ' ', h('span', { class: 'del' }, `−${r.del}`), ' palavras'] : 'igual'),
            h('td', {}, r.pct > .05 ? r.pct.toFixed(2) + '% diferente' : 'igual'),
            h('td', {}, h('button', { class: 'btn', onclick: () => { showPage(r.n); detail.scrollIntoView({ behavior: 'smooth' }); } }, 'Ver'))))))));
      const first = rows.find(r => r.add || r.del || r.pct > .05 || r.only) || rows[0]; if (first) await showPage(first.n);
    }) }, 'Comparar');
    root.append(h('div', { class: 'cols2' }, sa.el, sb.el), h('div', { class: 'row end', style: 'margin:14px 0' }, go), out, detail,
      h('p', { class: 'note' }, 'A comparação visual aponta diferenças de pixels; se o conteúdo só se deslocou (uma linha a mais, por exemplo), muitas áreas aparecerão em vermelho. O texto é comparado palavra a palavra.'));
    root.unmount = () => { A.pdf?.destroy?.(); B.pdf?.destroy?.(); };
  } });
