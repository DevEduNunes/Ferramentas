/* ====== assinatura digital: criar certificado (.pfx) e assinar PDF (PKCS#7 / PAdES básico) ====== */

const SIG_BYTES = 16384;                 // espaço reservado para a assinatura dentro do PDF
const binStr = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return s; };
const strBin = s => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };
const hex2 = (u8, up) => { const x = [...u8].map(b => b.toString(16).padStart(2, '0')).join(''); return up ? x.toUpperCase() : x; };
const latin = s => String(s).replace(/[^ -ÿ]/g, '?');            // texto que a fonte padrão do PDF consegue desenhar
const certCN = c => (c.subject.getField('CN') || {}).value || 'Sem nome';
const fmtDate = d => d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR');
const tzStr = (d, sep) => { const o = -d.getTimezoneOffset(), a = Math.abs(o), p = n => String(n).padStart(2, '0'); return (o < 0 ? '-' : '+') + p(Math.floor(a / 60)) + sep + p(a % 60); };
const pdfDateStr = d => { const p = n => String(n).padStart(2, '0'); return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${tzStr(d, "'")}'`; };
const certFingerprint = c => forge.md.sha256.create().update(forge.asn1.toDer(forge.pki.certificateToAsn1(c)).getBytes()).digest().toHex().toUpperCase().match(/.{2}/g).join(':');

/* ---------- certificado autoassinado ---------- */
async function makeSelfSigned({ cn, email, org, country, years, bits }) {
  const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: bits, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const der = async (fmt, k) => forge.asn1.fromDer(binStr(new Uint8Array(await crypto.subtle.exportKey(fmt, k))));
  const priv = forge.pki.privateKeyFromAsn1(await der('pkcs8', kp.privateKey)), pub = forge.pki.publicKeyFromAsn1(await der('spki', kp.publicKey));
  const cert = forge.pki.createCertificate();
  cert.publicKey = pub;
  cert.serialNumber = '01' + hex2(crypto.getRandomValues(new Uint8Array(15)));
  cert.validity.notBefore = new Date(Date.now() - 5 * 60000);
  cert.validity.notAfter = new Date(Date.now() + years * 365.25 * 86400000);
  const attrs = [{ name: 'commonName', value: cn }];
  if (org) attrs.push({ name: 'organizationName', value: org });
  if (email) attrs.push({ name: 'emailAddress', value: email });
  if (country) attrs.push({ name: 'countryName', value: country });
  cert.setSubject(attrs); cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false, critical: true },
    { name: 'keyUsage', digitalSignature: true, nonRepudiation: true, critical: true },
    { name: 'extKeyUsage', emailProtection: true },
    { name: 'subjectKeyIdentifier' },
  ]);
  cert.sign(priv, forge.md.sha256.create());
  return { priv, cert };
}
const certToDer = c => strBin(forge.asn1.toDer(forge.pki.certificateToAsn1(c)).getBytes());

