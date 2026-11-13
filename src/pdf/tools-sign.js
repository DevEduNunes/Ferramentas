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
  let stamp = o.stamp || null, note = '';
  if (!stamp && o.place) {
    const pi = o.place.page === 'last' ? doc.getPageCount() - 1 : 0, pg = doc.getPage(pi);
    if (((pg.getRotation().angle % 360) + 360) % 360) note = 'página girada: assinado sem carimbo visível';
    else {
      const mb = pg.getMediaBox(), w = Math.min(210, mb.width - 40), hh = 66, m = 28, c = o.place.corner;
      const x = c.endsWith('l') ? mb.x + m : c.endsWith('c') ? mb.x + (mb.width - w) / 2 : mb.x + mb.width - w - m;
      const y = c.startsWith('t') ? mb.y + mb.height - hh - m : mb.y + m;
      stamp = { pageIndex: pi, rect: [x, y, x + w, y + hh] };
    }
  }
  let rect = [0, 0, 0, 0], page = doc.getPage(0);
  if (stamp) {
    page = doc.getPage(stamp.pageIndex); rect = stamp.rect;
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
  return { bytes: out, name, range, stamped: !!stamp, note };
}
/* ---------- validar assinaturas de um PDF ---------- */
const OID_DIGEST = { '1.3.14.3.2.26': ['SHA-1', 'sha1'], '2.16.840.1.101.3.4.2.1': ['SHA-256', 'sha256'], '2.16.840.1.101.3.4.2.2': ['SHA-384', 'sha384'], '2.16.840.1.101.3.4.2.3': ['SHA-512', 'sha512'] };
/* lê uma string de dicionário PDF (hexadecimal ou entre parênteses) */
function pdfText(dict, key) {
  const m = new RegExp(`/${key}\\s*(<[0-9A-Fa-f\\s]*>|\\((?:\\\\[\\s\\S]|[^\\\\)])*\\))`).exec(dict); if (!m) return '';
  let b;
  if (m[1][0] === '<') { const x = m[1].slice(1, -1).replace(/\s+/g, ''); b = forge.util.hexToBytes(x.length % 2 ? x + '0' : x); }
  else b = m[1].slice(1, -1).replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, c) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' })[c] ?? (/^[0-7]+$/.test(c) ? String.fromCharCode(parseInt(c, 8)) : c));
  if (b.startsWith('\xfe\xff')) { let o = ''; for (let i = 2; i + 1 < b.length; i += 2) o += String.fromCharCode(b.charCodeAt(i) << 8 | b.charCodeAt(i + 1)); return o; }
  return b;
}
const parseCertFile = bytes => {            // aceita .cer/.crt em DER ou PEM
  const s = binStr(bytes);
  return /-----BEGIN CERTIFICATE-----/.test(s) ? forge.pki.certificateFromPem(s) : forge.pki.certificateFromAsn1(forge.asn1.fromDer(s));
};
/* devolve uma entrada por assinatura encontrada: { ok, hashOk, sigOk, later, cert, ... } */
async function inspectSignatures(bytes) {
  const s = binStr(bytes), res = [], re = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
  let m;
  while ((m = re.exec(s))) {
    const off1 = +m[1], len1 = +m[2], off2 = +m[3], len2 = +m[4];
    const o = s.lastIndexOf(' obj', m.index), e = s.indexOf('endobj', m.index), dict = s.slice(Math.max(o, 0), e < 0 ? m.index + 600 : e);
    const r = { subFilter: (/\/SubFilter\s*\/([\w.]+)/.exec(dict) || [])[1] || '', reason: pdfText(dict, 'Reason'), location: pdfText(dict, 'Location'), claimedName: pdfText(dict, 'Name'), claimedDate: pdfText(dict, 'M'), ok: false, later: false };
    res.push(r);
    try {
      if (/RFC3161/i.test(r.subFilter)) throw new Error('carimbo de tempo do documento (não é uma assinatura de pessoa)');
      if (off1 !== 0 || len1 > off2 || off2 + len2 > bytes.length) throw new Error('intervalo de bytes (ByteRange) inválido');
      const tail = bytes.subarray(off2 + len2); r.later = tail.some(b => b > 32);
      const der = forge.util.hexToBytes(s.slice(len1 + 1, off2 - 1).replace(/\s+/g, ''));
      const p7 = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(der, { parseAllBytes: false })), rc = p7.rawCapture;
      const dOid = forge.asn1.derToOid(rc.digestAlgorithm), alg = OID_DIGEST[dOid];
      if (!alg) throw new Error('algoritmo de resumo não suportado (' + dOid + ')');
      const certs = p7.certificates || [], sn = forge.util.bytesToHex(rc.serial || '').replace(/^0+/, '');
      const cert = certs.find(c => c.serialNumber.replace(/^0+/, '') === sn) || certs[0];
      if (!cert) throw new Error('a assinatura não traz o certificado do assinante');
      if (!cert.publicKey || !cert.publicKey.n) throw new Error('tipo de chave não suportado (só RSA)');
      const data = new Uint8Array(len1 + len2); data.set(bytes.subarray(off1, off1 + len1), 0); data.set(bytes.subarray(off2, off2 + len2), len1);
      const dg = binStr(new Uint8Array(await crypto.subtle.digest(alg[0], data)));
      const attrs = rc.authenticatedAttributes;
      if (attrs && attrs.length) {
        const mdA = attrs.find(x => forge.asn1.derToOid(x.value[0].value) === forge.pki.oids.messageDigest);
        r.hashOk = !!mdA && mdA.value[1].value[0].value === dg;
        const set = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, attrs), md = forge.md[alg[1]].create();
        md.update(forge.asn1.toDer(set).getBytes());
        r.sigOk = cert.publicKey.verify(md.digest().getBytes(), rc.signature);
        const tA = attrs.find(x => forge.asn1.derToOid(x.value[0].value) === forge.pki.oids.signingTime);
        if (tA) { const v = tA.value[1].value[0]; try { r.signTime = v.type === forge.asn1.Type.UTCTIME ? forge.asn1.utcTimeToDate(v.value) : forge.asn1.generalizedTimeToDate(v.value); } catch {} }
      } else { r.hashOk = true; r.sigOk = cert.publicKey.verify(dg, rc.signature); }
      r.ok = !!(r.hashOk && r.sigOk); r.cert = cert; r.alg = alg[0]; r.certCount = certs.length;
      r.self = cert.issuer.hash === cert.subject.hash;
    } catch (err) { r.err = err?.message || String(err); }
  }
  return res;
}

