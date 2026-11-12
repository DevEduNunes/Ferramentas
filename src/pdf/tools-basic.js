/* ====== ferramentas simples: girar, recortar, números, metadados, reparar, texto→PDF, digitalizar ====== */

/* posiciona um texto (origem de exibição = canto inferior esquerdo, y para cima) respeitando a rotação da página */
function drawDisplayText(page, text, o) {
  const r = ((page.getRotation().angle % 360) + 360) % 360, { width: W, height: H } = page.getSize();
  const dx = o.x, dy = o.y;
  const [x, y] = r === 0 ? [dx, dy] : r === 90 ? [W - dy, dx] : r === 180 ? [W - dx, H - dy] : [dy, H - dx];
  page.drawText(text, { x, y, size: o.size, font: o.font, color: o.color, rotate: degrees(r), opacity: o.opacity });
}
const displaySize = page => { const r = page.getRotation().angle % 180, s = page.getSize(); return r ? { w: s.height, h: s.width } : { w: s.width, h: s.height }; };

/* ---------- Girar ---------- */
tools.push({ id: 'girar', icon: '🔄', title: 'Girar PDF', desc: 'Gire todas as páginas, só algumas, ou apenas as pares e ímpares.',
  mount(root) {
    let cur = null;
    const ang = h('select', {}, h('option', { value: '90' }, '90° para a direita (horário)'), h('option', { value: '270' }, '90° para a esquerda (anti-horário)'), h('option', { value: '180' }, '180°'));
    const rg = rangeField('Páginas', 'todas');
    const thumb = h('img', { alt: 'Prévia da primeira página', style: 'max-height:150px;border:1px solid var(--line);background:#fff;transition:transform .25s' });
    const prevBox = h('div', { style: 'width:170px;height:170px;display:flex;align-items:center;justify-content:center;overflow:hidden' }, thumb);
    const upd = () => { thumb.style.transform = `rotate(${ang.value}deg)${ang.value === '180' ? '' : ' scale(.72)'}`; };
    ang.addEventListener('change', upd);
    const go = h('button', { class: 'primary', disabled: true, onclick: () => run('Girando…', async () => {
      const doc = await PDFDocument.load(cur.bytes), idx = pagesFromSpec(rg.inp.value, cur.n), a = +ang.value;
      idx.forEach(i => { const p = doc.getPage(i); p.setRotation(degrees((p.getRotation().angle + a) % 360)); });
      dlPdf(await doc.save(), `${baseName(cur.file.name)}-girado.pdf`);
      toast(`${idx.length} página(s) girada(s).`);
    }) }, 'Girar e baixar');
    const opts = h('div', { class: 'card hide' }, h('div', { class: 'row' }, prevBox, h('label', { class: 'f' }, 'Rotação', ang), rg.el, h('span', { class: 'grow' }), go));
    const holder = h('div'); root.append(holder, opts);
    singlePdf(holder, async c => {
      cur = c; go.disabled = false; opts.classList.remove('hide'); upd();
      try { const pdf = await loadPdfJs(c.bytes); thumb.src = (await renderPage(pdf, 1, .35)).toDataURL('image/jpeg', .7); } catch {}
    });
  } });

