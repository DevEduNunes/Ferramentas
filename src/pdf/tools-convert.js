/* ====== conversão: PDF → texto / Markdown / Word ====== */
const BULLET_RE = /^([•●▪◦‣·\-–—*]|\d{1,3}[.)]|[a-zA-Z][.)])\s+/;
const median = (arr, w) => { // mediana ponderada
  const a = arr.map((v, i) => [v, w ? w[i] : 1]).sort((x, y) => x[0] - y[0]); let tot = a.reduce((s, x) => s + x[1], 0) / 2, acc = 0;
  for (const [v, k] of a) { acc += k; if (acc >= tot) return v; } return a.length ? a[a.length - 1][0] : 10;
};
/* lê o texto de todas as páginas e devolve blocos: { type: 'h'|'p'|'li', level, text } por página */
async function extractBlocks(pdf, prog) {
  const raw = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    prog?.(i - 1, pdf.numPages, `Lendo página ${i} de ${pdf.numPages}…`);
    const page = await pdf.getPage(i), tc = await page.getTextContent();
    const items = tc.items.filter(it => typeof it.str === 'string' && it.str.trim() !== '')
      .map(it => ({ s: it.str, x: it.transform[4], y: it.transform[5], size: Math.hypot(it.transform[0], it.transform[1]) || Math.abs(it.transform[3]) || 10, w: it.width }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = []; let curL = null;
    for (const it of items) {
      if (curL && Math.abs(it.y - curL.y) <= Math.max(it.size, curL.size) * 0.45) curL.items.push(it);
      else { curL = { y: it.y, items: [it] }; lines.push(curL); }
    }
    const out = lines.map(L => {
      L.items.sort((a, b) => a.x - b.x);
      let text = '', end = null;
      for (const it of L.items) {
        if (end != null) { const gap = it.x - end; if (gap > it.size * 0.18 && !/\s$/.test(text) && !/^\s/.test(it.s)) text += ' '; }
        text += it.s; end = it.x + it.w;
      }
      text = text.replace(/\s+/g, ' ').trim();
      const big = L.items.reduce((m, it) => it.s.length > m.s.length ? it : m, L.items[0]);
      return { y: L.y, x: L.items[0].x, size: big.size, text, chars: text.length };
    }).filter(l => l.text);
    raw.push(out);
  }
  const all = raw.flat(), body = median(all.map(l => l.size), all.map(l => l.chars));
  const pages = raw.map(lines => {
    const blocks = []; let prev = null;
    for (const l of lines) {
      const ratio = l.size / body;
      const isHead = ratio >= 1.2 && l.text.length < 140 && !BULLET_RE.test(l.text);
      const isLi = !isHead && BULLET_RE.test(l.text);
      if (isHead) {
        const lvl = ratio >= 1.8 ? 1 : ratio >= 1.45 ? 2 : 3;
        if (prev && prev.type === 'h' && prev.level === lvl && prev.y - l.y < l.size * 1.8) { prev.text += ' ' + l.text; prev.y = l.y; }
        else { prev = { type: 'h', level: lvl, text: l.text, y: l.y }; blocks.push(prev); }
      } else if (isLi) { prev = { type: 'li', text: l.text.replace(/^([•●▪◦‣·\-–—*])\s+/, ''), marker: (l.text.match(/^(\d{1,3}[.)]|[a-zA-Z][.)])\s/) || [])[1], y: l.y, size: l.size, x: l.x }; blocks.push(prev); }
      else if (prev && (prev.type === 'p' || prev.type === 'li') && prev.y - l.y < Math.max(prev.size || l.size, l.size) * 1.75 && (prev.type === 'p' || l.x >= prev.x - 2)) {
        prev.text = /[-‐]$/.test(prev.text) && /^[a-zà-ÿ]/.test(l.text) ? prev.text.slice(0, -1) + l.text : prev.text + ' ' + l.text; prev.y = l.y;
      } else { prev = { type: 'p', text: l.text, y: l.y, size: l.size, x: l.x }; blocks.push(prev); }
    }
    return blocks;
  });
  return { pages, chars: all.reduce((s, l) => s + l.chars, 0) };
}
/* junta blocos: listas consecutivas ficam coladas, o resto separado por linha em branco */
const joinBlocks = items => items.reduce((s, it, i) => i ? s + (it.li && items[i - 1].li ? '\n' : '\n\n') + it.t : it.t, '');
const toMarkdown = (pages, mark) => joinBlocks(pages.flatMap((bl, i) => (mark ? [{ t: `<!-- página ${i + 1} -->` }] : []).concat(bl.map(b => ({ li: b.type === 'li', t: b.type === 'h' ? '#'.repeat(b.level) + ' ' + b.text : b.type === 'li' ? (b.marker ? b.marker + ' ' : '- ') + b.text : b.text }))))) ;
const toPlain = (pages, mark) => joinBlocks(pages.flatMap((bl, i) => (mark ? [{ t: `--- página ${i + 1} ---` }] : []).concat(bl.map(b => ({ li: b.type === 'li', t: b.type === 'li' ? (b.marker ? b.marker + ' ' : '• ') + b.text : b.text })))));

/* arquivo de PDF para o pdf.js, com mensagens claras */
function pdfJsInput(root, onLoaded, note) {
  rawPdf(root, async c => {
    try { const pdf = await loadPdfJs(c.bytes); onLoaded({ ...c, pdf, n: pdf.numPages }); }
    catch (e) { toast(e?.name === 'PasswordException' ? 'Este PDF tem senha. Use "Desbloquear" antes.' : `Não foi possível abrir "${c.file.name}": ${errMsg(e)}`, 'err'); }
  }, note);
}
const NOTEXT = 'Não encontrei texto neste PDF. Provavelmente ele é uma digitalização (imagens). O reconhecimento de texto (OCR) não está disponível porque exigiria embutir um modelo grande.';