/* ---- resumo por arquivo e por assinatura (usado na validação em lote) ---- */
const sigLabel = r => r.err ? '✘ Não foi possível conferir'
  : !r.ok ? '✘ INVÁLIDA'
  : r.later ? '⚠ Íntegra, com conteúdo acrescentado depois'
  : '✔ Íntegra';
const fileStatus = (sigs, err) => {
  if (err) return { k: 'bad', text: '✘ Erro ao ler o arquivo' };
  if (!sigs.length) return { k: 'none', text: 'Sem assinatura digital' };
  if (sigs.some(r => !r.err && !r.ok)) return { k: 'bad', text: '✘ INVÁLIDA' };
  if (sigs.some(r => r.err)) return { k: 'bad', text: '✘ Não foi possível conferir' };
  if (sigs.some(r => r.later)) return { k: 'warn', text: '⚠ Íntegra, com conteúdo depois' };
  return { k: 'ok', text: '✔ Íntegra' };
};

tools.push({ id: 'validar', icon: '✅', title: 'Validar assinatura', desc: 'Confere as assinaturas digitais de um ou vários PDFs: se o conteúdo foi alterado depois de assinado, quem assinou e a validade do certificado. Tudo no seu computador.',
  mount(root) {
    let results = [], trustFp = null, trustName = '';
    const out = h('div');
    const cerPick = h('input', { type: 'file', accept: '.cer,.crt,.pem,.der', class: 'hide' });
    const cerLabel = h('span', { class: 'meta' }, 'Opcional: o .cer que o assinante lhe enviou');
    cerPick.addEventListener('change', async () => {
      const f = cerPick.files[0]; if (!f) return; cerPick.value = '';
      try { const c = parseCertFile(await readBytes(f)); trustFp = certFingerprint(c); trustName = certCN(c); cerLabel.textContent = f.name + ' · ' + trustName; render(); }
      catch { toast('Não foi possível ler esse certificado (use um .cer/.crt em DER ou PEM).', 'err'); }
    });
    const dt = d => d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR');
    const line = (k, v) => h('div', { class: 'meta', style: 'margin-top:4px;word-break:break-all' }, [h('b', {}, k + ': '), v]);
    const NOSIG = 'Este PDF não tem assinatura digital. (Uma assinatura desenhada ou imagem sobre a página, como a de "Assinar PDF", não conta: não tem valor criptográfico.)';
    const sigCard = (r, i) => {
      const head = r.err ? h('p', { class: 'bad' }, `✘ Assinatura ${i + 1}: não foi possível conferir (${r.err}).`)
        : !r.ok ? h('p', { class: 'bad' }, `✘ Assinatura ${i + 1}: INVÁLIDA. ${!r.hashOk ? 'O conteúdo do PDF foi alterado depois de assinado.' : 'A assinatura não confere com o certificado (arquivo corrompido ou adulterado).'}`)
        : r.later ? h('p', { class: 'warn' }, `⚠ Assinatura ${i + 1}: íntegra, mas o arquivo tem conteúdo acrescentado depois dela (outra assinatura ou uma edição). O que foi assinado não mudou; confira o que veio depois.`)
        : h('p', { class: 'ok' }, `✔ Assinatura ${i + 1}: íntegra. O documento não foi alterado desde a assinatura.`);
      const kids = [head];
      if (r.cert) {
        const c = r.cert, na = c.validity.notAfter, nb = c.validity.notBefore, when = r.signTime || null, issuer = (c.issuer.getField('CN') || {}).value || '—', mail = (c.subject.getField('E') || {}).value;
        const org = (c.subject.getField('O') || {}).value;
        kids.push(line('Assinante', certCN(c) + (org ? ' · ' + org : '') + (mail ? ' <' + mail + '>' : '')));
        kids.push(line('Emissor', issuer + (r.self ? ' (certificado autoassinado)' : '')));
        kids.push(line('Validade do certificado', nb.toLocaleDateString('pt-BR') + ' a ' + na.toLocaleDateString('pt-BR') + (new Date() > na ? ' (expirado hoje)' : '')));
        if (when) kids.push(line('Data da assinatura', dt(when) + ' (relógio do computador do assinante: não prova a data)')); else if (r.claimedDate) kids.push(line('Data informada', r.claimedDate.replace(/^D:/, '') + ' (informada pelo assinante, não é prova)'));
        if (when && (when < nb || when > na)) kids.push(h('p', { class: 'warn' }, 'Atenção: a data da assinatura está fora do prazo de validade do certificado.'));
        if (r.reason) kids.push(line('Motivo', r.reason)); if (r.location) kids.push(line('Local', r.location));
        kids.push(line('Algoritmo', r.alg + ' com RSA ' + c.publicKey.n.bitLength() + ' bits'));
        const fp = certFingerprint(c);
        kids.push(line('Impressão digital (SHA-256)', fp));
        kids.push(trustFp ? (fp === trustFp ? h('p', { class: 'ok' }, `✔ O certificado é o mesmo do arquivo que você forneceu (${trustName}). Se você confia nesse .cer, a identidade confere.`) : h('p', { class: 'bad' }, `✘ O certificado desta assinatura NÃO é o do arquivo que você forneceu (${trustName}).`))
          : h('p', { class: 'note' }, r.self ? 'Certificado autoassinado: nenhuma autoridade atesta quem é o assinante. Para confiar na identidade, peça o .cer ao assinante por um canal seguro e escolha-o acima, ou compare a impressão digital.' : 'A confiança na identidade (cadeia até uma autoridade certificadora) não é verificada aqui. Para ICP-Brasil, confira em validar.iti.gov.br ou no Adobe.'));
      } else if (r.claimedName) kids.push(line('Nome informado', r.claimedName));
      return h('div', { class: 'card' }, kids);
    };
    const cardsOf = f => f.err ? [h('p', { class: 'bad' }, `✘ Não foi possível ler este arquivo (${f.err}).`)] : f.sigs.length ? f.sigs.map(sigCard) : [h('p', { class: 'warn' }, NOSIG)];
    const trustCell = f => { if (!trustFp) return null; const s = f.sigs.filter(r => r.cert); if (!s.length) return '—'; return s.every(r => certFingerprint(r.cert) === trustFp) ? '✔ confere' : '✘ diferente'; };
    const csv = () => {
      const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"', d = x => x.toLocaleDateString('pt-BR');
      const rows = [['Arquivo', 'Resultado', 'Assinatura', 'Assinante', 'Emissor', 'Válido de', 'Válido até', 'Data da assinatura', 'Impressão digital SHA-256', 'Observação']];
      results.forEach(f => {
        if (f.err || !f.sigs.length) rows.push([f.name, fileStatus(f.sigs, f.err).text, '', '', '', '', '', '', '', f.err || '']);
        else f.sigs.forEach((r, i) => { const c = r.cert; rows.push([f.name, sigLabel(r), i + 1, c ? certCN(c) : '', c ? (c.issuer.getField('CN') || {}).value || '' : '', c ? d(c.validity.notBefore) : '', c ? d(c.validity.notAfter) : '', r.signTime ? dt(r.signTime) : '', c ? certFingerprint(c) : '', r.err || '']); });
      });
      download('\ufeff' + rows.map(r => r.map(q).join(';')).join('\r\n'), 'relatorio-validacao.csv', 'text/csv;charset=utf-8');
    };
    const render = () => {
      if (!results.length) { out.replaceChildren(); return; }
      if (results.length === 1) { out.replaceChildren(...cardsOf(results[0])); return; }
      const st = results.map(f => fileStatus(f.sigs, f.err)), n = k => st.filter(s => s.k === k).length;
      const head = ['Arquivo', 'Resultado', 'Assinante', 'Data da assinatura', trustFp ? 'Confere com o .cer' : null].filter(Boolean);
      const table = h('table', { class: 't' }, h('thead', {}, h('tr', {}, head.map(t => h('th', {}, t)))),
        h('tbody', {}, results.map((f, i) => h('tr', {},
          h('td', { style: 'overflow-wrap:anywhere' }, f.name),
          h('td', { class: st[i].k === 'ok' ? 'ok' : st[i].k === 'bad' ? 'bad' : '' }, st[i].text),
          h('td', {}, [...new Set(f.sigs.filter(r => r.cert).map(r => certCN(r.cert)))].join(', ') || '—'),
          h('td', {}, f.sigs.find(r => r.signTime) ? dt(f.sigs.find(r => r.signTime).signTime) : '—'),
          trustFp ? h('td', {}, trustCell(f)) : null))));
      out.replaceChildren(
        h('p', { class: n('bad') ? 'bad' : n('warn') || n('none') ? 'warn' : 'ok' }, `${results.length} arquivos: ${n('ok')} íntegros, ${n('warn')} com conteúdo posterior, ${n('bad')} inválidos ou com erro, ${n('none')} sem assinatura.`),
        h('div', { class: 'card', style: 'overflow-x:auto' }, table),
        h('div', { class: 'row', style: 'margin:12px 0' }, h('button', { class: 'btn', onclick: csv }, 'Baixar relatório (CSV)')),
        ...results.map((f, i) => h('details', { class: 'card' }, h('summary', { style: 'cursor:pointer' }, `${f.name} — ${st[i].text}`), ...cardsOf(f))));
    };
    const holder = h('div');
    holder.append(dropzone({ accept: '.pdf,application/pdf', multiple: true, label: 'Arraste um ou vários PDFs assinados aqui', onFiles: files => run('Validando…', async prog => {
      results = [];
      for (let i = 0; i < files.length; i++) {
        prog(i, files.length, `Validando ${i + 1} de ${files.length}…`);
        try { const b = await readBytes(files[i]); if (!binStr(b.subarray(0, 1024)).includes('%PDF-')) throw new Error('o arquivo não é um PDF válido'); results.push({ name: files[i].name, sigs: await inspectSignatures(b) }); }
        catch (e) { results.push({ name: files[i].name, sigs: [], err: errMsg(e) }); }
      }
      prog(files.length, files.length); render();
    }) }));
    root.append(holder, h('div', { class: 'row', style: 'margin:12px 0' }, h('button', { class: 'btn', onclick: () => cerPick.click() }, 'Escolher certificado do assinante (.cer)…'), cerPick, cerLabel), out,
      h('p', { class: 'note' }, 'A validação mostra duas coisas: se o arquivo foi alterado depois da assinatura e qual certificado assinou. Ela não decide se você deve confiar nesse certificado: isso depende de quem o emitiu.'));
  } });

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
      const v = (await inspectSignatures(r.bytes)).pop();
      if (!v || !v.ok) throw new Error('A verificação da assinatura falhou (' + (v?.err || (v && !v.hashOk ? 'o conteúdo não confere com o resumo assinado' : 'assinatura RSA inválida')) + '). Nada foi baixado.');
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