tools.push({ id: 'certificado', icon: '🪪', title: 'Criar certificado (.pfx)', desc: 'Gera aqui no navegador o seu arquivo de assinatura (.pfx) para assinar PDFs digitalmente, como o "ID Digital" do Adobe. A chave nunca sai do seu computador.',
  mount(root) {
    const nome = h('input', { type: 'text', placeholder: 'Nome completo', style: 'width:300px', autocomplete: 'off' });
    const mail = h('input', { type: 'text', placeholder: 'seu@email.com (opcional)', style: 'width:260px', autocomplete: 'off' });
    const org = h('input', { type: 'text', placeholder: 'Empresa (opcional)', style: 'width:240px', autocomplete: 'off' });
    const pais = h('input', { type: 'text', value: 'BR', maxlength: '2', style: 'width:60px' });
    const anos = h('select', {}, [1, 2, 3, 5, 10].map(a => h('option', { value: a, selected: a === 3 }, a + (a === 1 ? ' ano' : ' anos'))));
    const bits = h('select', {}, h('option', { value: '2048', selected: true }, 'RSA 2048 (padrão)'), h('option', { value: '3072' }, 'RSA 3072 (mais forte)'));
    const pw1 = h('input', { type: 'password', autocomplete: 'new-password', style: 'width:220px', placeholder: 'Senha do arquivo' });
    const pw2 = h('input', { type: 'password', autocomplete: 'new-password', style: 'width:220px', placeholder: 'Repita a senha' });
    const show = h('input', { type: 'checkbox' });
    show.addEventListener('change', () => { pw1.type = pw2.type = show.checked ? 'text' : 'password'; });
    const out = h('div');
    const go = h('button', { class: 'primary', onclick: () => run('Gerando chaves…', async () => {
      const cn = nome.value.trim(), cc = pais.value.trim().toUpperCase();
      if (!cn) throw new Error('Informe o seu nome.');
      if (cc && !/^[A-Z]{2}$/.test(cc)) throw new Error('O país deve ter 2 letras (ex.: BR).');
      if (pw1.value.length < 6) throw new Error('Use uma senha de pelo menos 6 caracteres.');
      if (pw1.value !== pw2.value) throw new Error('As senhas não conferem.');
      const { priv, cert } = await makeSelfSigned({ cn, email: mail.value.trim(), org: org.value.trim(), country: cc, years: +anos.value, bits: +bits.value });
      const p12 = forge.pkcs12.toPkcs12Asn1(priv, [cert], pw1.value, { algorithm: '3des', friendlyName: cn, generateLocalKeyId: true });
      const pfx = strBin(forge.asn1.toDer(p12).getBytes());
      // confere se o arquivo abre com a senha e se a chave bate com o certificado
      const back = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(binStr(pfx)), pw1.value);
      if (!back.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.length) throw new Error('Falha ao verificar o arquivo gerado.');
      const safe = baseName(cn).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'assinatura';
      const base = 'assinatura-' + safe;
      out.replaceChildren(
        h('p', { class: 'ok' }, '✔ Certificado criado e verificado.'),
        h('div', { class: 'card' },
          h('div', { class: 'meta' }, 'Titular: ' + certCN(cert) + (mail.value.trim() ? ' <' + mail.value.trim() + '>' : '')),
          h('div', { class: 'meta' }, 'Válido até: ' + cert.validity.notAfter.toLocaleDateString('pt-BR')),
          h('div', { class: 'meta', style: 'word-break:break-all' }, 'Impressão digital (SHA-256): ' + certFingerprint(cert)),
          h('div', { class: 'row', style: 'margin-top:14px' },
            h('button', { class: 'primary', onclick: () => download(pfx, base + '.pfx', 'application/x-pkcs12') }, 'Baixar .pfx (privado)'),
            h('button', { class: 'btn', onclick: () => download(certToDer(cert), base + '.cer', 'application/pkix-cert') }, 'Baixar .cer (público)'))),
        h('p', { class: 'warn' }, ['Guarde o ', h('b', {}, '.pfx'), ' e a senha em lugar seguro: quem tiver os dois pode assinar em seu nome, e não há como recuperar a senha. O ', h('b', {}, '.cer'), ' é público e pode ser enviado a quem for conferir seus documentos.']),
        h('p', { class: 'note' }, 'Este certificado é autoassinado: garante que o PDF não foi alterado depois de assinado, mas nenhuma autoridade atesta quem você é. No Adobe Acrobat a assinatura aparece como "identidade do assinante desconhecida" até o destinatário importar o seu .cer e marcá-lo como confiável (Preferências → Assinaturas → Identidades e certificados confiáveis). Para valor jurídico máximo no Brasil use um certificado ICP-Brasil (A1) e a ferramenta "Assinar digitalmente".'));
      toast('Certificado gerado.');
    }) }, 'Gerar certificado');
    root.append(h('div', { class: 'card' },
      h('div', { class: 'row' }, h('label', { class: 'f' }, 'Nome', nome), h('label', { class: 'f' }, 'E-mail', mail)),
      h('div', { class: 'row', style: 'margin-top:12px' }, h('label', { class: 'f' }, 'Empresa', org), h('label', { class: 'f' }, 'País', pais), h('label', { class: 'f' }, 'Validade', anos), h('label', { class: 'f' }, 'Chave', bits)),
      h('div', { class: 'row', style: 'margin-top:12px' }, h('label', { class: 'f' }, 'Senha do .pfx', pw1), h('label', { class: 'f' }, 'Confirmar senha', pw2), h('label', { class: 'f inline' }, show, 'Mostrar senhas')),
      h('div', { class: 'row end', style: 'margin-top:14px' }, go)), out);
  } });

