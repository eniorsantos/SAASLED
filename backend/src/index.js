// API REST — spec §6 (back-end) + fluxos §5 + permissões §9.2 + auditoria
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const XLSX = require('xlsx');
const db = require('./db');
const R = require('./regras');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'led-control-dev';
app.use(cors());
app.use(express.json());

const log = (quem, oque, detalhe = '') =>
  db.prepare('INSERT INTO auditoria (quem,oque,detalhe) VALUES (?,?,?)').run(quem, oque, detalhe);

// — Auth (spec §9.2: login/senha; SSO/2FA futuros) —
function auth(required = true) {
  return (req, res, next) => {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) {
      if (!required) { req.user = null; return next(); }
      return res.status(401).json({ erro: 'não autenticado' });
    }
    try { req.user = jwt.verify(h.slice(7), JWT_SECRET); next(); }
    catch { return res.status(401).json({ erro: 'token inválido' }); }
  };
}
const podeEditar = (req, res, next) => {
  if (['admin', 'regional', 'operador'].includes(req.user?.perfil)) return next();
  return res.status(403).json({ erro: 'perfil visualizador: somente leitura' });
};
const soAdmin = (req, res, next) => {
  if (req.user?.perfil === 'admin') return next();
  return res.status(403).json({ erro: 'somente admin' });
};
// — Controle de acesso por usuário: o que cada um pode VER e FAZER —
// Recursos: visibilidade de módulos + ações. Cada perfil tem um padrão e o
// admin pode conceder recursos extras por usuário (tabela permissoes).
const RECURSOS = [
  { id: 'dashboard', rotulo: 'Dashboard' },
  { id: 'planilha', rotulo: 'Planilha' },
  { id: 'graficos', rotulo: 'Gráficos' },
  { id: 'leds', rotulo: 'Gerenciar LEDs' },
  { id: 'campanhas_editar', rotulo: 'Editar campanhas' },
  { id: 'reservas', rotulo: 'Cadastro de reservas' },
  { id: 'importar', rotulo: 'Importar planilha' },
  { id: 'exportar', rotulo: 'Exportar' },
  { id: 'notificacoes', rotulo: 'Notificações' },
  { id: 'usuarios', rotulo: 'Gerenciar usuários' },
  { id: 'config', rotulo: 'Configurações' },
];
const PERFIL_DEFAULT = {
  admin: RECURSOS.map((r) => r.id),
  regional: ['dashboard', 'planilha', 'graficos', 'leds', 'campanhas_editar', 'reservas', 'importar', 'exportar', 'notificacoes'],
  operador: ['dashboard', 'planilha', 'graficos', 'leds', 'campanhas_editar', 'reservas', 'notificacoes'],
  visualizador: ['dashboard', 'planilha', 'graficos', 'notificacoes'],
};
function permissoesEfetivas(login, perfil) {
  const extras = db.prepare('SELECT recurso FROM permissoes WHERE login = ?').all(login).map((r) => r.recurso);
  return [...new Set([...(PERFIL_DEFAULT[perfil] || []), ...extras])];
}
function temAcesso(user, recurso) {
  if (!user) return false;
  return permissoesEfetivas(user.login, user.perfil).includes(recurso);
}
const requer = (recurso) => (req, res, next) => {
  if (temAcesso(req.user, recurso)) return next();
  return res.status(403).json({ erro: `sem acesso a "${recurso}" para o seu usuário` });
};
// Auth opcional nas leituras (header Bearer ou ?token= p/ downloads diretos):
// sem token, comportamento público; com token não-admin, o filtro é
// intersectado com as cidades vinculadas ao usuário (qualquer perfil).
function authOpcional(req, _res, next) {
  const h = req.headers.authorization || '';
  const q = req.query.token || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : q;
  if (tok) {
    try { req.user = jwt.verify(tok, JWT_SECRET); } catch { req.user = null; }
  } else req.user = null;
  next();
}
function cidadesPermitidas(user) {
  if (!user || user.perfil === 'admin') return null;
  const vinc = db.prepare('SELECT cidade_id FROM usuario_cidade WHERE login = ?').all(user.login).map((r) => r.cidade_id);
  return vinc.length ? vinc : null; // sem vínculo = todas (comportamento atual)
}
function filtroEfetivo(req) {
  const pedido = (req.query.cidades || '').split(',').filter(Boolean);
  if (req.query.cidade) pedido.push(req.query.cidade); // compat: ?cidade= singular
  const perm = cidadesPermitidas(req.user);
  if (!perm) return pedido;
  const ef = pedido.length ? pedido.filter((c) => perm.includes(c)) : [...perm];
  return ef.length ? ef : ['__nenhuma__'];
}
// Escrita com escopo: não-admin com cidades vinculadas só altera dados dessas
// cidades (vale para campanhas, reservas, LEDs e spots — por ID ou por payload)
function escopoCidadeOk(user, cidadeId) {
  if (!user || user.perfil === 'admin') return true;
  const vinc = db.prepare('SELECT cidade_id FROM usuario_cidade WHERE login = ?').all(user.login).map((r) => r.cidade_id);
  return vinc.length === 0 || vinc.includes(cidadeId);
}
const ERRO_ESCOPO = 'fora do seu escopo de cidades';
function cidadeDoLed(ledCodigo) {
  const l = db.prepare('SELECT * FROM leds WHERE codigo = ?').get(ledCodigo);
  return l ? l.cidade_id : null;
}

app.post('/api/auth/login', (req, res) => {
  const { login, senha } = req.body || {};
  const u = db.prepare('SELECT * FROM usuarios WHERE login = ? AND senha = ?').get(login, senha);
  if (!u) return res.status(401).json({ erro: 'credenciais inválidas' });
  const token = jwt.sign({ login: u.login, perfil: u.perfil, nome: u.nome }, JWT_SECRET, { expiresIn: '12h' });
  log(u.login, 'login', u.perfil);
  res.json({ token, perfil: u.perfil, nome: u.nome, login: u.login });
});

// — Config N dias (§3, configurável) —
app.get('/api/config', (req, res) => res.json({ hoje: R.hojeISO(), ...R.getConfig(db) }));
app.put('/api/config', auth(), requer('config'), (req, res) => {
  const { n_inicio_proximo, n_vencimento_proximo, max_clientes_por_led } = req.body || {};
  if (max_clientes_por_led !== undefined && (!Number.isInteger(max_clientes_por_led) || max_clientes_por_led < 1))
    return res.status(400).json({ erro: 'max_clientes_por_led deve ser inteiro >= 1' });
  db.prepare('UPDATE config SET n_inicio_proximo = COALESCE(?,n_inicio_proximo), n_vencimento_proximo = COALESCE(?,n_vencimento_proximo), max_clientes_por_led = COALESCE(?,max_clientes_por_led) WHERE id = 1')
    .run(n_inicio_proximo ?? null, n_vencimento_proximo ?? null, max_clientes_por_led ?? null);
  log(req.user.login, 'config.update', JSON.stringify(req.body));
  res.json(R.getConfig(db));
});