/* ---------- assinar vários PDFs de uma vez ---------- */
const fileErr = e => /parse|header|Invalid PDF/i.test(e?.message || '') ? 'o arquivo não é um PDF válido ou está corrompido' : errMsg(e);
tools.push({ id: 'assinarlote', icon: '🗂️', title: 'Assinar em lote', desc: 'Assina vários PDFs de uma vez com o mesmo certificado (.pfx/.p12) e entrega tudo num ZIP. O carimbo visível fica na mesma posição em todos os arquivos.',
  mount(root) {
    let list = [], pfx = null;
    const listEl = h('div', { class: 'list' });
    const count = h('span', { class: 'meta' });
    const pfxPick = h('input', { type: 'file', accept: '.pfx,.p12,application/x-pkcs12', class: 'hide' });
    const pfxName = h('span', { class: 'meta' }, 'Nenhum certificado escolhido');
    pfxPick.addEventListener('change', async () => { const f = pfxPick.files[0]; if (!f) return; pfx = await readBytes(f); pfxName.textContent = f.name + ' · ' + fmtSize(f.size); pfxPick.value = ''; });
    const pw = h('input', { type: 'password', autocomplete: 'off', style: 'width:220px', placeholder: 'Senha do certificado' });
    const reason = h('input', { type: 'text', value: 'Assinatura digital', style: 'width:240px' });
    const loc = h('input', { type: 'text', placeholder: 'Cidade / UF (opcional)', style: 'width:200px' });
    const contact = h('input', { type: 'text', placeholder: 'E-mail ou telefone (opcional)', style: 'width:220px' });
    const vis = h('input', { type: 'checkbox', checked: true });
    const pgSel = h('select', {}, h('option', { value: 'first' }, 'Primeira página'), h('option', { value: 'last' }, 'Última página'));
    const posSel = h('select', {}, [['br', 'Inferior direito'], ['bl', 'Inferior esquerdo'], ['bc', 'Inferior centro'], ['tr', 'Superior direito'], ['tl', 'Superior esquerdo']].map(([v, t]) => h('option', { value: v }, t)));
    const out = h('div');
    const redraw = () => { drawItems(listEl, list, redraw, it => fmtSize(it.size)); count.textContent = list.length ? `${list.length} arquivo(s) na fila` : ''; go.disabled = !list.length; };
    const go = h('button', { class: 'primary', disabled: true, onclick: () => run('Assinando…', async prog => {
      out.replaceChildren();
      if (!list.length) throw new Error('Adicione ao menos um PDF.');
      if (!pfx) throw new Error('Escolha o arquivo do certificado (.pfx ou .p12).');
      const id = loadPfx(pfx, pw.value), place = vis.checked ? { page: pgSel.value, corner: posSel.value } : null;
      const z = new JSZip(), used = new Set(), log = []; let okN = 0;
      for (let i = 0; i < list.length; i++) {
        const it = list[i]; prog(i, list.length, `Assinando ${i + 1} de ${list.length}: ${it.name}`);
        await new Promise(r => setTimeout(r, 0));
        try {
          const r = await signPdf(await readBytes(it.file), id, { place, reason: reason.value.trim(), location: loc.value.trim(), contact: contact.value.trim() });
          const v = (await inspectSignatures(r.bytes)).pop();
          if (!v || !v.ok) throw new Error('a verificação da assinatura falhou');
          const base = baseName(it.name) + '-assinado-digitalmente'; let nm = base + '.pdf', k = 1;
          while (used.has(nm.toLowerCase())) nm = `${base}-${++k}.pdf`;
          used.add(nm.toLowerCase()); z.file(nm, r.bytes); okN++; log.push({ ok: true, name: it.name, note: r.note || '' });
        } catch (e) { log.push({ ok: false, name: it.name, note: fileErr(e) }); }
      }
      prog(list.length, list.length, 'Gerando ZIP…');
      out.replaceChildren(
        h('p', { class: okN === list.length ? 'ok' : okN ? 'warn' : 'bad' }, okN ? `${okN} de ${list.length} PDF(s) assinados e conferidos. O ZIP foi baixado.` : 'Nenhum PDF foi assinado.'),
        ...log.map(l => h('div', { class: 'meta', style: 'margin-top:4px;word-break:break-all' }, [h('span', { class: l.ok ? 'ok' : 'bad' }, l.ok ? '✔ ' : '✘ '), l.name + (l.note ? ' — ' + l.note : '')])));
      if (okN) { download(await z.generateAsync({ type: 'blob' }), 'pdfs-assinados.zip'); toast(`${okN} PDF(s) assinado(s).`); }
    }) }, 'Assinar todos e baixar ZIP');
    const dz = dropzone({ accept: '.pdf,application/pdf', multiple: true, label: 'Arraste os PDFs aqui', onFiles: fs => { fs.forEach(f => list.push({ name: f.name, size: f.size, file: f })); redraw(); } });
    root.append(dz, listEl, h('div', { class: 'row', style: 'margin:8px 0' }, count, h('span', { class: 'grow' }), h('button', { class: 'btn', onclick: () => { list.length = 0; redraw(); out.replaceChildren(); } }, 'Limpar lista')),
      h('div', { class: 'card' },
        h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => pfxPick.click() }, 'Escolher certificado (.pfx / .p12)…'), pfxPick, pfxName, h('label', { class: 'f' }, 'Senha', pw)),
        h('div', { class: 'row', style: 'margin-top:12px' }, h('label', { class: 'f' }, 'Motivo', reason), h('label', { class: 'f' }, 'Local', loc), h('label', { class: 'f' }, 'Contato', contact)),
        h('div', { class: 'row', style: 'margin-top:12px' }, h('label', { class: 'f inline' }, vis, 'Mostrar o carimbo na página'), h('label', { class: 'f' }, 'Página', pgSel), h('label', { class: 'f' }, 'Posição', posSel)),
        h('p', { class: 'note' }, 'Cada arquivo recebe a sua própria assinatura e é conferido antes de entrar no ZIP; os que falharem (por exemplo, PDF com senha) aparecem na lista com o motivo. Páginas giradas são assinadas sem carimbo visível. Todos os arquivos ficam na memória do navegador: para lotes muito grandes, divida em partes. Assine por último: editar depois invalida a assinatura.')),
      h('div', { class: 'row end', style: 'margin-top:14px' }, go), out);
  } });