/* ---------- ler o .pfx / .p12 ---------- */
function loadPfx(bytes, password) {
  let p12;
  try { p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(binStr(bytes)), password); }
  catch (e) { throw new Error(/mac|password|decrypt|Invalid/i.test(e?.message || '') ? 'Senha incorreta ou arquivo de certificado inválido.' : 'Não foi possível ler o certificado: ' + (e?.message || e)); }
  const O = forge.pki.oids, get = t => { const b = p12.getBags({ bagType: t }) || {}; return b[t] || []; };
  const keys = [...get(O.pkcs8ShroudedKeyBag), ...get(O.keyBag)].map(b => b.key).filter(Boolean);
  const certs = get(O.certBag).map(b => b.cert).filter(Boolean);
  if (!keys.length) throw new Error('O arquivo não contém uma chave privada.');
  const key = keys[0], own = certs.find(c => c.publicKey && c.publicKey.n && key.n && c.publicKey.n.equals(key.n));
  if (!own) throw new Error('Nenhum certificado do arquivo corresponde à chave privada.');
  return { key, cert: own, chain: certs.filter(c => c !== own) };
}

/* ---------- assinar ---------- */
async function signPdf(bytes, id, o) {
  const { PDFName, PDFString, PDFHexString, PDFNumber } = PDFLib;
  const doc = await PDFDocument.load(bytes), ctx = doc.context, now = new Date();
  const name = certCN(id.cert);
  // carimbo visual (desenhado na página, antes de assinar)
  let rect = [0, 0, 0, 0], page = doc.getPage(0);
  if (o.stamp) {
    page = doc.getPage(o.stamp.pageIndex); rect = o.stamp.rect;
    const fR = await doc.embedFont(StandardFonts.Helvetica), fB = await doc.embedFont(StandardFonts.HelveticaBold);
    const w = rect[2] - rect[0], hh = rect[3] - rect[1];
    const lines = [['Assinado digitalmente por', fR], [name, fB], ['Data: ' + fmtDate(now) + ' ' + tzStr(now, ':'), fR]];
    if (o.reason) lines.push(['Motivo: ' + o.reason, fR]);
    if (o.location) lines.push(['Local: ' + o.location, fR]);
    let size = 11; const fits = s => lines.every(([t, f]) => f.widthOfTextAtSize(latin(t), s) <= w - 8) && lines.length * s * 1.25 <= hh - 6;
    while (size > 4 && !fits(size)) size -= .5;
    page.drawRectangle({ x: rect[0], y: rect[1], width: w, height: hh, color: rgb(.97, .98, 1), borderColor: rgb(.35, .45, .75), borderWidth: .8 });
    const total = lines.length * size * 1.25; let y = rect[1] + hh / 2 + total / 2 - size;
    for (const [t, f] of lines) { page.drawText(latin(t), { x: rect[0] + 4, y, size, font: f, color: rgb(.1, .12, .25) }); y -= size * 1.25; }
  }
  // dicionário da assinatura com ByteRange e Contents provisórios
  const PH = '**********';
  const sig = ctx.obj({ Type: 'Sig', Filter: 'Adobe.PPKLite', SubFilter: 'adbe.pkcs7.detached',
    ByteRange: [0, PDFName.of(PH), PDFName.of(PH), PDFName.of(PH)],
    Contents: PDFHexString.of('0'.repeat(SIG_BYTES * 2)),
    M: PDFString.of(pdfDateStr(now)), Name: PDFHexString.fromText(name) });
  if (o.reason) sig.set(PDFName.of('Reason'), PDFHexString.fromText(o.reason));
  if (o.location) sig.set(PDFName.of('Location'), PDFHexString.fromText(o.location));
  if (o.contact) sig.set(PDFName.of('ContactInfo'), PDFHexString.fromText(o.contact));
  const sigRef = ctx.register(sig);
  const widget = ctx.obj({ Type: 'Annot', Subtype: 'Widget', FT: 'Sig', Rect: rect, V: sigRef, T: PDFHexString.fromText('Assinatura_' + Date.now().toString(36)), F: 132, P: page.ref });
  const wRef = ctx.register(widget);
  page.node.addAnnot(wRef);
  const form = doc.getForm(); form.acroForm.addField(wRef); form.acroForm.dict.set(PDFName.of('SigFlags'), PDFNumber.of(3));
  const out = await doc.save({ useObjectStreams: false, updateFieldAppearances: false, addDefaultPage: false });
  // posições reais de ByteRange e Contents
  const s = binStr(out);
  const br = /\/ByteRange\s*\[\s*0\s+(\/\*{10})\s+(\/\*{10})\s+(\/\*{10})\s*\]/.exec(s);
  const ci = s.indexOf('/Contents <' + '0'.repeat(64));
  if (!br || ci < 0) throw new Error('Não foi possível reservar o espaço da assinatura neste PDF.');
  const hs = ci + 10, he = s.indexOf('>', hs) + 1;
  const range = [0, hs, he, out.length - he];
  let from = br.index;
  [range[1], range[2], range[3]].forEach(v => {
    const p = s.indexOf('/' + PH, from), t = ' ' + String(v).padStart(10, ' ');      // mesmo tamanho do marcador ("/" + 10 caracteres)
    for (let i = 0; i < 11; i++) out[p + i] = t.charCodeAt(i);
    from = p + 11;
  });
  // o PKCS#7 destacado cobre tudo, menos o bloco Contents
  const data = new Uint8Array(range[1] + range[3]); data.set(out.subarray(0, range[1]), 0); data.set(out.subarray(range[2]), range[1]);
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(binStr(data));
  p7.addCertificate(id.cert); id.chain.forEach(c => p7.addCertificate(c));
  p7.addSigner({ key: id.key, certificate: id.cert, digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [{ type: forge.pki.oids.contentType, value: forge.pki.oids.data }, { type: forge.pki.oids.messageDigest }, { type: forge.pki.oids.signingTime, value: now }] });
  p7.sign({ detached: true });
  const der = strBin(forge.asn1.toDer(p7.toAsn1()).getBytes());
  if (der.length > SIG_BYTES) throw new Error('O certificado (com a cadeia) é grande demais para o espaço reservado.');
  const hexSig = hex2(der, true).padEnd(SIG_BYTES * 2, '0');
  for (let i = 0; i < hexSig.length; i++) out[hs + 1 + i] = hexSig.charCodeAt(i);
  return { bytes: out, name, range };
}
/* confere a assinatura de um PDF gerado: resumo (SHA-256) do conteúdo e assinatura RSA do signatário */
async function verifySigned(out) {
  const s = binStr(out), m = /\/ByteRange\s*\[\s*0\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(s);
  if (!m) return { ok: false, why: 'ByteRange ausente' };
  const a = +m[1], b = +m[2], c = +m[3];
  if (b + c !== out.length) return { ok: false, why: 'ByteRange não cobre o arquivo' };
  const data = new Uint8Array(a + c); data.set(out.subarray(0, a), 0); data.set(out.subarray(b), a);
  const derBytes = forge.util.hexToBytes(s.slice(a + 1, b - 1));
  const p7 = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(derBytes, { parseAllBytes: false })), rc = p7.rawCapture;
  const attrs = rc.authenticatedAttributes, cert = p7.certificates[0];
  const dg = new Uint8Array(await crypto.subtle.digest('SHA-256', data)), want = binStr(dg);
  const mdAttr = attrs.find(x => forge.asn1.derToOid(x.value[0].value) === forge.pki.oids.messageDigest);
  if (!mdAttr || mdAttr.value[1].value[0].value !== want) return { ok: false, why: 'o conteúdo não confere com o resumo assinado' };
  const set = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, attrs);
  const md = forge.md.sha256.create(); md.update(forge.asn1.toDer(set).getBytes());
  const ok = cert.publicKey.verify(md.digest().getBytes(), rc.signature);
  return { ok, why: ok ? '' : 'assinatura RSA inválida', cert };
}