// — Cidades (§8.1 CRUD: nome, UF, fuso) —
app.get('/api/cidades', (req, res) => res.json(db.prepare('SELECT * FROM cidades ORDER BY nome').all()));
app.post('/api/cidades', auth(), podeEditar, (req, res) => {
  const { id, nome, uf = '', fuso = 'America/Maceio' } = req.body || {};
  if (!id || !nome) return res.status(400).json({ erro: 'id e nome obrigatórios' });
  db.prepare('INSERT INTO cidades (id,nome,uf,fuso) VALUES (?,?,?,?)').run(id, nome, uf, fuso);
  log(req.user.login, 'cidade.create', id);
  res.status(201).json({ id, nome, uf, fuso });
});

// — LEDs (menu de cadastro: incluir, editar, excluir) —
app.get('/api/leds', authOpcional, (req, res) => {
  const filtro = filtroEfetivo(req);
  const cfg = R.getConfig(db), hoje = R.hojeISO();
  let rows = db.prepare('SELECT * FROM leds ORDER BY codigo').all();
  if (filtro.length) rows = rows.filter((l) => filtro.includes(l.cidade_id));
  res.json(rows.map((l) => ({
    ...l,
    espacos_usados: R.espacosUsados(db, l.codigo, hoje).length,
    espacos_total: cfg.max_clientes_por_led,
  })));
});
app.post('/api/leds', auth(), requer('leds'), (req, res) => {
  const { codigo, endereco, cidade_id } = req.body || {};
  if (!codigo || !endereco || !cidade_id) return res.status(400).json({ erro: 'codigo, endereco, cidade_id obrigatórios' });
  if (!db.prepare('SELECT * FROM cidades WHERE id = ?').get(cidade_id))
    return res.status(400).json({ erro: `cidade "${cidade_id}" não cadastrada` });
  if (!escopoCidadeOk(req.user, cidade_id))
    return res.status(403).json({ erro: ERRO_ESCOPO });
  try {
    db.prepare('INSERT INTO leds (codigo,endereco,cidade_id) VALUES (?,?,?)').run(codigo.trim(), endereco, cidade_id);
  } catch { return res.status(409).json({ erro: `LED "${codigo}" já cadastrado` }); }
  log(req.user.login, 'led.create', codigo);
  res.status(201).json({ codigo, endereco, cidade_id });
});
app.put('/api/leds/:codigo', auth(), requer('leds'), (req, res) => {
  const cur = db.prepare('SELECT * FROM leds WHERE codigo = ?').get(req.params.codigo);
  if (!cur) return res.status(404).json({ erro: 'LED não encontrado' });
  const { endereco = cur.endereco, cidade_id = cur.cidade_id, novo_codigo = cur.codigo } = req.body || {};
  if (!endereco) return res.status(400).json({ erro: 'endereco obrigatório' });
  if (!db.prepare('SELECT * FROM cidades WHERE id = ?').get(cidade_id))
    return res.status(400).json({ erro: `cidade "${cidade_id}" não cadastrada` });
  if (!escopoCidadeOk(req.user, cur.cidade_id) || !escopoCidadeOk(req.user, cidade_id))
    return res.status(403).json({ erro: ERRO_ESCOPO });
  const renomear = novo_codigo !== cur.codigo;
  const tx = db.transaction(() => {
    if (renomear) {
      db.prepare('INSERT INTO leds (codigo,endereco,cidade_id) VALUES (?,?,?)').run(novo_codigo, endereco, cidade_id);
      db.prepare('UPDATE campanhas SET led_codigo = ? WHERE led_codigo = ?').run(novo_codigo, cur.codigo);
      db.prepare('UPDATE programacoes SET led_codigo = ? WHERE led_codigo = ?').run(novo_codigo, cur.codigo);
      db.prepare('DELETE FROM leds WHERE codigo = ?').run(cur.codigo);
    } else {
      db.prepare('UPDATE leds SET endereco = ?, cidade_id = ? WHERE codigo = ?').run(endereco, cidade_id, cur.codigo);
    }
  });
  try { tx(); } catch { return res.status(409).json({ erro: `LED "${novo_codigo}" já cadastrado` }); }
  log(req.user.login, 'led.update', `${req.params.codigo}${renomear ? ' → ' + novo_codigo : ''}`);
  res.json({ ok: true, codigo: novo_codigo });
});
app.delete('/api/leds/:codigo', auth(), requer('leds'), (req, res) => {
  const cur = db.prepare('SELECT * FROM leds WHERE codigo = ?').get(req.params.codigo);
  if (!cur) return res.status(404).json({ erro: 'LED não encontrado' });
  if (!escopoCidadeOk(req.user, cur.cidade_id))
    return res.status(403).json({ erro: ERRO_ESCOPO });
  const n = db.prepare('SELECT COUNT(*) v FROM campanhas WHERE led_codigo = ?').get(req.params.codigo).v;
  if (n > 0) return res.status(409).json({ erro: `LED possui ${n} campanha(s) — exclua ou transfira antes` });
  db.prepare('DELETE FROM programacoes WHERE led_codigo = ?').run(req.params.codigo);
  db.prepare('DELETE FROM leds WHERE codigo = ?').run(req.params.codigo);
  log(req.user.login, 'led.delete', req.params.codigo);
  res.json({ ok: true });
});

// — Anunciantes —
app.get('/api/anunciantes', (req, res) =>
  res.json(db.prepare('SELECT * FROM anunciantes ORDER BY nome').all()));