/* ---------- Números de página ---------- */
tools.push({ id: 'numeros', icon: '🔢', title: 'Números de página', desc: 'Numere as páginas escolhendo posição, formato e fonte.',
  mount(root) {
    let cur = null;
    const pos = h('select', {}, [['bc', 'Rodapé, centro'], ['br', 'Rodapé, direita'], ['bl', 'Rodapé, esquerda'], ['tc', 'Topo, centro'], ['tr', 'Topo, direita'], ['tl', 'Topo, esquerda']].map(([v, t]) => h('option', { value: v }, t)));
    const fmt = h('select', {}, [['{n}', '1'], ['{n} / {total}', '1 / 10'], ['Página {n} de {total}', 'Página 1 de 10'], ['- {n} -', '- 1 -'], ['custom', 'Personalizado…']].map(([v, t]) => h('option', { value: v }, t)));
    const custom = h('input', { type: 'text', value: 'Relatório · pág. {n}', class: 'hide', style: 'width:220px' });
    const start = h('input', { type: 'number', value: '1', min: '0', style: 'width:80px' });
    const size = h('input', { type: 'number', value: '10', min: '6', max: '48', style: 'width:80px' });
    const margin = h('input', { type: 'number', value: '28', min: '5', max: '120', style: 'width:80px' });
    const family = h('select', {}, ['Helvetica', 'Times', 'Courier'].map(f => h('option', { value: f }, f)));
    const color = h('input', { type: 'color', value: '#404040' });
    const rg = rangeField('Numerar as páginas', 'todas');
    const sample = h('span', { class: 'meta' });
    const tpl = () => fmt.value === 'custom' ? custom.value : fmt.value;
    const fill = (t, n, total) => t.replace(/\{n\}/g, n).replace(/\{total\}/g, total);
    const upd = () => { custom.classList.toggle('hide', fmt.value !== 'custom'); sample.textContent = 'Exemplo: ' + fill(tpl(), +start.value || 1, cur ? cur.n : 10); };
    [fmt, custom, start].forEach(e => e.addEventListener('input', upd));
    const go = h('button', { class: 'primary', disabled: true, onclick: () => run('Numerando…', async prog => {
      const doc = await PDFDocument.load(cur.bytes), font = await doc.embedFont(FONT_KEYS[family.value][0]);
      const idx = pagesFromSpec(rg.inp.value, cur.n), sz = +size.value || 10, mg = +margin.value || 28, st = +start.value || 1;
      try {
        idx.forEach((i, k) => {
          const p = doc.getPage(i), d = displaySize(p), s = fill(tpl(), st + k, cur.n);
          const tw = font.widthOfTextAtSize(s, sz), v = pos.value;
          const x = v[1] === 'c' ? (d.w - tw) / 2 : v[1] === 'r' ? d.w - tw - mg : mg;
          const y = v[0] === 'b' ? mg - sz * 0.2 : d.h - mg - sz * 0.8;
          drawDisplayText(p, s, { x, y, size: sz, font, color: hexRgb(color.value) });
          prog(k + 1, idx.length);
        });
      } catch (e) { throw encodeErr(e); }
      dlPdf(await doc.save(), `${baseName(cur.file.name)}-numerado.pdf`);
      toast('PDF numerado gerado.');
    }) }, 'Numerar e baixar');
    const opts = h('div', { class: 'card hide' },
      h('div', { class: 'row' }, h('label', { class: 'f' }, 'Posição', pos), h('label', { class: 'f' }, 'Formato', fmt), h('label', { class: 'f' }, 'Texto', custom), h('label', { class: 'f' }, 'Começar em', start)),
      h('div', { class: 'row', style: 'margin-top:14px' }, h('label', { class: 'f' }, 'Fonte', family), h('label', { class: 'f' }, 'Tamanho', size), h('label', { class: 'f' }, 'Margem (pt)', margin), h('label', { class: 'f' }, 'Cor', color), rg.el),
      h('div', { class: 'row', style: 'margin-top:14px' }, sample, h('span', { class: 'grow' }), go),
      h('p', { class: 'note' }, 'Use {n} para o número da página e {total} para o total de páginas.'));
    const holder = h('div'); root.append(holder, opts);
    singlePdf(holder, c => { cur = c; go.disabled = false; opts.classList.remove('hide'); upd(); });
  } });

