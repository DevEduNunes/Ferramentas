/* ====== segurança: proteger (AES-256) e desbloquear ====== */
const te8 = new TextEncoder();
const catBytes = (...a) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let k = 0; a.forEach(x => { o.set(x, k); k += x.length; }); return o; };
const rndBytes = n => crypto.getRandomValues(new Uint8Array(n));
const shaDigest = async (bits, data) => new Uint8Array(await crypto.subtle.digest('SHA-' + bits, data));
const toHex = u => [...u].map(b => b.toString(16).padStart(2, '0')).join('');
/* AES-CBC sem preenchimento: o WebCrypto sempre acrescenta um bloco, então ficamos só com o tamanho original */
async function aesCbcNoPad(key, iv, data) {
  const k = await crypto.subtle.importKey('raw', key, 'AES-CBC', false, ['encrypt']);
  return new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, k, data)).slice(0, data.length);
}
/* algoritmo 2.B da ISO 32000-2 (hash do revision 6) */
async function pdfHash2B(pw, salt, udata) {
  let K = await shaDigest(256, catBytes(pw, salt, udata)), E = new Uint8Array([0]), i = 0;
  while (i < 64 || E[E.length - 1] > i - 32) {
    const K1 = catBytes(pw, K, udata), rep = new Uint8Array(K1.length * 64);
    for (let j = 0; j < 64; j++) rep.set(K1, j * K1.length);
    E = await aesCbcNoPad(K.slice(0, 16), K.slice(16, 32), rep);
    let sum = 0; for (let j = 0; j < 16; j++) sum += E[j];
    K = await shaDigest(sum % 3 === 0 ? 256 : sum % 3 === 1 ? 384 : 512, E);
    i++;
  }
  return K.slice(0, 32);
}
async function encryptPdfAes256(bytes, userPw, ownerPw, P) {
  const { PDFName, PDFDict, PDFArray, PDFString, PDFHexString, PDFStream, PDFRawStream, PDFNumber } = PDFLib;
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  await doc.flush();
  const ctx = doc.context, fileKey = rndBytes(32), zero = new Uint8Array(16), none = new Uint8Array(0);
  const upw = te8.encode(userPw).slice(0, 127), opw = te8.encode(ownerPw).slice(0, 127);
  const uvs = rndBytes(8), uks = rndBytes(8), ovs = rndBytes(8), oks = rndBytes(8);
  const U = catBytes(await pdfHash2B(upw, uvs, none), uvs, uks);
  const UE = await aesCbcNoPad(await pdfHash2B(upw, uks, none), zero, fileKey);
  const O = catBytes(await pdfHash2B(opw, ovs, U), ovs, oks);
  const OE = await aesCbcNoPad(await pdfHash2B(opw, oks, U), zero, fileKey);
  const perms = new Uint8Array(16), dv = new DataView(perms.buffer);
  dv.setInt32(0, P, true); dv.setInt32(4, -1, true); perms[8] = 0x54; perms[9] = 0x61; perms[10] = 0x64; perms[11] = 0x62; perms.set(rndBytes(4), 12);
  const Perms = (await aesCbcNoPad(fileKey, zero, perms)).slice(0, 16);
  const ckey = await crypto.subtle.importKey('raw', fileKey, 'AES-CBC', false, ['encrypt']);
  const enc = async data => { const iv = rndBytes(16); return catBytes(iv, new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, ckey, data))); };
  const encStr = async s => PDFHexString.of(toHex(await enc(s.asBytes())));
  const walk = async obj => {
    if (obj instanceof PDFDict) { for (const [k, v] of obj.entries()) { if (v instanceof PDFString || v instanceof PDFHexString) obj.set(k, await encStr(v)); else await walk(v); } }
    else if (obj instanceof PDFArray) { for (let i = 0; i < obj.size(); i++) { const v = obj.get(i); if (v instanceof PDFString || v instanceof PDFHexString) obj.set(i, await encStr(v)); else await walk(v); } }
  };
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (obj instanceof PDFStream) {
      const type = obj.dict.get(PDFName.of('Type'));
      if (type === PDFName.of('XRef') || type === PDFName.of('ObjStm')) { ctx.delete(ref); continue; }
      await walk(obj.dict);
      ctx.assign(ref, PDFRawStream.of(obj.dict, await enc(obj.getContents())));
    } else if (obj instanceof PDFString || obj instanceof PDFHexString) ctx.assign(ref, await encStr(obj));
    else await walk(obj);
  }
  const dict = ctx.obj({
    Filter: 'Standard', V: 5, R: 6, Length: 256,
    CF: { StdCF: { AuthEvent: 'DocOpen', CFM: 'AESV3', Length: 32 } }, StmF: 'StdCF', StrF: 'StdCF',
    O: PDFHexString.of(toHex(O)), U: PDFHexString.of(toHex(U)), OE: PDFHexString.of(toHex(OE)), UE: PDFHexString.of(toHex(UE)),
    P: PDFNumber.of(P), Perms: PDFHexString.of(toHex(Perms)),
  });
  ctx.trailerInfo.Encrypt = ctx.register(dict);
  const id = PDFHexString.of(toHex(rndBytes(16)));
  ctx.trailerInfo.ID = ctx.obj([id, id]);
  return doc.save({ useObjectStreams: false, addDefaultPage: false, updateFieldAppearances: false });
}
const randomPw = () => Array.from(rndBytes(14), b => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'[b % 56]).join('');

tools.push({ id: 'proteger', icon: '🔒', title: 'Proteger com senha', desc: 'Criptografia AES-256 feita aqui no navegador: a senha e o arquivo nunca saem do seu computador.',
  mount(root) {
    let cur = null;
    const upw = h('input', { type: 'password', autocomplete: 'new-password', style: 'width:220px', placeholder: 'Senha para abrir' });
    const opw = h('input', { type: 'password', autocomplete: 'new-password', style: 'width:220px', placeholder: 'Em branco = gerar uma' });
    const show = h('input', { type: 'checkbox' });
    show.addEventListener('change', () => { upw.type = opw.type = show.checked ? 'text' : 'password'; });
    const pr = h('input', { type: 'checkbox', checked: true }), cp = h('input', { type: 'checkbox', checked: true }), ed = h('input', { type: 'checkbox', checked: true }), an = h('input', { type: 'checkbox', checked: true });
    const result = h('div');
    const go = h('button', { class: 'primary', disabled: true, onclick: () => run('Criptografando…', async () => {
      if (!upw.value && !opw.value && pr.checked && cp.checked && ed.checked && an.checked) throw new Error('Informe uma senha para abrir ou desmarque alguma permissão.');
      const owner = opw.value || randomPw();
      let P = 0xFFFFF0C0 | 512; if (pr.checked) P |= 4 | 2048; if (ed.checked) P |= 8 | 1024; if (cp.checked) P |= 16; if (an.checked) P |= 32 | 256;
      const out = await encryptPdfAes256(cur.bytes, upw.value, owner, P | 0);
      // confere se o resultado abre com a senha e se exige senha sem ela
      let needs = false; try { await loadPdfJsPw(out); } catch (e) { needs = e?.name === 'PasswordException'; }
      const chk = await loadPdfJsPw(out, upw.value || owner); await chk.getPage(1);
      if (upw.value && !needs) throw new Error('A verificação falhou: o arquivo não pediu senha. Nada foi baixado.');
      dlPdf(out, `${baseName(cur.file.name)}-protegido.pdf`);
      result.replaceChildren(h('p', { class: 'ok' }, '✔ Arquivo protegido e verificado.'), !opw.value ? h('div', { class: 'warn' }, ['Senha do proprietário gerada (permite remover as restrições): ', h('b', {}, owner), '. Guarde-a: não há como recuperar.']) : null);
      toast('PDF protegido gerado.');
    }) }, 'Proteger e baixar');
    const opts = h('div', { class: 'card hide' },
      h('div', { class: 'row' }, h('label', { class: 'f' }, 'Senha para abrir (usuário)', upw), h('label', { class: 'f' }, 'Senha do proprietário (opcional)', opw), h('label', { class: 'f inline' }, show, 'Mostrar senhas')),
      h('div', { class: 'row', style: 'margin-top:14px' }, h('span', { class: 'meta' }, 'Permitir:'), h('label', { class: 'f inline' }, pr, 'imprimir'), h('label', { class: 'f inline' }, cp, 'copiar texto'), h('label', { class: 'f inline' }, ed, 'editar / reorganizar'), h('label', { class: 'f inline' }, an, 'comentar / preencher'), h('span', { class: 'grow' }), go),
      h('p', { class: 'note' }, 'AES-256 (revisão 6 do padrão PDF). As restrições de impressão e cópia dependem de o leitor respeitá-las; a senha para abrir é a proteção que realmente impede a leitura. Se esquecer a senha, não há recuperação.'), result);
    const holder = h('div'); root.append(holder, opts);
    singlePdf(holder, c => { cur = c; go.disabled = false; opts.classList.remove('hide'); result.replaceChildren(); });
  } });

tools.push({ id: 'desbloquear', icon: '🔓', title: 'Remover senha', desc: 'Abre um PDF com a senha (ou só com restrições) e gera uma cópia sem proteção.',
  mount(root) {
    let cur = null;
    const pw = h('input', { type: 'password', autocomplete: 'off', style: 'width:240px', placeholder: 'Senha, se houver' });
    const dpi = h('select', {}, h('option', { value: '130' }, 'Qualidade normal (130 dpi)'), h('option', { value: '170', selected: true }, 'Alta (170 dpi)'), h('option', { value: '220' }, 'Máxima (220 dpi)'));
    const txt = h('input', { type: 'checkbox', checked: true });
    const log = h('div', { class: 'stat' });
    const go = h('button', { class: 'primary', disabled: true, onclick: () => run('Abrindo…', async prog => {
      log.replaceChildren();
      let pdf;
      try { pdf = await loadPdfJsPw(cur.bytes, pw.value); }
      catch (e) { if (e?.name === 'PasswordException') throw new Error(e.code === 2 ? 'Senha incorreta.' : 'Este PDF exige senha: digite-a no campo acima.'); throw e; }
      const out = await rasterToPdf(pdf, Array.from({ length: pdf.numPages }, (_, i) => i), +dpi.value, .85, prog, null, txt.checked);
      dlPdf(await out.save(), `${baseName(cur.file.name)}-desbloqueado.pdf`);
      log.append(h('div', { class: 'ok' }, `✔ ${pdf.numPages} página(s) copiadas sem proteção.`)); toast('PDF sem senha gerado.');
    }) }, 'Remover proteção e baixar');
    const opts = h('div', { class: 'card hide' }, h('div', { class: 'row' }, h('label', { class: 'f' }, 'Senha', pw), h('label', { class: 'f' }, 'Qualidade', dpi), h('label', { class: 'f inline' }, txt, 'Manter texto pesquisável'), h('span', { class: 'grow' }), go),
      h('p', { class: 'warn' }, 'Funciona só se você tiver a senha (ou se o PDF abrir sem ela e tiver apenas restrições). Quebrar senhas desconhecidas não é possível nem é o objetivo. As páginas são refeitas como imagem, com uma camada de texto invisível para busca e seleção; o arquivo costuma ficar maior que o original.'), log);
    const holder = h('div'); root.append(holder, opts);
    rawPdf(holder, c => { cur = c; go.disabled = false; opts.classList.remove('hide'); log.replaceChildren(); });
  } });

/* ---------- O que não dá para fazer ---------- */
tools.push({ id: 'limites', icon: 'ℹ', title: 'O que não dá para fazer aqui', desc: 'Algumas ferramentas de sites como o iLovePDF dependem de servidores. Veja o que ficou de fora e por quê.',
  mount(root) {
    const rowsData = [
      ['Word, PowerPoint e Excel → PDF', 'Exige reproduzir o layout fiel desses formatos (fontes, tabelas, efeitos). Só um programa de escritório ou um servidor com LibreOffice faz isso bem; um navegador não.'],
      ['PDF → PowerPoint e PDF → Excel', 'Reconstruir slides e tabelas editáveis exige análise de layout avançada. Aqui só há PDF → Word com o texto, e PDF → texto / Markdown.'],
      ['OCR (reconhecer texto em digitalizações)', 'Depende de um modelo de reconhecimento de 10 MB ou mais por idioma. Poderia ser embutido, mas deixaria a ferramenta pesada e lenta; por enquanto não está incluído.'],
      ['Resumir e traduzir com IA', 'Exigem um modelo de linguagem, que roda em servidor. Enviar o documento a um serviço externo contraria a proposta desta página: nada sai do seu computador.'],
      ['HTML → PDF a partir de um endereço (URL)', 'Buscar uma página na internet exige acesso à rede, que esta página bloqueia de propósito. Para páginas que você já abriu, use "Imprimir → Salvar como PDF" do navegador.'],
      ['PDF/A (arquivamento)', 'Precisa embutir fontes, perfil de cor e metadados XMP validados. Sem um validador, qualquer "PDF/A" gerado aqui não teria garantia.'],
      ['Carimbo de tempo e assinatura de longo prazo (PAdES-LTV)', '"Assinar digitalmente" grava a assinatura com o relógio do seu computador e sem carimbo de uma autoridade de tempo. Certificados em token ou cartão (A3) também não são acessíveis por uma página web: use um certificado em arquivo (A1, .pfx).'],
    ];
    root.append(h('div', { class: 'card' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, h('th', {}, 'Recurso'), h('th', {}, 'Por que não está aqui'))), h('tbody', {}, rowsData.map(([a, b]) => h('tr', {}, h('td', {}, h('strong', {}, a)), h('td', {}, b)))))),
      h('p', { class: 'note' }, 'Esse é o preço de verdade da privacidade: tudo o que está nesta página roda no seu computador, e o que não dá para rodar aqui fica de fora em vez de ir para um servidor.'));
  } });