// — Campanhas (validação de datas §1: "31/9" inválida) —
function comStatus(rows) {
  const cfg = R.getConfig(db);
  return rows.map((c) => ({ ...c, status: R.statusCampanha(c, cfg) }));
}
app.get('/api/campanhas', authOpcional, (req, res) => {
  const filtro = filtroEfetivo(req);
  const { led, status } = req.query;
  let rows = db.prepare('SELECT * FROM campanhas ORDER BY inicio').all();
  if (filtro.length) rows = rows.filter((c) => filtro.includes(c.cidade_id));
  if (led) rows = rows.filter((c) => c.led_codigo === led);
  let out = comStatus(rows);
  if (status) out = out.filter((c) => c.status === status);
  res.json(out);
});
app.post('/api/campanhas', auth(), requer('campanhas_editar'), (req, res) => {
  const { id, cidade_id, led_codigo, inicio, fim, reservada = 0 } = req.body || {};
  const anunciante = R.normalizarAnunciante(req.body?.anunciante);
  if (!id || !cidade_id || !led_codigo || !anunciante || !inicio || !fim)
    return res.status(400).json({ erro: 'campos obrigatórios: id, cidade_id, led_codigo, anunciante, inicio, fim' });
  if (!R.validarDataISO(inicio) || !R.validarDataISO(fim))
    return res.status(400).json({ erro: 'data inválida (use AAAA-MM-DD válido — ex.: 31/9 é inválido)' });
  if (inicio > fim) return res.status(400).json({ erro: 'início posterior ao fim' });
  const ledCidade = cidadeDoLed(led_codigo);
  if (!ledCidade)
    return res.status(400).json({ erro: `LED "${led_codigo}" não cadastrado` });
  if (ledCidade !== cidade_id)
    return res.status(400).json({ erro: `LED ${led_codigo} é de "${ledCidade}", não de "${cidade_id}"` });
  if (!escopoCidadeOk(req.user, cidade_id))
    return res.status(403).json({ erro: ERRO_ESCOPO });
  // Capacidade: cada LED tem max_clientes_por_led espaços (anunciantes distintos não-vencidos)
  const cfg = R.getConfig(db), hoje = R.hojeISO();
  const usados = R.espacosUsados(db, led_codigo, hoje);
  if (!usados.includes(anunciante) && usados.length >= cfg.max_clientes_por_led)
    return res.status(409).json({ erro: `LED ${led_codigo} lotado: ${usados.length}/${cfg.max_clientes_por_led} espaços ocupados`, espacos: { usados: usados.length, total: cfg.max_clientes_por_led } });
  db.prepare('INSERT OR IGNORE INTO anunciantes (nome) VALUES (?)').run(anunciante);
  db.prepare('INSERT INTO campanhas (id,cidade_id,led_codigo,anunciante,inicio,fim,reservada) VALUES (?,?,?,?,?,?,?)')
    .run(id, cidade_id, led_codigo, anunciante, inicio, fim, reservada ? 1 : 0);
  log(req.user.login, 'campanha.create', id);
  res.status(201).json({ ok: true, id });
});
app.put('/api/campanhas/:id', auth(), requer('campanhas_editar'), (req, res) => { // edição inline da planilha (§4.4)
  const cur = db.prepare('SELECT * FROM campanhas WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ erro: 'não encontrada' });
  const nx = { ...cur, ...req.body };
  if (req.body.anunciante !== undefined) nx.anunciante = R.normalizarAnunciante(req.body.anunciante);
  if (!nx.anunciante)
    return res.status(400).json({ erro: 'anunciante obrigatório' });
  if ((req.body.inicio && !R.validarDataISO(nx.inicio)) || (req.body.fim && !R.validarDataISO(nx.fim)))
    return res.status(400).json({ erro: 'data inválida' });
  if (nx.inicio > nx.fim) return res.status(400).json({ erro: 'início posterior ao fim' });
  const nxLedCidade = cidadeDoLed(nx.led_codigo);
  if (!nxLedCidade)
    return res.status(400).json({ erro: `LED "${nx.led_codigo}" não cadastrado` });
  if (nxLedCidade !== nx.cidade_id)
    return res.status(400).json({ erro: `LED ${nx.led_codigo} é de "${nxLedCidade}", não de "${nx.cidade_id}"` });
  if (!escopoCidadeOk(req.user, cur.cidade_id) || !escopoCidadeOk(req.user, nx.cidade_id))
    return res.status(403).json({ erro: ERRO_ESCOPO });
  // Capacidade ao trocar de LED/anunciante (ignora a própria campanha na contagem)
  if (nx.led_codigo !== cur.led_codigo || nx.anunciante !== cur.anunciante) {
    const cfg2 = R.getConfig(db);
    const usados = R.espacosUsados(db, nx.led_codigo, R.hojeISO(), req.params.id);
    if (!usados.includes(nx.anunciante) && usados.length >= cfg2.max_clientes_por_led)
      return res.status(409).json({ erro: `LED ${nx.led_codigo} lotado: ${usados.length}/${cfg2.max_clientes_por_led} espaços ocupados`, espacos: { usados: usados.length, total: cfg2.max_clientes_por_led } });
  }
  db.prepare('UPDATE campanhas SET anunciante=?,inicio=?,fim=?,reservada=?,led_codigo=?,cidade_id=? WHERE id=?')
    .run(nx.anunciante, nx.inicio, nx.fim, nx.reservada ? 1 : 0, nx.led_codigo, nx.cidade_id, req.params.id);
  log(req.user.login, 'campanha.update', req.params.id);
  res.json({ ok: true });
});
app.delete('/api/campanhas/:id', auth(), requer('campanhas_editar'), (req, res) => {
  const cur = db.prepare('SELECT * FROM campanhas WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ erro: 'não encontrada' });
  if (!escopoCidadeOk(req.user, cur.cidade_id))
    return res.status(403).json({ erro: ERRO_ESCOPO });
  db.prepare('DELETE FROM campanhas WHERE id = ?').run(req.params.id);
  log(req.user.login, 'campanha.delete', req.params.id);
  res.json({ ok: true });
});

// — Reservas múltiplas: cada campanha pode ter N períodos futuros reservados —
// cada reserva gera seu toast de início próximo na varredura (§4.1)
function reservasDaCampanha(campanhaId, anunciantePadrao) {
  return db.prepare('SELECT * FROM reservas WHERE campanha_id = ? ORDER BY inicio').all(campanhaId)
    .map((r) => ({ ...r, anunciante: r.anunciante || anunciantePadrao || '' }));
}
// (rotação: reservas convivem com campanha e entre si — sem checagem de choque)
app.get('/api/campanhas/:id/reservas', authOpcional, (req, res) => {
  const camp = db.prepare('SELECT * FROM campanhas WHERE id = ?').get(req.params.id);
  if (!camp) return res.status(404).json({ erro: 'campanha não encontrada' });
  const filtro = filtroEfetivo(req);
  if (filtro.length && !filtro.includes(camp.cidade_id))
    return res.status(403).json({ erro: ERRO_ESCOPO });
  res.json(reservasDaCampanha(req.params.id, camp.anunciante));
});
app.post('/api/campanhas/:id/reservas', auth(), requer('reservas'), (req, res) => {
  const camp = db.prepare('SELECT * FROM campanhas WHERE id = ?').get(req.params.id);
  if (!camp) return res.status(404).json({ erro: 'campanha não encontrada' });
  if (!escopoCidadeOk(req.user, camp.cidade_id))
    return res.status(403).json({ erro: ERRO_ESCOPO });
  const { inicio, fim } = req.body || {};
  if (!R.validarDataISO(inicio) || !R.validarDataISO(fim))
    return res.status(400).json({ erro: 'data inválida (use AAAA-MM-DD válido)' });
  if (inicio > fim) return res.status(400).json({ erro: 'início posterior ao fim' });
  const anu = R.normalizarAnunciante(req.body?.anunciante) || camp.anunciante;
  // rotação: reservas convivem com o período da campanha e entre si (sem checagem de choque)
  const id = 'r' + Date.now();
  db.prepare('INSERT OR IGNORE INTO anunciantes (nome) VALUES (?)').run(anu);
  db.prepare('INSERT INTO reservas (id,campanha_id,inicio,fim,anunciante,criada_por) VALUES (?,?,?,?,?,?)')
    .run(id, req.params.id, inicio, fim, anu, req.user.login);
  log(req.user.login, 'reserva.create', `${id} (${anu} ${inicio} → ${fim})`);
  res.status(201).json({ ok: true, id });
});
app.delete('/api/reservas/:id', auth(), requer('reservas'), (req, res) => {
  const r = db.prepare('SELECT * FROM reservas WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ erro: 'reserva não encontrada' });
  const camp = db.prepare('SELECT * FROM campanhas WHERE id = ?').get(r.campanha_id);
  if (camp && !escopoCidadeOk(req.user, camp.cidade_id))
    return res.status(403).json({ erro: ERRO_ESCOPO });
  db.prepare('DELETE FROM reservas WHERE id = ?').run(req.params.id);
  log(req.user.login, 'reserva.delete', req.params.id);
  res.json({ ok: true });
});
// Menu de cadastro: lista global com filtros + edição completa
app.get('/api/reservas', authOpcional, (req, res) => {
  const filtro = filtroEfetivo(req);
  const nomes = Object.fromEntries(db.prepare('SELECT id,nome FROM cidades').all().map((c) => [c.id, c.nome]));
  let rows = db.prepare(`
    SELECT r.*, c.anunciante AS camp_anunciante, c.led_codigo, c.cidade_id FROM reservas r
    JOIN campanhas c ON c.id = r.campanha_id ORDER BY r.inicio`).all()
    .map((r) => ({
      ...r,
      anunciante: r.anunciante || r.camp_anunciante,
      cidade_id: r.cidade_id, cidade_nome: nomes[r.cidade_id] || r.cidade_id,
    }));
  if (filtro.length) rows = rows.filter((r) => filtro.includes(r.cidade_id));
  if (req.query.led) rows = rows.filter((r) => r.led_codigo === req.query.led);
  if (req.query.campanha_id) rows = rows.filter((r) => r.campanha_id === req.query.campanha_id);
  res.json(rows);
});
app.put('/api/reservas/:id', auth(), requer('reservas'), (req, res) => {
  const cur = db.prepare('SELECT * FROM reservas WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ erro: 'reserva não encontrada' });
  const camp = db.prepare('SELECT * FROM campanhas WHERE id = ?').get(cur.campanha_id);
  if (!camp) return res.status(404).json({ erro: 'campanha da reserva não encontrada' });
  if (!escopoCidadeOk(req.user, camp.cidade_id))
    return res.status(403).json({ erro: ERRO_ESCOPO });
  const nx = {
    inicio: req.body.inicio || cur.inicio,
    fim: req.body.fim || cur.fim,
    anunciante: req.body.anunciante !== undefined ? R.normalizarAnunciante(req.body.anunciante) || camp.anunciante : (cur.anunciante || camp.anunciante),
  };
  if (!R.validarDataISO(nx.inicio) || !R.validarDataISO(nx.fim))
    return res.status(400).json({ erro: 'data inválida (use AAAA-MM-DD válido)' });
  if (nx.inicio > nx.fim) return res.status(400).json({ erro: 'início posterior ao fim' });
  // rotação: sem checagem de choque (ver POST)
  db.prepare('INSERT OR IGNORE INTO anunciantes (nome) VALUES (?)').run(nx.anunciante);
  db.prepare('UPDATE reservas SET inicio = ?, fim = ?, anunciante = ? WHERE id = ?')
    .run(nx.inicio, nx.fim, nx.anunciante, req.params.id);
  log(req.user.login, 'reserva.update', `${req.params.id} (${nx.anunciante} ${nx.inicio} → ${nx.fim})`);
  res.json({ ok: true });
});

// — Programação/grade V3 §9.1 (validação anti-sobreposição) —
app.get('/api/programacoes', authOpcional, (req, res) => {
  const { led, campanha } = req.query;
  const filtro = filtroEfetivo(req);
  let sql = 'SELECT * FROM programacoes ORDER BY horario_inicio', args = [];
  if (led) { sql = 'SELECT * FROM programacoes WHERE led_codigo = ? ORDER BY horario_inicio'; args = [led]; }
  if (campanha) { sql = 'SELECT * FROM programacoes WHERE campanha_id = ? ORDER BY horario_inicio'; args = [campanha]; }
  let rows = db.prepare(sql).all(...args);
  if (filtro.length) {
    const cid = Object.fromEntries(db.prepare('SELECT codigo,cidade_id FROM leds').all().map((l) => [l.codigo, l.cidade_id]));
    rows = rows.filter((r) => filtro.includes(cid[r.led_codigo]));
  }
  res.json(rows);
});
app.post('/api/programacoes', auth(), podeEditar, (req, res) => {
  const { id, campanha_id, led_codigo, horario_inicio, duracao_segundos = 15, dias_semana = 'SEG', insercoes_dia = 1, autorizacao_admin = false, motivo_autorizacao = '' } = req.body || {};
  if (!id || !campanha_id || !led_codigo || !horario_inicio)
    return res.status(400).json({ erro: 'id, campanha_id, led_codigo, horario_inicio obrigatórios' });
  const ledCidade = cidadeDoLed(led_codigo);
  if (!ledCidade) return res.status(400).json({ erro: `LED "${led_codigo}" não cadastrado` });
  if (!escopoCidadeOk(req.user, ledCidade))
    return res.status(403).json({ erro: ERRO_ESCOPO });
  if (!R.validarHorario(horario_inicio))
    return res.status(400).json({ erro: 'horário inválido (use HH:MM de 00:00 a 23:59)' });
  if (!Number.isFinite(Number(duracao_segundos)) || Number(duracao_segundos) <= 0)
    return res.status(400).json({ erro: 'duracao_segundos deve ser > 0' });
  if (!Number.isFinite(Number(insercoes_dia)) || Number(insercoes_dia) < 1)
    return res.status(400).json({ erro: 'insercoes_dia deve ser >= 1' });
  const existentes = db.prepare('SELECT * FROM programacoes WHERE led_codigo = ?').all(led_codigo);
  const choque = R.acharChoqueGrade(existentes, { horario_inicio, duracao_segundos: Number(duracao_segundos), dias_semana });
  if (choque) {
    const eIni = choque.horario_inicio;
    const detalhe = `sobreposição: ${led_codigo} ${dias_semana} ${horario_inicio} conflita com "${choque.campanha_id}" às ${eIni} (${choque.duracao_segundos}s)`;
    const ehAdmin = req.user?.perfil === 'admin';
    if (!ehAdmin)
      return res.status(403).json({ erro: detalhe + ' — sobreposição exige autorização de um usuário admin.', choque, requer_autorizacao_admin: true });
    if (autorizacao_admin !== true)
      return res.status(409).json({ erro: detalhe + ' — confirme com autorizacao_admin:true e motivo (somente admin).', choque, requer_autorizacao_admin: true });
    db.prepare('INSERT INTO programacoes (id,campanha_id,led_codigo,horario_inicio,duracao_segundos,dias_semana,insercoes_dia,autorizado_por,motivo_autorizacao) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, campanha_id, led_codigo, horario_inicio, Number(duracao_segundos), dias_semana, insercoes_dia, req.user.login, String(motivo_autorizacao || ''));
    log(req.user.login, 'programacao.create.autorizada', `${id} sobre ${choque.id} (${choque.campanha_id}@${eIni}) motivo=${motivo_autorizacao || '-'}`);
    return res.status(201).json({ ok: true, id, autorizada_por: req.user.login });
  }
  db.prepare('INSERT INTO programacoes (id,campanha_id,led_codigo,horario_inicio,duracao_segundos,dias_semana,insercoes_dia) VALUES (?,?,?,?,?,?,?)')
    .run(id, campanha_id, led_codigo, horario_inicio, Number(duracao_segundos), dias_semana, insercoes_dia);
  log(req.user.login, 'programacao.create', id);
  res.status(201).json({ ok: true, id });
});

// — Dashboard consolidado (§8.2: 4 KPIs + rosca + linha + barras + gantt) —
app.get('/api/dashboard', authOpcional, (req, res) => {
  const cfg = R.getConfig(db);
  const filtro = filtroEfetivo(req);
  const escopo = (c) => filtro.length === 0 || filtro.includes(c.cidade_id);
  const camps = db.prepare('SELECT * FROM campanhas').all().filter(escopo);
  const totalLeds = db.prepare('SELECT COUNT(*) v FROM leds').get().v;
  const leds = db.prepare('SELECT * FROM leds').all().filter((l) => filtro.length === 0 || filtro.includes(l.cidade_id));
  const comSt = camps.map((c) => ({ ...c, status: R.statusCampanha(c, cfg) }));
  const { ini: P_INI, fim: P_FIM, rotulo: PERIODO } = R.periodoReferencia(R.hojeISO());
  const porLed = leds.map((l) => R.ocupacao(camps.filter((c) => c.led_codigo === l.codigo), P_INI, P_FIM));
  const ocupMedia = porLed.length ? +(porLed.reduce((a, b) => a + b, 0) / porLed.length).toFixed(1) : 0;
  const aVencer = comSt.filter((c) => { const d = R.diasEntre(c.fim, R.hojeISO()); return d >= 0 && d <= 7 && c.inicio <= R.hojeISO(); }).length;
  const comCampanha = new Set(comSt.filter((c) => c.status !== 'vencida').map((c) => c.led_codigo));
  const livres = Math.max(0, leds.length - comCampanha.size);
  // Rosca real: campanhas veiculando vs. reservadas + LEDs livres (era fixa 55/25/20)
  const nVeic = comSt.filter((c) => ['veiculando', 'a_vencer'].includes(c.status)).length;
  const nRes = comSt.filter((c) => ['agendada', 'reservada'].includes(c.status)).length;
  const totDist = Math.max(1, nVeic + nRes + livres);
  const pct = (n) => Math.round((n / totDist) * 100);
  const distV = [{ name: 'Veiculando', value: pct(nVeic), color: '#2dd4bf' },
    { name: 'Reservada', value: pct(nRes), color: '#8b7cf6' },
    { name: 'Livre', value: 0, color: '#3a4468' }];
  distV[2].value = Math.max(0, 100 - distV[0].value - distV[1].value);
  const cidades = db.prepare('SELECT * FROM cidades').all()
    .filter((c) => filtro.length === 0 || filtro.includes(c.id));
  res.json({
    hoje: R.hojeISO(), periodo: PERIODO,
    kpis: { ocupacao_media: ocupMedia, leds_ativos: `${leds.length}/${totalLeds}`, a_vencer_7d: aVencer, livres },
    distribuicao: distV,
    evolucao_mensal: R.ultimos6Meses(R.hojeISO()).map(({ mes, ini, fim }) => {
      const vals = leds.map((l) => R.ocupacao(camps.filter((c) => c.led_codigo === l.codigo), ini, fim));
      return { mes, ocupacao: vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : 0 };
    }),
    ocupacao_por_cidade: cidades.map((c) => {
      const ledsC = leds.filter((l) => l.cidade_id === c.id);
      const vals = ledsC.map((l) => R.ocupacao(camps.filter((cc) => cc.led_codigo === l.codigo), P_INI, P_FIM));
      const media = vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : 0;
      return { cidade: c.nome.toUpperCase(), id: c.id, valor: media };
    }),
    gantt_por_led: leds.map((l) => ({
      ...l,
      espacos_usados: new Set(comSt.filter((c) => c.led_codigo === l.codigo && c.fim >= R.hojeISO()).map((c) => c.anunciante)).size,
      espacos_total: cfg.max_clientes_por_led,
      campanhas: comSt.filter((c) => c.led_codigo === l.codigo).map((c) => ({
        ...c, reservas: reservasDaCampanha(c.id, c.anunciante),
      })),
    })),
    a_vencer_lista: comSt
      .filter((c) => c.status === 'a_vencer')
      .map((c) => ({ anunciante: c.anunciante, led: c.led_codigo, status: 'A vencer' }))
      .slice(0, 10),
    a_iniciar_lista: [
      ...comSt
        .filter((c) => c.status === 'agendada')
        .map((c) => ({ anunciante: c.anunciante, led: c.led_codigo, status: 'Agendada' })),
      ...comSt.flatMap((c) =>
        reservasDaCampanha(c.id, c.anunciante)
          .filter((r) => { const d = R.diasEntre(r.inicio, R.hojeISO()); return d >= 0 && d <= cfg.n_inicio_proximo; })
          .map((r) => ({ anunciante: `${r.anunciante} (reserva)`, led: c.led_codigo, status: 'Agendada' }))),
    ].slice(0, 10),
  });
});

// — Planilha §4.4 (linhas Cidade,LED,Anunciante,Início,Fim,Status) —
function linhasPlanilha(filtro, status, q) {
  const cfg = R.getConfig(db);
  const nomes = Object.fromEntries(db.prepare('SELECT id,nome FROM cidades').all().map((c) => [c.id, c.nome]));
  let rows = db.prepare('SELECT * FROM campanhas ORDER BY inicio').all()
    .filter((c) => filtro.length === 0 || filtro.includes(c.cidade_id))
    .map((c) => ({
      id: c.id, cidade: nomes[c.cidade_id] || c.cidade_id, led: c.led_codigo, anunciante: c.anunciante,
      inicio: c.inicio, fim: c.fim, status: R.statusCampanha(c, cfg),
    }));
  if (status) rows = rows.filter((r) => r.status === status);
  if (q) { const s = String(q).toLowerCase(); rows = rows.filter((r) => [r.cidade, r.led, r.anunciante].join(' ').toLowerCase().includes(s)); }
  return rows;
}
app.get('/api/planilha', authOpcional, (req, res) => {
  res.json(linhasPlanilha(filtroEfetivo(req), req.query.status, req.query.q));
});

// — Exportação §8.3 (exporta exatamente a view atual: mesmos filtros da planilha) —
app.get('/api/export/planilha.csv', authOpcional, requer('exportar'), (req, res) => {
  const dados = linhasPlanilha(filtroEfetivo(req), req.query.status, req.query.q);
  const csv = 'Cidade;LED;Anunciante;Início;Fim;Status\n' +
    dados.map((c) => `${c.cidade};${c.led};${c.anunciante};${c.inicio};${c.fim};${c.status}`).join('\n');
  res.header('Content-Type', 'text/csv; charset=utf-8').attachment('controle-de-leds.csv').send('﻿' + csv);
});
app.get('/api/export/planilha.xlsx', authOpcional, requer('exportar'), (req, res) => {
  const ws = XLSX.utils.json_to_sheet(linhasPlanilha(filtroEfetivo(req), req.query.status, req.query.q).map((c) => ({
    Cidade: c.cidade, LED: c.led, Anunciante: c.anunciante, Início: c.inicio, Fim: c.fim, Status: c.status,
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Veiculação');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .attachment('controle-de-leds.xlsx').send(buf);
});

// — Importação de planilha (mesmo padrão da exportação: Cidade;LED;Anunciante;Início;Fim) —

// — Notificações §4.1 (polling + central + varredura) —
function parseCSVLine(line, delim) {
  const out = [];
  let cur = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}
const MESES_PT = { jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06', jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12' };
function normalizarData(s) {
  s = String(s || '').trim().replace(/^\uFEFF/, '').replace(/\s+/g, '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return R.validarDataISO(s) ? s : null;
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = String(Number(y) <= 49 ? 2000 + Number(y) : 1900 + Number(y));
    const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return R.validarDataISO(iso) ? iso : null;
  }
  // dia/mês por extenso: 27/nov. · 02/out · 01/set. · 14/ago.
  m = s.match(/^(\d{1,2})\/([a-z]{3,9})\.?(?:\/(\d{2}|\d{4}))?$/i);
  if (m) {
    const mo = MESES_PT[m[2].slice(0, 3).toLowerCase()];
    if (!mo) return null;
    const y = m[3] ? (m[3].length === 2 ? String(Number(m[3]) <= 49 ? 2000 + Number(m[3]) : 1900 + Number(m[3])) : m[3]) : String(new Date().getFullYear());
    const iso = `${y}-${mo}-${String(m[1]).padStart(2, '0')}`;
    return R.validarDataISO(iso) ? iso : null;
  }
  return null;
}
const normKey = (s) => String(s || '').trim().toLowerCase();
app.get('/api/import/modelo.csv', (req, res) => {
  const modelo = 'Cidade;LED;Anunciante;Início;Fim;Reservada;Reserva1_Anunciante;Reserva1_Início;Reserva1_Fim;Reserva2_Anunciante;Reserva2_Início;Reserva2_Fim;Reserva3_Anunciante;Reserva3_Início;Reserva3_Fim\n' +
    'Aracaju;AJU 01;Exemplo S.A.;01/12/26;31/01/27;0;Parceiro S.A.;01/03/27;31/03/27;;;;;;\n' +
    'Aracaju;AJU 02;Outro Anunciante;2026-12-01;2027-01-31;1;;;;;;;;;\n';
  res.header('Content-Type', 'text/csv; charset=utf-8').attachment('modelo-importacao.csv').send('﻿' + modelo);
});
app.post('/api/import/planilha', auth(), requer('importar'), (req, res) => {
  const { csv } = req.body || {};
  if (!csv || typeof csv !== 'string') return res.status(400).json({ erro: 'envie {csv: "..."} no padrão Cidade;LED;Anunciante;Início;Fim' });
  const linhas = String(csv).replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (linhas.length < 2) return res.status(400).json({ erro: 'planilha vazia (só cabeçalho ou nada)' });
  const delim = (linhas[0].match(/;/g) || []).length >= (linhas[0].match(/,/g) || []).length ? ';' : ',';
  // chaves sem acento/separadores: "Reserva1_Início" e "reserva 1 - inicio" viram "reserva1inicio"
  const chave = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const head = parseCSVLine(linhas[0], delim).map(chave);
  const idx = (names) => head.findIndex((h) => names.includes(h));
  const iCid = idx(['cidade']), iLed = idx(['led', 'painel']), iAnu = idx(['anunciante', 'cliente']), iIni = idx(['inicio']), iFim = idx(['fim']);
  if ([iCid, iLed, iAnu, iIni, iFim].some((i) => i < 0))
    return res.status(400).json({ erro: 'cabeçalho fora do padrão — use: Cidade;LED;Anunciante;Início;Fim[;Reservada][;ReservaN_Anunciante;ReservaN_Início;ReservaN_Fim…]' });
  const iRes = idx(['reservada', 'reserva']);
  // pares ReservaN_[Anunciante_]Início/ReservaN_Fim (N = 1, 2, 3…): múltiplas
  // reservas por linha, cada uma com seu anunciante (vazio = o da linha)
  const paresReserva = [];
  head.forEach((h, i) => {
    const m = h.match(/^reserva(\d+)inicio$/);
    if (!m) return;
    const j = head.findIndex((x) => x === `reserva${m[1]}fim`);
    if (j < 0) return;
    const a = head.findIndex((x) => x === `reserva${m[1]}anunciante`);
    paresReserva.push({ k: m[1], i, j, a });
  });
  const cidades = db.prepare('SELECT * FROM cidades').all();
  const semAcentoLower = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const porNome = Object.fromEntries(cidades.map((c) => [semAcentoLower(c.nome), c.id]));
  const porId = Object.fromEntries(cidades.map((c) => [semAcentoLower(c.id), c.id]));
  const ledsTodos = db.prepare('SELECT * FROM leds').all();
  const porLed = Object.fromEntries(ledsTodos.map((l) => [semAcentoLower(l.codigo).replace(/\s+/g, ' '), l]));
  const cfg = R.getConfig(db), hoje = R.hojeISO();
  const criadas = [], ignoradas = [];
  let reservasCriadas = 0, anosAjustados = 0;
  // ano seguinte: "01/09/2026 → 28/02/2026" só faz sentido como 28/02/2027
  const rolarAnoFim = (ini, f) => {
    if (ini && f && f < ini) {
      const f2 = `${Number(f.slice(0, 4)) + 1}${f.slice(4)}`;
      if (R.validarDataISO(f2)) { anosAjustados++; return f2; }
    }
    return f;
  };
  linhas.slice(1).forEach((line, k) => {
    const nLinha = k + 2, col = parseCSVLine(line, delim);
    const rot = { linha: nLinha, anunciante: col[iAnu] || '' };
    const cidadeId = porId[semAcentoLower(col[iCid])] || porNome[semAcentoLower(col[iCid])];
    if (!cidadeId) return ignoradas.push({ ...rot, motivo: `cidade "${col[iCid]}" não cadastrada` });
    const ledBruto = String(col[iLed] || '').trim();
    const ledRow = porLed[semAcentoLower(ledBruto).replace(/\s+/g, ' ')];
    if (!ledRow)
      return ignoradas.push({ ...rot, motivo: `LED "${ledBruto}" não cadastrado` });
    const led = ledRow.codigo;
    if (ledRow.cidade_id !== cidadeId)
      return ignoradas.push({ ...rot, motivo: `LED ${led} não é da cidade informada` });
    if (!escopoCidadeOk(req.user, cidadeId))
      return ignoradas.push({ ...rot, motivo: 'fora do seu escopo de cidades' });
    const anunciante = R.normalizarAnunciante(col[iAnu]);
    const rawIni = col[iIni] || '', rawFim = col[iFim] || '';
    let inicio = normalizarData(rawIni), fim = normalizarData(rawFim);
    if ((!inicio && rawIni) || (!fim && rawFim))
      return ignoradas.push({ ...rot, motivo: `data inválida ("${rawIni}" → "${rawFim}")` });
    if (!inicio && fim) inicio = fim; // só um lado preenchido = diária única
    if (inicio && !fim) fim = inicio;
    // pares de reserva válidos (para o fluxo normal e para o fallback reserva-only)
    const candidatas = [];
    for (const p of paresReserva) {
      const rawI = col[p.i] || '', rawF = col[p.j] || '';
      if (!rawI && !rawF) continue;
      const anuRes = R.normalizarAnunciante(p.a >= 0 ? col[p.a] || '' : '') || anunciante;
      const tag = `linha ${nLinha} reserva ${p.k} (${anuRes || '?'})`;
      // só um lado preenchido = diária única; lado inválido = erro
      let rIni = normalizarData(rawI), rFim = normalizarData(rawF);
      if ((!rIni && rawI) || (!rFim && rawF)) { ignoradas.push({ ...rot, motivo: `${tag}: data inválida ("${rawI}" → "${rawF}")` }); continue; }
      if (!rIni && rFim) rIni = rFim;
      if (rIni && !rFim) rFim = rIni;
      if (!rIni || !rFim) { ignoradas.push({ ...rot, motivo: `${tag}: data inválida ("${rawI}" → "${rawF}")` }); continue; }
      if (rIni > rFim) rFim = rolarAnoFim(rIni, rFim);
      if (rIni > rFim) { ignoradas.push({ ...rot, motivo: `${tag}: início posterior ao fim` }); continue; }
      candidatas.push({ anuRes, rIni, rFim, tag });
    }
    // helper local: cria campanha com checagens de duplicada e lotação
    const tentarCriar = (anunc, ini, fimm, reservadaFlag) => {
      if (db.prepare('SELECT * FROM campanhas WHERE led_codigo = ? AND anunciante = ? AND inicio = ?').get(led, anunc, ini))
        return { erro: 'já existe (mesmo LED/anunciante/início)' };
      const usados = R.espacosUsados(db, led, hoje);
      if (!usados.includes(anunc) && usados.length >= cfg.max_clientes_por_led)
        return { erro: `LED ${led} lotado (${usados.length}/${cfg.max_clientes_por_led})` };
      const id = `imp-${Date.now()}-${k}`;
      db.prepare('INSERT OR IGNORE INTO anunciantes (nome) VALUES (?)').run(anunc);
      db.prepare('INSERT INTO campanhas (id,cidade_id,led_codigo,anunciante,inicio,fim,reservada) VALUES (?,?,?,?,?,?,?)')
        .run(id, cidadeId, led, anunc, ini, fimm, reservadaFlag ? 1 : 0);
      criadas.push(id);
      return { id };
    };
    const gravarReserva = (campId, anuRes, rIni, rFim) => {
      const rid = `imp-r-${Date.now()}-${k}-${reservasCriadas}`;
      db.prepare('INSERT OR IGNORE INTO anunciantes (nome) VALUES (?)').run(anuRes);
      db.prepare('INSERT INTO reservas (id,campanha_id,inicio,fim,anunciante,criada_por) VALUES (?,?,?,?,?,?)')
        .run(rid, campId, rIni, rFim, anuRes, req.user.login);
      reservasCriadas++;
    };
    const checarReserva = (campId, feitas, cd, anuDefault) => {
      const anu = cd.anuRes || anuDefault;
      if (feitas.some((f) => f.inicio === cd.rIni && f.fim === cd.rFim && f.anu === anu)) { ignoradas.push({ ...rot, motivo: `${cd.tag}: reserva duplicada na linha` }); return; }
      gravarReserva(campId, anu, cd.rIni, cd.rFim);
      feitas.push({ inicio: cd.rIni, fim: cd.rFim, anu });
    };
    if (!inicio || !fim) {
      // sem datas de campanha: a 1ª reserva válida vira campanha reservada
      if (!anunciante && !candidatas.length)
        return ignoradas.push({ ...rot, motivo: 'linha vazia ou sem datas' });
      if (!candidatas.length)
        return ignoradas.push({ ...rot, motivo: `data inválida ("${col[iIni]}" → "${col[iFim]}")` });
      const primeira = candidatas[0];
      const anuCamp = anunciante || primeira.anuRes;
      if (!anuCamp) return ignoradas.push({ ...rot, motivo: 'anunciante vazio' });
      const rc = tentarCriar(anuCamp, primeira.rIni, primeira.rFim, true);
      if (rc.erro) return ignoradas.push({ ...rot, motivo: rc.erro });
      ignoradas.push({ ...rot, motivo: `sem datas de campanha — criada como reservada de ${primeira.rIni} → ${primeira.rFim}`, aviso: true });
      const feitas = [{ inicio: primeira.rIni, fim: primeira.rFim, anu: primeira.anuRes || anuCamp }];
      candidatas.slice(1).forEach((cd) => checarReserva(rc.id, feitas, cd, anuCamp));
      return;
    }
    if (inicio > fim) {
      const rolado = rolarAnoFim(inicio, fim);
      if (rolado === fim) return ignoradas.push({ ...rot, motivo: 'início posterior ao fim' });
      fim = rolado;
    }
    if (!anunciante) return ignoradas.push({ ...rot, motivo: 'anunciante vazio' });
    const reservada = iRes >= 0 ? ['1', 'sim', 's', 'verdadeiro', 'true'].includes(normKey(col[iRes])) : false;
    const rc = tentarCriar(anunciante, inicio, fim, reservada);
    if (rc.erro) return ignoradas.push({ ...rot, motivo: rc.erro });
    const feitas = [];
    for (const cd of candidatas) {
      const rFimRolado = rolarAnoFim(cd.rIni, cd.rFim);
      checarReserva(rc.id, feitas, rFimRolado === cd.rFim ? cd : { ...cd, rFim: rFimRolado }, anunciante);
    }
  });
  log(req.user.login, 'planilha.import', `criadas=${criadas.length} reservas=${reservasCriadas} anos_ajustados=${anosAjustados} ignoradas=${ignoradas.length}`);
  res.json({ total: linhas.length - 1, criadas: criadas.length, reservas_criadas: reservasCriadas, anos_ajustados: anosAjustados, ignoradas, ids: criadas });
});
app.get('/api/notificacoes', authOpcional, (req, res) => {
  const filtro = filtroEfetivo(req);
  let rows = db.prepare('SELECT * FROM notificacoes ORDER BY criada_em DESC LIMIT 50').all();
  if (filtro.length) rows = rows.filter((n) => !n.cidade_id || filtro.includes(n.cidade_id));
  // Enriquece para o "Ver campanha": anunciante, LED e id real da campanha
  const porId = Object.fromEntries(db.prepare('SELECT * FROM campanhas').all().map((c) => [c.id, c]));
  const resDe = (rid) => db.prepare(`
    SELECT r.*, c.anunciante AS camp_anunciante, c.led_codigo, c.id AS camp_id, c.cidade_id FROM reservas r
    JOIN campanhas c ON c.id = r.campanha_id WHERE r.id = ?`).get(rid);
  res.json(rows.map((n) => {
    let anunciante, led, ref;
    const camp = porId[n.campanha_id];
    if (camp) ({ anunciante, led_codigo: led, id: ref } = camp);
    else {
      const r = resDe(n.campanha_id);
      if (r) { anunciante = r.anunciante || r.camp_anunciante; led = r.led_codigo; ref = r.camp_id; }
      else {
        const m = /^grupo:(ini|venc|res):(.*):(\d{4}-\d{2}-\d{2})$/.exec(n.campanha_id);
        if (m) {
          anunciante = m[2];
          const alvo = db.prepare('SELECT * FROM campanhas WHERE anunciante = ? AND inicio = ? LIMIT 1').get(m[2], m[3])
            || db.prepare(`SELECT c.* FROM reservas r JOIN campanhas c ON c.id = r.campanha_id
                WHERE r.inicio = ? AND (r.anunciante = ? OR (r.anunciante = '' AND c.anunciante = ?)) LIMIT 1`).get(m[3], m[2], m[2]);
          if (alvo) { led = alvo.led_codigo; ref = alvo.id; }
        }
      }
    }
    return {
      id: n.id, titulo: n.titulo, corpo: n.corpo, lida: !!n.lida, evento: n.evento,
      campanha_id: n.campanha_id, cidade_id: n.cidade_id || undefined,
      anunciante, led, campanha_ref: ref,
    };
  }));
});
app.post('/api/notificacoes/varredura', auth(), (req, res) => {
  const r = R.varreduraNotificacoes(db);
  log(req.user?.login || 'job', 'notificacoes.varredura', JSON.stringify(r));
  res.json(r);
});
app.patch('/api/notificacoes/:id/lida', auth(), (req, res) => {
  db.prepare('UPDATE notificacoes SET lida = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// — Usuários: quem vê o quê (cidades vinculadas + recursos extras) —
function detalheUsuario(login) {
  const u = db.prepare('SELECT login,perfil,nome FROM usuarios WHERE login = ?').get(login);
  if (!u) return null;
  u.cidades = db.prepare('SELECT cidade_id FROM usuario_cidade WHERE login = ?').all(login).map((r) => r.cidade_id);
  u.permissoes = db.prepare('SELECT recurso FROM permissoes WHERE login = ?').all(login).map((r) => r.recurso);
  u.efetivas = permissoesEfetivas(login, u.perfil);
  return u;
}
const IDS_RECURSOS = RECURSOS.map((r) => r.id);
app.get('/api/recursos', auth(), (req, res) => res.json(RECURSOS));
app.get('/api/me', auth(), (req, res) => res.json(detalheUsuario(req.user.login)));
app.get('/api/usuarios', auth(), requer('usuarios'), (req, res) =>
  res.json(db.prepare('SELECT login FROM usuarios ORDER BY login').all().map((r) => detalheUsuario(r.login))));
app.post('/api/usuarios', auth(), requer('usuarios'), (req, res) => {
  const { login, senha, perfil = 'visualizador', nome = '', cidades = [], permissoes = [] } = req.body || {};
  if (!login || !senha) return res.status(400).json({ erro: 'login e senha obrigatórios' });
  if (!PERFIL_DEFAULT[perfil]) return res.status(400).json({ erro: `perfil inválido (use ${Object.keys(PERFIL_DEFAULT).join('/')})` });
  for (const c of cidades)
    if (!db.prepare('SELECT * FROM cidades WHERE id = ?').get(c))
      return res.status(400).json({ erro: `cidade "${c}" não cadastrada` });
  const recs = [...new Set(permissoes)].filter((r) => IDS_RECURSOS.includes(r));
  try {
    db.prepare('INSERT INTO usuarios (login,senha,perfil,nome) VALUES (?,?,?,?)').run(login, senha, perfil, nome);
  } catch { return res.status(409).json({ erro: `login "${login}" já existe` }); }
  const li = db.prepare('INSERT OR IGNORE INTO usuario_cidade (login,cidade_id) VALUES (?,?)');
  for (const c of new Set(cidades)) li.run(login, c);
  const pi = db.prepare('INSERT OR IGNORE INTO permissoes (login,recurso) VALUES (?,?)');
  for (const r of recs) pi.run(login, r);
  log(req.user.login, 'usuario.create', `${login} (${perfil})`);
  res.status(201).json(detalheUsuario(login));
});
app.put('/api/usuarios/:login', auth(), requer('usuarios'), (req, res) => {
  const cur = db.prepare('SELECT * FROM usuarios WHERE login = ?').get(req.params.login);
  if (!cur) return res.status(404).json({ erro: 'usuário não encontrado' });
  const { senha, perfil = cur.perfil, nome = cur.nome, cidades, permissoes } = req.body || {};
  if (!PERFIL_DEFAULT[perfil]) return res.status(400).json({ erro: 'perfil inválido' });
  if (cur.perfil === 'admin' && perfil !== 'admin' &&
      db.prepare("SELECT COUNT(*) v FROM usuarios WHERE perfil = 'admin'").get().v <= 1)
    return res.status(409).json({ erro: 'não é possível rebaixar o último admin' });
  db.prepare('UPDATE usuarios SET senha = COALESCE(?,senha), perfil = ?, nome = ? WHERE login = ?')
    .run(senha || null, perfil, nome, req.params.login);
  if (Array.isArray(cidades)) {
    for (const c of cidades)
      if (!db.prepare('SELECT * FROM cidades WHERE id = ?').get(c))
        return res.status(400).json({ erro: `cidade "${c}" não cadastrada` });
    db.prepare('DELETE FROM usuario_cidade WHERE login = ?').run(req.params.login);
    const li = db.prepare('INSERT INTO usuario_cidade (login,cidade_id) VALUES (?,?)');
    for (const c of new Set(cidades)) li.run(req.params.login, c);
  }
  if (Array.isArray(permissoes)) {
    db.prepare('DELETE FROM permissoes WHERE login = ?').run(req.params.login);
    const pi = db.prepare('INSERT INTO permissoes (login,recurso) VALUES (?,?)');
    for (const r of new Set(permissoes)) if (IDS_RECURSOS.includes(r)) pi.run(req.params.login, r);
  }
  log(req.user.login, 'usuario.update', req.params.login);
  res.json(detalheUsuario(req.params.login));
});
app.delete('/api/usuarios/:login', auth(), requer('usuarios'), (req, res) => {
  const cur = db.prepare('SELECT * FROM usuarios WHERE login = ?').get(req.params.login);
  if (!cur) return res.status(404).json({ erro: 'usuário não encontrado' });
  if (req.params.login === req.user.login) return res.status(409).json({ erro: 'não é possível excluir o próprio login' });
  if (cur.perfil === 'admin' && db.prepare("SELECT COUNT(*) v FROM usuarios WHERE perfil = 'admin'").get().v <= 1)
    return res.status(409).json({ erro: 'não é possível excluir o último admin' });
  db.prepare('DELETE FROM usuarios WHERE login = ?').run(req.params.login);
  log(req.user.login, 'usuario.delete', req.params.login);
  res.json({ ok: true });
});

// — Auditoria §9.2 —
app.get('/api/auditoria', auth(), soAdmin, (req, res) =>
  res.json(db.prepare('SELECT * FROM auditoria ORDER BY id DESC LIMIT 100').all()));

app.get('/api/health', (req, res) => res.json({ ok: true, hoje: R.hojeISO() }));

// Job diário: poda de órfãs + varredura automática (a cada 24h; +1 execução no boot)
setInterval(() => { try { R.podarNotificacoesOrfas(db); R.varreduraNotificacoes(db); } catch {} }, 24 * 3600 * 1000);
try {
  const podadas = R.podarNotificacoesOrfas(db);
  if (podadas) console.log(`notificações órfãs removidas: ${podadas}`);
  R.varreduraNotificacoes(db);
} catch {}

if (require.main === module)
  app.listen(PORT, () => console.log(`LED Control API on http://localhost:${PORT} (hoje=${R.hojeISO()})`));
module.exports = app;
