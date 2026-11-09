/* ============================================================
   DAO ETERNO · servidor on-line (para o Render)
   Node.js puro, sem nenhuma dependência: HTTP + WebSocket
   escritos à mão. Guarda as salas na memória.

   GET  /        → o próprio jogo (se DaoEterno.html estiver nesta pasta)
   GET  /status  → "ok" (o Render usa para saber se está vivo)
   GET  /salas   → salas públicas abertas (JSON)
   WS   /ws      → conexão do jogo

   Mensagens (JSON):
     cliente → servidor: {t:'criar', nome, publica} | {t:'entrar', sala, nome}
                         e as do jogo: ola, p, chat, drop, some, pegar, mats, evento, tchau
     servidor → cliente: {t:'sala', sala, id} | {t:'erro', msg} e as do jogo repassadas
   O servidor é o juiz dos itens no chão: quem pede primeiro, leva.
   ============================================================ */
'use strict';
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORTA = process.env.PORT || 8790;
const MAX_SALA = 12, MAX_MSG = 64 * 1024, MAX_SALAS = 500;
const salas = new Map(); // código → { codigo, publica, criada, nomeDono, membros: Map(id → cliente), drops: Map(uid → item), evento, ola: Map(id → msg) }
let proxId = 1, jogoHtml = null;

const codigo = () => { let c; do { c = Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[crypto.randomInt(32)]).join(''); } while (salas.has(c)); return c; };
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };

// ---------- HTTP ----------
const servidor = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (url === '/salas') {
    const lista = [...salas.values()].filter((s) => s.publica).map((s) => ({ sala: s.codigo, dono: s.nomeDono, jogadores: s.membros.size, max: MAX_SALA }));
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, cors));
    return res.end(JSON.stringify(lista));
  }
  if (url === '/' || url === '/index.html') {
    const arq = path.join(__dirname, 'DaoEterno.html');
    if (!jogoHtml && fs.existsSync(arq)) jogoHtml = Buffer.from(fs.readFileSync(arq, 'utf8').replace('</head>', '<script>window.DAO_SERVIDOR = location.origin;</script></head>'));
    if (jogoHtml) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }); return res.end(jogoHtml); }
  }
  res.writeHead(200, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, cors));
  res.end('Dao Eterno · servidor on-line ok · ' + salas.size + ' sala(s), ' + [...salas.values()].reduce((a, s) => a + s.membros.size, 0) + ' jogador(es)');
});

// ---------- WebSocket (RFC 6455, só o necessário) ----------
servidor.on('upgrade', (req, socket) => {
  if (req.url.split('?')[0] !== '/ws' || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { socket.destroy(); return; }
  const chave = req.headers['sec-websocket-key']; if (!chave) { socket.destroy(); return; }
  const aceite = crypto.createHash('sha1').update(chave + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + aceite + '\r\n\r\n');
  socket.setNoDelay(true);
  novoCliente(socket);
});

function quadro(op, dados) {
  const n = dados.length; let cab;
  if (n < 126) { cab = Buffer.alloc(2); cab[1] = n; }
  else if (n < 65536) { cab = Buffer.alloc(4); cab[1] = 126; cab.writeUInt16BE(n, 2); }
  else { cab = Buffer.alloc(10); cab[1] = 127; cab.writeBigUInt64BE(BigInt(n), 2); }
  cab[0] = 0x80 | op;
  return Buffer.concat([cab, dados]);
}

function novoCliente(socket) {
  const c = { id: 's' + (proxId++).toString(36) + crypto.randomBytes(3).toString('hex'), socket, buf: Buffer.alloc(0), sala: null, vivo: Date.now(), nome: '?', msgs: 0, janela: Date.now() };
  c.enviar = (obj) => { if (socket.writable) socket.write(quadro(1, Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj)))); };
  socket.on('data', (d) => {
    c.buf = Buffer.concat([c.buf, d]);
    if (c.buf.length > MAX_MSG * 2) return socket.destroy();
    for (;;) {
      if (c.buf.length < 2) return;
      const b0 = c.buf[0], b1 = c.buf[1], op = b0 & 0x0f, mask = b1 & 0x80; let n = b1 & 0x7f, p = 2;
      if (n === 126) { if (c.buf.length < 4) return; n = c.buf.readUInt16BE(2); p = 4; }
      else if (n === 127) { if (c.buf.length < 10) return; n = Number(c.buf.readBigUInt64BE(2)); p = 10; }
      if (n > MAX_MSG) return socket.destroy();
      const tot = p + (mask ? 4 : 0) + n; if (c.buf.length < tot) return;
      let dados = c.buf.subarray(p + (mask ? 4 : 0), tot);
      if (mask) { const m = c.buf.subarray(p, p + 4); dados = Buffer.from(dados); for (let i = 0; i < dados.length; i++) dados[i] ^= m[i & 3]; }
      c.buf = c.buf.subarray(tot);
      c.vivo = Date.now();
      if (op === 8) { socket.end(quadro(8, Buffer.alloc(0))); return; }
      if (op === 9) { socket.write(quadro(10, dados)); continue; }
      if (op === 1) { let m; try { m = JSON.parse(dados.toString('utf8')); } catch (e) { continue; } mensagem(c, m); }
    }
  });
  socket.on('close', () => sairDaSala(c));
  socket.on('error', () => sairDaSala(c));
}