tools.push({ id: 'assinardig', icon: '🔏', title: 'Assinar digitalmente', desc: 'Assina o PDF com um certificado (.pfx/.p12): ICP-Brasil A1, o que você criou aqui ou outro. A assinatura fica dentro do arquivo e qualquer alteração depois dela é detectada.',
  mount(root) {
    let cur = null, pdf = null, V = null, box = null, drag = null, pfx = null;
    const pfxPick = h('input', { type: 'file', accept: '.pfx,.p12,application/x-pkcs12', class: 'hide' });
    const pfxName = h('span', { class: 'meta' }, 'Nenhum certificado escolhido');
    pfxPick.addEventListener('change', async () => { const f = pfxPick.files[0]; if (!f) return; pfx = await readBytes(f); pfxName.textContent = f.name + ' · ' + fmtSize(f.size); pfxPick.value = ''; });
    const pw = h('input', { type: 'password', autocomplete: 'off', style: 'width:220px', placeholder: 'Senha do certificado' });
    const reason = h('input', { type: 'text', value: 'Assinatura digital', style: 'width:240px' });
    const loc = h('input', { type: 'text', placeholder: 'Cidade / UF (opcional)', style: 'width:200px' });
    const contact = h('input', { type: 'text', placeholder: 'E-mail ou telefone (opcional)', style: 'width:220px' });
    const vis = h('input', { type: 'checkbox', checked: true });
    const out = h('div');
    const viewHost = h('div', { class: 'hide' });
    const draw = (c, v) => {
      if (!vis.checked || !box || box.page !== v.n) return; const s = v.scale;
      c.save(); c.fillStyle = 'rgba(80,140,255,.18)'; c.strokeStyle = '#508cff'; c.lineWidth = 1.5; c.setLineDash([6, 3]);
      c.fillRect(box.x * s, box.y * s, box.w * s, box.h * s); c.strokeRect(box.x * s, box.y * s, box.w * s, box.h * s);
      c.setLineDash([]); c.fillStyle = '#2b5fd9'; c.font = `${11 * s}px sans-serif`; c.fillText('Assinatura aqui', box.x * s + 5, box.y * s + 15 * s); c.restore();
    };
    const onDown = e => { if (!vis.checked) return; const p = V.pos(e); drag = { a: p }; V.top.setPointerCapture(e.pointerId); };
    const onMove = e => { if (!drag) return; const p = V.pos(e), a = drag.a; box = { page: V.n, x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), w: Math.abs(p.x - a.x), h: Math.abs(p.y - a.y) }; V.redraw(); };
    const onUp = () => { if (!drag) return; drag = null; if (box && (box.w < 30 || box.h < 18)) box = defaultBox(); V.redraw(); };
    const defaultBox = () => { const W = V.vp1.width, H = V.vp1.height; return { page: V.n, x: Math.max(10, W - 220), y: Math.max(10, H - 90), w: Math.min(200, W - 20), h: 64 }; };
    vis.addEventListener('change', () => { viewHost.classList.toggle('hide', !vis.checked); if (V) V.redraw(); });
    const go = h('button', { class: 'primary', disabled: true, onclick: () => run('Assinando…', async () => {
      out.replaceChildren();
      if (!pfx) throw new Error('Escolha o arquivo do certificado (.pfx ou .p12).');
      const id = loadPfx(pfx, pw.value);
      let stamp = null;
      if (vis.checked) {
        const b = box || defaultBox(), pg = await pdf.getPage(b.page), vp1 = pg.getViewport({ scale: 1 });
        if (((vp1.rotation % 360) + 360) % 360) throw new Error('Esta página está girada: desmarque "assinatura visível" ou gire o PDF antes (ferramenta "Girar PDF").');
        const p1 = vp1.convertToPdfPoint(b.x, b.y), p2 = vp1.convertToPdfPoint(b.x + b.w, b.y + b.h);
        stamp = { pageIndex: b.page - 1, rect: [Math.min(p1[0], p2[0]), Math.min(p1[1], p2[1]), Math.max(p1[0], p2[0]), Math.max(p1[1], p2[1])] };
      }
      const r = await signPdf(cur.bytes, id, { stamp, reason: reason.value.trim(), location: loc.value.trim(), contact: contact.value.trim() });
      const v = await verifySigned(r.bytes);
      if (!v.ok) throw new Error('A verificação da assinatura falhou (' + v.why + '). Nada foi baixado.');
      await (await loadPdfJs(r.bytes)).getPage(1);                              // o PDF assinado ainda abre
      dlPdf(r.bytes, `${baseName(cur.file.name)}-assinado-digitalmente.pdf`);
      const self = id.cert.issuer.hash === id.cert.subject.hash, now = new Date(), nb = id.cert.validity.notBefore, na = id.cert.validity.notAfter;
      out.replaceChildren(h('p', { class: 'ok' }, `✔ PDF assinado por ${r.name} e verificado (resumo SHA-256 e assinatura RSA conferem).`),
        h('div', { class: 'meta' }, 'Emissor: ' + ((id.cert.issuer.getField('CN') || {}).value || '—') + ' · Certificado válido até ' + na.toLocaleDateString('pt-BR')),
        now < nb || now > na ? h('p', { class: 'warn' }, 'Atenção: este certificado está fora do prazo de validade, então os leitores vão apontar a assinatura como inválida.') : '',
        self ? h('p', { class: 'note' }, 'Certificado autoassinado: o Adobe mostrará "identidade desconhecida" até o destinatário importar o seu .cer e marcá-lo como confiável.') : '');
      toast('PDF assinado digitalmente.');
    }) }, 'Assinar e baixar');
    const opts = h('div', { class: 'card hide' },
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => pfxPick.click() }, 'Escolher certificado (.pfx / .p12)…'), pfxPick, pfxName, h('label', { class: 'f' }, 'Senha', pw)),
      h('div', { class: 'row', style: 'margin-top:12px' }, h('label', { class: 'f' }, 'Motivo', reason), h('label', { class: 'f' }, 'Local', loc), h('label', { class: 'f' }, 'Contato', contact)),
      h('div', { class: 'row', style: 'margin-top:12px' }, h('label', { class: 'f inline' }, vis, 'Mostrar a assinatura na página (arraste na página abaixo para escolher o local)')),
      h('p', { class: 'note' }, 'Importante: assine por último. Qualquer edição depois da assinatura (inclusive por outras ferramentas desta página) invalida a assinatura. Se o PDF já tinha assinaturas digitais, elas deixam de valer, porque o arquivo é regravado.'));
    const holder = h('div'); root.append(holder, opts, viewHost, h('div', { class: 'row end', style: 'margin-top:14px' }, go), out);
    singlePdf(holder, async c => {
      cur = c; out.replaceChildren(); pdf?.destroy?.(); pdf = await loadPdfJs(c.bytes); box = null;
      V = pageViewer(pdf, { scale: 1, draw, onPage: n => { if (!box) box = defaultBox(); } });
      V.top.addEventListener('pointerdown', onDown); V.top.addEventListener('pointermove', onMove); V.top.addEventListener('pointerup', onUp); V.top.addEventListener('pointercancel', onUp);
      viewHost.replaceChildren(h('div', { class: 'card' }, V.el)); viewHost.classList.toggle('hide', !vis.checked);
      opts.classList.remove('hide'); go.disabled = false; await V.go(1); box = box || defaultBox(); V.redraw();
    });
    root.unmount = () => { pdf?.destroy?.(); };
  } });