/* ---------- Recortar ---------- */
tools.push({ id: 'recortar', icon: '✂', title: 'Recortar PDF', desc: 'Tire margens: arraste na página para escolher a área que fica, ou digite as margens.',
  mount(root) {
    let cur = null, pdf = null, V = null;
    const M = { l: 0, t: 0, r: 0, b: 0 };            // margens em pontos (exibição)
    const mm = p => +(p * 25.4 / 72).toFixed(1);
    const inp = k => h('input', { type: 'number', min: '0', step: '0.5', value: '0', style: 'width:84px', 'aria-label': 'Margem ' + k });
    const I = { t: inp('superior'), r: inp('direita'), b: inp('inferior'), l: inp('esquerda') };
    const sync = () => Object.keys(I).forEach(k => { I[k].value = mm(M[k]); });
    Object.keys(I).forEach(k => I[k].addEventListener('input', () => { M[k] = Math.max(0, (+I[k].value || 0) * 72 / 25.4); V && V.redraw(); }));
    const rg = rangeField('Aplicar às páginas', 'todas');
    let drag = null;
    const draw = (c, v) => {
      const s = v.scale, W = v.vp1.width * s, H = v.vp1.height * s;
      const x0 = M.l * s, y0 = M.t * s, x1 = W - M.r * s, y1 = H - M.b * s;
      c.fillStyle = 'rgba(0,0,0,.55)';
      c.fillRect(0, 0, W, y0); c.fillRect(0, y1, W, H - y1); c.fillRect(0, y0, x0, y1 - y0); c.fillRect(x1, y0, W - x1, y1 - y0);
      c.strokeStyle = '#a58be6'; c.lineWidth = 2; c.setLineDash([6, 4]); c.strokeRect(x0, y0, x1 - x0, y1 - y0);
    };
    const go = h('button', { class: 'primary', disabled: true, onclick: () => run('Recortando…', async prog => {
      const doc = await PDFDocument.load(cur.bytes), idx = pagesFromSpec(rg.inp.value, cur.n);
      for (let k = 0; k < idx.length; k++) {
        const pg = await pdf.getPage(idx[k] + 1), vp = pg.getViewport({ scale: 1 });
        const x0 = M.l, y0 = M.t, x1 = vp.width - M.r, y1 = vp.height - M.b;
        if (x1 - x0 < 10 || y1 - y0 < 10) throw new Error(`As margens são grandes demais para a página ${idx[k] + 1}.`);
        const a = vp.convertToPdfPoint(x0, y0), b = vp.convertToPdfPoint(x1, y1);
        const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]), w = Math.abs(a[0] - b[0]), hh = Math.abs(a[1] - b[1]);
        const p = doc.getPage(idx[k]); p.setCropBox(x, y, w, hh); p.setMediaBox(x, y, w, hh);
        prog(k + 1, idx.length);
      }
      dlPdf(await doc.save(), `${baseName(cur.file.name)}-recortado.pdf`);
      toast('PDF recortado.');
    }) }, 'Recortar e baixar');
    const reset = h('button', { class: 'btn', onclick: () => { Object.keys(M).forEach(k => M[k] = 0); sync(); V && V.redraw(); } }, 'Limpar');
    const opts = h('div', { class: 'card hide' },
      h('div', { class: 'row' }, h('label', { class: 'f' }, 'Superior (mm)', I.t), h('label', { class: 'f' }, 'Direita (mm)', I.r), h('label', { class: 'f' }, 'Inferior (mm)', I.b), h('label', { class: 'f' }, 'Esquerda (mm)', I.l), rg.el, h('span', { class: 'grow' }), reset, go));
    const vhost = h('div', { class: 'card hide' });
    const holder = h('div'); root.append(holder, opts, vhost);
    singlePdf(holder, async c => {
      cur = c; go.disabled = false; opts.classList.remove('hide'); vhost.classList.remove('hide');
      pdf = await loadPdfJs(c.bytes);
      V = pageViewer(pdf, { scale: 1.1, draw });
      vhost.replaceChildren(V.el, h('p', { class: 'note' }, 'As margens valem para todas as páginas escolhidas, medidas a partir de cada borda. Isso corta a visualização; o conteúdo fora da área deixa de aparecer, mas não é apagado do arquivo. Para remover de verdade, use "Ocultar".'));
      V.top.addEventListener('pointerdown', e => { const p = V.pos(e); drag = { x: p.x, y: p.y }; V.top.setPointerCapture(e.pointerId); });
      V.top.addEventListener('pointermove', e => {
        if (!drag) return; const p = V.pos(e), W = V.vp1.width, H = V.vp1.height;
        const x0 = clamp(Math.min(drag.x, p.x), 0, W), x1 = clamp(Math.max(drag.x, p.x), 0, W), y0 = clamp(Math.min(drag.y, p.y), 0, H), y1 = clamp(Math.max(drag.y, p.y), 0, H);
        M.l = x0; M.t = y0; M.r = W - x1; M.b = H - y1; sync(); V.redraw();
      });
      V.top.addEventListener('pointerup', () => { drag = null; });
      Object.keys(M).forEach(k => M[k] = 0); sync();
      await V.go(1);
    });
    root.unmount = () => { pdf?.destroy?.(); };
  } });