tools.push({ id: 'pdf2texto', icon: '📄', title: 'PDF → Texto / Markdown', desc: 'Extrai o texto do PDF e organiza em títulos, listas e parágrafos. Tudo no seu navegador.',
  mount(root) {
    let cur = null, result = '';
    const fmt = h('select', {}, h('option', { value: 'md' }, 'Markdown (.md)'), h('option', { value: 'txt' }, 'Texto simples (.txt)'));
    const mark = h('input', { type: 'checkbox' });
    const ta = h('textarea', { class: 'mono hide', readonly: true, style: 'min-height:320px' });
    const status = h('p', { class: 'note' });
    const copyBtn = h('button', { class: 'btn hide', onclick: async () => { try { await navigator.clipboard.writeText(ta.value); toast('Texto copiado.'); } catch { ta.select(); document.execCommand('copy'); toast('Texto copiado.'); } } }, 'Copiar');
    const dlBtn = h('button', { class: 'primary hide', onclick: () => download(new Blob([ta.value], { type: 'text/plain;charset=utf-8' }), `${baseName(cur.file.name)}.${fmt.value}`) }, 'Baixar');
    const go = h('button', { class: 'primary', disabled: true, onclick: () => run('Extraindo texto…', async prog => {
      const { pages, chars } = await extractBlocks(cur.pdf, prog);
      if (chars < 20) { ta.classList.add('hide'); copyBtn.classList.add('hide'); dlBtn.classList.add('hide'); status.textContent = NOTEXT; return; }
      result = fmt.value === 'md' ? toMarkdown(pages, mark.checked) : toPlain(pages, mark.checked);
      ta.value = result; [ta, copyBtn, dlBtn].forEach(e => e.classList.remove('hide'));
      status.textContent = `${chars.toLocaleString('pt-BR')} caracteres em ${pages.length} página(s). Títulos e listas são inferidos pelo tamanho da fonte e podem precisar de ajuste; tabelas e colunas múltiplas não são reconstruídas.`;
    }) }, 'Extrair');
    const opts = h('div', { class: 'card hide' }, h('div', { class: 'row' }, h('label', { class: 'f' }, 'Formato', fmt), h('label', { class: 'f inline' }, mark, 'Marcar o início de cada página'), h('span', { class: 'grow' }), go), status, ta, h('div', { class: 'row end', style: 'margin-top:12px' }, copyBtn, dlBtn));
    const holder = h('div'); root.append(holder, opts);
    pdfJsInput(holder, c => { cur = c; go.disabled = false; opts.classList.remove('hide'); ta.classList.add('hide'); copyBtn.classList.add('hide'); dlBtn.classList.add('hide'); status.textContent = ''; });
    root.unmount = () => cur?.pdf?.destroy?.();
  } });

/* ---------- PDF → Word (.docx básico) ---------- */
const xmlEsc = s => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function buildDocx(pages, breaks) {
  const run = (t, o = {}) => `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>${o.b ? '<w:b/>' : ''}<w:sz w:val="${o.sz || 22}"/></w:rPr><w:t xml:space="preserve">${xmlEsc(t)}</w:t></w:r>`;
  const body = [];
  pages.forEach((bl, pi) => {
    bl.forEach(b => {
      if (b.type === 'h') body.push(`<w:p><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="100"/></w:pPr>${run(b.text, { b: true, sz: b.level === 1 ? 36 : b.level === 2 ? 30 : 26 })}</w:p>`);
      else if (b.type === 'li') body.push(`<w:p><w:pPr><w:spacing w:after="60"/><w:ind w:left="500" w:hanging="260"/></w:pPr>${run((b.marker ? b.marker + ' ' : '• ') + b.text)}</w:p>`);
      else body.push(`<w:p><w:pPr><w:spacing w:after="140"/></w:pPr>${run(b.text)}</w:p>`);
    });
    if (breaks && pi < pages.length - 1) body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
  });
  if (!body.length) body.push('<w:p/>');
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const z = new JSZip();
  z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>', { createFolders: false });
  z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>', { createFolders: false });
  z.file('word/document.xml', doc, { createFolders: false });
  return z.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' });
}
tools.push({ id: 'pdf2word', icon: '📃', title: 'PDF → Word (texto)', desc: 'Gera um .docx editável com o texto do PDF (títulos, listas e parágrafos). Imagens, tabelas e layout não são mantidos.',
  mount(root) {
    let cur = null;
    const br = h('input', { type: 'checkbox', checked: true });
    const status = h('p', { class: 'note' });
    const go = h('button', { class: 'primary', disabled: true, onclick: () => run('Convertendo…', async prog => {
      const { pages, chars } = await extractBlocks(cur.pdf, prog);
      if (chars < 20) { status.textContent = NOTEXT; return; }
      download(await buildDocx(pages, br.checked), `${baseName(cur.file.name)}.docx`);
      status.textContent = ''; toast('Documento Word gerado.');
    }) }, 'Converter e baixar');
    const opts = h('div', { class: 'card hide' }, h('div', { class: 'row' }, h('label', { class: 'f inline' }, br, 'Manter uma página do Word por página do PDF'), h('span', { class: 'grow' }), go),
      h('p', { class: 'warn' }, 'Conversão básica: só o texto. Para preservar tabelas, imagens e formatação, o ideal é um conversor dedicado, que exige processamento no servidor.'), status);
    const holder = h('div'); root.append(holder, opts);
    pdfJsInput(holder, c => { cur = c; go.disabled = false; opts.classList.remove('hide'); status.textContent = ''; });
    root.unmount = () => cur?.pdf?.destroy?.();
  } });