// ---------- salas ----------
function paraSala(s, obj, exceto) { const txt = JSON.stringify(obj); for (const m of s.membros.values()) if (m !== exceto) m.enviar(txt); }

function mensagem(c, m) {
  if (!m || typeof m.t !== 'string') return;
  // limite simples: no máximo 60 mensagens por segundo por jogador
  const agora = Date.now(); if (agora - c.janela > 1000) { c.janela = agora; c.msgs = 0; } if (++c.msgs > 60) return;
  if (m.t === 'criar') {
    if (c.sala) return; if (salas.size >= MAX_SALAS) return c.enviar({ t: 'erro', msg: 'O servidor está cheio. Tente mais tarde.' });
    const s = { codigo: codigo(), publica: !!m.publica, criada: agora, nomeDono: String(m.nome || '?').slice(0, 24), membros: new Map(), drops: new Map(), evento: null, ola: new Map() };
    salas.set(s.codigo, s); entrar(c, s, m.nome); return;
  }
  if (m.t === 'entrar') {
    if (c.sala) return; const s = salas.get(String(m.sala || '').toUpperCase());
    if (!s) return c.enviar({ t: 'erro', msg: 'Sala não encontrada. Confira o código.' });
    if (s.membros.size >= MAX_SALA) return c.enviar({ t: 'erro', msg: 'A sala está cheia.' });
    entrar(c, s, m.nome); return;
  }
  const s = c.sala; if (!s) return;
  m.i = m.t === 'p' || m.t === 'ola' || m.t === 'mats' ? c.id : m.i; // ninguém fala em nome de outro
  switch (m.t) {
    case 'ola': s.ola.set(c.id, m); c.nome = String(m.nome || '?').slice(0, 24); break;
    case 'drop': if (m.it && m.it.uid) { m.it.dono = c.id; s.drops.set(m.it.uid, m.it); } break;
    case 'some': { const it = s.drops.get(m.uid); if (!it || it.dono !== c.id) return; s.drops.delete(m.uid); break; }
    case 'pegar': { const it = s.drops.get(m.uid); if (!it) return; s.drops.delete(m.uid); paraSala(s, { t: 'pego', uid: m.uid, quem: c.id }); return; }
    case 'pego': if (!s.drops.has(m.uid)) return; s.drops.delete(m.uid); m.quem = c.id; break;
    case 'evento': s.evento = { id: m.id, ate: agora + 240000 }; break;
    case 'chat': m.txt = String(m.txt || '').slice(0, 160); m.nome = c.nome; break;
    case 'p': case 'mats': case 'tchau': break;
    default: return;
  }
  paraSala(s, m, c);
}

function entrar(c, s, nome) {
  c.sala = s; c.nome = String(nome || '?').slice(0, 24); s.membros.set(c.id, c);
  c.enviar({ t: 'sala', sala: s.codigo, id: c.id, dono: s.nomeDono });
  for (const o of s.ola.values()) c.enviar(Object.assign({}, o, { eco: 1 }));
  c.enviar({ t: 'estado', drops: [...s.drops.values()].map((it) => Object.assign({}, it, { meu: 0 })), evento: s.evento && s.evento.ate > Date.now() ? s.evento.id : null });
}

function sairDaSala(c) {
  const s = c.sala; if (!s) return; c.sala = null;
  s.membros.delete(c.id); s.ola.delete(c.id);
  for (const [uid, it] of s.drops) if (it.dono === c.id) s.drops.delete(uid);
  paraSala(s, { t: 'tchau', i: c.id });
  if (!s.membros.size) salas.delete(s.codigo);
}

// ---------- vivo? (o Render e alguns roteadores derrubam conexões paradas) ----------
setInterval(() => {
  const agora = Date.now();
  for (const s of salas.values()) for (const c of s.membros.values()) {
    if (agora - c.vivo > 70000) { c.socket.destroy(); continue; }
    if (c.socket.writable) c.socket.write(quadro(9, Buffer.alloc(0)));
  }
}, 25000);

process.on('uncaughtException', (e) => console.error('erro (o servidor continua):', e));
servidor.listen(PORTA, '0.0.0.0', () => console.log('Dao Eterno · servidor on-line na porta ' + PORTA));