/* ---------- Metadados ---------- */
tools.push({ id: 'metadados', icon: '🏷', title: 'Metadados', desc: 'Veja, edite ou remova título, autor e outras informações escondidas no PDF.',
  mount(root) {
    let cur = null, doc = null;
    const KEYS = [['Title', 'Título', 'getTitle', 'setTitle'], ['Author', 'Autor', 'getAuthor', 'setAuthor'], ['Subject', 'Assunto', 'getSubject', 'setSubject'], ['Keywords', 'Palavras-chave', 'getKeywords', 'setKeywords'], ['Creator', 'Criado com', 'getCreator', 'setCreator'], ['Producer', 'Gerado por', 'getProducer', 'setProducer']];
    const F = {}; KEYS.forEach(([k, l]) => { F[k] = h('input', { type: 'text', style: 'width:100%' }); });
    const dates = h('p', { class: 'note' });
    const strip = async d => {
      const info = d.getInfoDict();
      ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer', 'CreationDate', 'ModDate'].forEach(k => info.delete(PDFLib.PDFName.of(k)));
      d.catalog.delete(PDFLib.PDFName.of('Metadata'));
    };
    const save = clear => run('Salvando…', async () => {
      const d = await PDFDocument.load(cur.bytes, { updateMetadata: false });
      await strip(d);
      if (!clear) KEYS.forEach(([k, , , set]) => { const v = F[k].value.trim(); if (v) d[set](k === 'Keywords' ? v.split(/[,;]/).map(s => s.trim()).filter(Boolean) : v); });
      dlPdf(await d.save(), `${baseName(cur.file.name)}${clear ? '-limpo' : '-metadados'}.pdf`);
      toast(clear ? 'Metadados removidos.' : 'Metadados atualizados.');
    });
    const opts = h('div', { class: 'card hide' }, h('div', { class: 'cols2' }, KEYS.map(([k, l]) => h('label', { class: 'f' }, l, F[k]))), dates,
      h('div', { class: 'row end', style: 'margin-top:14px' }, h('button', { class: 'btn', onclick: () => save(true) }, 'Remover todos e baixar'), h('button', { class: 'primary', onclick: () => save(false) }, 'Salvar alterações e baixar')),
      h('p', { class: 'note' }, 'Remover apaga os campos acima, as datas e o bloco XMP. Isso não altera o conteúdo das páginas.'));
    const holder = h('div'); root.append(holder, opts);
    singlePdf(holder, c => {
      cur = c; doc = c.doc; opts.classList.remove('hide');
      KEYS.forEach(([k, , get]) => { try { F[k].value = doc[get]() || ''; } catch { F[k].value = ''; } });
      const cd = doc.getCreationDate?.(), md = doc.getModificationDate?.();
      dates.textContent = `Criado em: ${cd ? cd.toLocaleString('pt-BR') : '—'}  ·  Modificado em: ${md ? md.toLocaleString('pt-BR') : '—'}`;
    });
  } });

/* ---------- Reparar ---------- */
tools.push({ id: 'reparar', icon: '🛠', title: 'Reparar PDF', desc: 'Tenta recuperar PDFs corrompidos: primeiro reconstrói a estrutura; se não der, refaz as páginas como imagens.',
  mount(root) {
    let cur = null;
    const log = h('div', { class: 'stat' });
    const say = (msg, cls) => log.append(h('div', { class: cls || '' }, msg));
    const go = h('button', { class: 'primary', disabled: true, onclick: () => run('Reparando…', async prog => {
      log.replaceChildren(); const name = baseName(cur.file.name);
      try {
        const doc = await PDFDocument.load(cur.bytes, { throwOnInvalidObject: false, updateMetadata: false });
        const out = await doc.save();
        const chk = await loadPdfJs(out); await chk.getPage(1);
        say(`✔ Estrutura reconstruída (${doc.getPageCount()} páginas).`, 'ok');
        dlPdf(out, `${name}-reparado.pdf`); toast('PDF reparado.'); return;
      } catch (e) { say('A reconstrução da estrutura não foi suficiente: ' + errMsg(e)); }
      let pdf;
      try { pdf = await loadPdfJs(cur.bytes); } catch (e) { say('✖ O leitor também não conseguiu abrir o arquivo: ' + errMsg(e), 'bad'); throw new Error('Arquivo irrecuperável.'); }
      const good = []; let lost = 0;
      for (let i = 1; i <= pdf.numPages; i++) { try { await rasterPage(pdf, i, 40, .3); good.push(i - 1); } catch { lost++; } }
      if (!good.length) { say('✖ Nenhuma página pôde ser lida.', 'bad'); throw new Error('Arquivo irrecuperável.'); }
      const out = await rasterToPdf(pdf, good, 130, .8, prog, null, true);
      say(`✔ ${good.length} página(s) refeitas como imagens${lost ? `; ${lost} não puderam ser lidas` : ''}. O texto deixa de ser selecionável.`, lost ? '' : 'ok');
      dlPdf(await out.save(), `${name}-reparado.pdf`); toast('PDF recuperado como imagens.');
    }) }, 'Tentar reparar e baixar');
    const opts = h('div', { class: 'card hide' }, h('div', { class: 'row' }, h('span', { class: 'meta' }, 'Nada é enviado: a leitura e a gravação acontecem aqui no navegador.'), h('span', { class: 'grow' }), go), log);
    const holder = h('div'); root.append(holder, opts);
    rawPdf(holder, c => { cur = c; go.disabled = false; opts.classList.remove('hide'); log.replaceChildren(); });
  } });

/* ---------- Texto → PDF ---------- */
const WINANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.split(''));
tools.push({ id: 'texto2pdf', icon: '📝', title: 'Texto → PDF', desc: 'Digite ou cole um texto (ou arquivo .txt / .md) e gere um PDF paginado.',
  mount(root) {
    const ta = h('textarea', { placeholder: 'Cole seu texto aqui. Com "Markdown simples" ligado: # Título, ## Subtítulo, - item de lista.', spellcheck: 'false' });
    const page = h('select', {}, h('option', { value: 'a4' }, 'A4'), h('option', { value: 'letter' }, 'Carta'));
    const family = h('select', {}, ['Helvetica', 'Times', 'Courier'].map(f => h('option', { value: f }, f)));
    const size = h('input', { type: 'number', value: '11', min: '7', max: '28', style: 'width:80px' });
    const margin = h('input', { type: 'number', value: '20', min: '5', max: '60', style: 'width:80px' });
    const md = h('input', { type: 'checkbox', checked: true });
    const go = h('button', { class: 'primary', onclick: () => run('Gerando PDF…', async () => {
      const raw = ta.value; if (!raw.trim()) throw new Error('Digite ou cole algum texto.');
      const doc = await PDFDocument.create();
      const [reg, bold] = await Promise.all(FONT_KEYS[family.value].map(k => doc.embedFont(k)));
      const [PW, PH] = page.value === 'a4' ? [595.28, 841.89] : [612, 792], mg = (+margin.value || 20) * 72 / 25.4, base = +size.value || 11;
      let replaced = 0;
      const safe = s => [...s.replace(/\t/g, '    ')].map(ch => { const c = ch.codePointAt(0); if (c < 32) return ''; if (c < 256 || WINANSI_EXTRA.has(ch)) return ch; replaced++; return '?'; }).join('');
      let pg = null, y = 0;
      const newPage = () => { pg = doc.addPage([PW, PH]); y = PH - mg; };
      const line = (txt, o) => {
        const lh = o.size * 1.35;
        if (!pg || y - lh < mg) newPage();
        y -= lh; if (txt) pg.drawText(txt, { x: mg + (o.indent || 0), y: y + o.size * 0.25, size: o.size, font: o.font, color: rgb(.1, .1, .1) });
      };
      const wrap = (txt, o) => {
        const maxW = PW - 2 * mg - (o.indent || 0), words = txt.split(/(\s+)/).filter(x => x !== ''); let cur = '';
        for (const w of words) {
          const t = cur + w;
          if (o.font.widthOfTextAtSize(t.replace(/\s+$/, ''), o.size) <= maxW || !cur.trim()) cur = t;
          else { line(cur.replace(/\s+$/, ''), o); cur = w.replace(/^\s+/, ''); }
        }
        line(cur.replace(/\s+$/, ''), o);
      };
      for (const src of raw.replace(/\r/g, '').split('\n')) {
        let s = safe(src), o = { size: base, font: reg, indent: 0 };
        if (md.checked) {
          let m;
          if ((m = s.match(/^(#{1,3})\s+(.*)$/))) { o = { size: base * [1.9, 1.5, 1.25][m[1].length - 1], font: bold, indent: 0 }; s = m[2]; if (pg) y -= o.size * .4; }
          else if ((m = s.match(/^(\s*)[-*]\s+(.*)$/))) { o = { size: base, font: reg, indent: 14 + m[1].length * 4 }; s = '•  ' + m[2]; }
        }
        if (!s.trim()) { line('', o); continue; }
        wrap(s, o);
      }
      if (!pg) newPage();
      dlPdf(await doc.save(), 'texto.pdf');
      toast(replaced ? `PDF criado. ${replaced} caractere(s) não suportado(s) viraram "?".` : 'PDF criado.');
    }) }, 'Criar PDF');
    const dz = dropzone({ accept: '.txt,.md,.markdown,text/plain', multiple: false, label: 'Ou arraste um arquivo .txt / .md', onFiles: async ([f]) => { ta.value = await f.text(); } });
    dz.style.padding = '20px 18px';
    root.append(dz, h('div', { class: 'card' }, ta,
      h('div', { class: 'row', style: 'margin-top:12px' }, h('label', { class: 'f' }, 'Página', page), h('label', { class: 'f' }, 'Fonte', family), h('label', { class: 'f' }, 'Tamanho', size), h('label', { class: 'f' }, 'Margem (mm)', margin),
        h('label', { class: 'f inline' }, md, 'Markdown simples'), h('span', { class: 'grow' }), go)));
  } });

/* ---------- Digitalizar ---------- */
function enhanceCanvas(src, filter, rot) {
  const sw = src.width, sh = src.height, k = Math.min(1, 2200 / Math.max(sw, sh));
  const w0 = Math.max(1, Math.round(sw * k)), h0 = Math.max(1, Math.round(sh * k));
  const [w, hh] = rot % 180 ? [h0, w0] : [w0, h0];
  const cv = document.createElement('canvas'); cv.width = w; cv.height = hh;
  const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, w, hh);
  c.save(); c.translate(w / 2, hh / 2); c.rotate(rot * Math.PI / 180); c.drawImage(src, -w0 / 2, -h0 / 2, w0, h0); c.restore();
  if (filter === 'orig') return cv;
  const img = c.getImageData(0, 0, w, hh), d = img.data;
  if (filter === 'gray') { for (let i = 0; i < d.length; i += 4) { const l = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2]; d[i] = d[i + 1] = d[i + 2] = l; } c.putImageData(img, 0, 0); return cv; }
  // estimativa do fundo: reduz muito e amplia suavizado
  const sm = document.createElement('canvas'); sm.width = Math.max(2, Math.ceil(w / 24)); sm.height = Math.max(2, Math.ceil(hh / 24));
  const sc = sm.getContext('2d'); sc.imageSmoothingQuality = 'high'; sc.drawImage(cv, 0, 0, sm.width, sm.height);
  const bg = document.createElement('canvas'); bg.width = w; bg.height = hh;
  const bc = bg.getContext('2d'); bc.imageSmoothingQuality = 'high'; bc.drawImage(sm, 0, 0, w, hh);
  const b = bc.getImageData(0, 0, w, hh).data;
  for (let i = 0; i < d.length; i += 4) {
    const bl = Math.max(40, .299 * b[i] + .587 * b[i + 1] + .114 * b[i + 2]);
    if (filter === 'bw') {
      const l = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2], t = clamp((l / bl - .5) / .38, 0, 1), v = t * t * (3 - 2 * t) * 255;
      d[i] = d[i + 1] = d[i + 2] = v;
    } else {
      const f = 247 / bl; d[i] = clamp(d[i] * f, 0, 255); d[i + 1] = clamp(d[i + 1] * f, 0, 255); d[i + 2] = clamp(d[i + 2] * f, 0, 255);
    }
  }
  c.putImageData(img, 0, 0); return cv;
}
tools.push({ id: 'digitalizar', icon: '📱', title: 'Digitalizar documentos', desc: 'Tire fotos de documentos (no celular, a câmera abre direto) e gere um PDF limpo, com fundo branco.',
  mount(root) {
    const items = []; let tick = 0;
    const filter = h('select', {}, h('option', { value: 'bw' }, 'Documento preto e branco (mais leve)'), h('option', { value: 'doc' }, 'Documento colorido (fundo branco)'), h('option', { value: 'gray' }, 'Escala de cinza'), h('option', { value: 'orig' }, 'Original'));
    const list = h('div', { class: 'list' });
    const go = h('button', { class: 'primary', disabled: true, onclick: () => run('Criando PDF…', async prog => {
      const out = await PDFDocument.create();
      for (let i = 0; i < items.length; i++) {
        prog(i, items.length, `Processando imagem ${i + 1} de ${items.length}…`);
        const cv = enhanceCanvas(items[i].bmp, filter.value, items[i].rot), png = filter.value === 'bw';
        const bytes = new Uint8Array(await (await blobOf(cv, png ? 'image/png' : 'image/jpeg', .85)).arrayBuffer());
        const emb = png ? await out.embedPng(bytes) : await out.embedJpg(bytes);
        const a4 = cv.width > cv.height ? [841.89, 595.28] : [595.28, 841.89], k = Math.min(a4[0] / cv.width, a4[1] / cv.height);
        out.addPage(a4).drawImage(emb, { x: (a4[0] - cv.width * k) / 2, y: (a4[1] - cv.height * k) / 2, width: cv.width * k, height: cv.height * k });
        cv.width = cv.height = 0;
      }
      dlPdf(await out.save(), 'digitalizado.pdf'); toast('PDF criado.');
    }) }, 'Criar PDF');
    const redraw = () => {
      const my = ++tick; go.disabled = !items.length;
      list.replaceChildren(...items.map((it, i) => {
        const th = h('canvas', { style: 'width:56px;height:56px;object-fit:cover;background:#fff;border:1px solid var(--line)' });
        const t = enhanceCanvas(it.small, filter.value, it.rot); th.width = t.width; th.height = t.height; th.getContext('2d').drawImage(t, 0, 0);
        th.style.objectFit = 'contain';
        return h('div', { class: 'item' }, th, h('span', { class: 'name', title: it.name }, `${i + 1}. ${it.name}`),
          h('button', { class: 'icon', 'aria-label': 'Girar', title: 'Girar 90°', onclick: () => { it.rot = (it.rot + 90) % 360; redraw(); } }, '↻'),
          h('button', { class: 'icon', 'aria-label': 'Subir', disabled: i === 0, onclick: () => { [items[i - 1], items[i]] = [items[i], items[i - 1]]; redraw(); } }, '↑'),
          h('button', { class: 'icon', 'aria-label': 'Descer', disabled: i === items.length - 1, onclick: () => { [items[i + 1], items[i]] = [items[i], items[i + 1]]; redraw(); } }, '↓'),
          h('button', { class: 'icon danger', 'aria-label': 'Remover', onclick: () => { items.splice(i, 1); redraw(); } }, '✕'));
      }));
    };
    filter.addEventListener('change', redraw);
    const add = async fs => {
      for (const f of fs) {
        try {
          const bmp = await createImageBitmap(f), k = Math.min(1, 220 / Math.max(bmp.width, bmp.height));
          const sm = document.createElement('canvas'); sm.width = Math.max(1, Math.round(bmp.width * k)); sm.height = Math.max(1, Math.round(bmp.height * k));
          sm.getContext('2d').drawImage(bmp, 0, 0, sm.width, sm.height);
          items.push({ name: f.name || 'foto', bmp, small: sm, rot: 0 });
        } catch { toast(`Não foi possível ler "${f.name}".`, 'err'); }
      }
      redraw();
    };
    const cam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'hide' });
    cam.addEventListener('change', () => { add([...cam.files]); cam.value = ''; });
    root.append(dropzone({ accept: 'image/*', multiple: true, label: 'Arraste as fotos aqui', onFiles: add }),
      h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'btn', onclick: () => cam.click() }, '📷 Tirar foto (celular)'), cam), list,
      h('div', { class: 'card' }, h('div', { class: 'row' }, h('label', { class: 'f grow' }, 'Tratamento', filter), go),
        h('p', { class: 'note' }, 'O realce uniformiza a iluminação e deixa o fundo branco. Se o documento sair torto, use o botão de girar; o recorte automático não existe aqui.')));
    root.unmount = () => items.forEach(i => i.bmp.close?.());
  } });
