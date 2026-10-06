// Modelo relacional — spec §2 + §9 (CIDADE, LED, ANUNCIANTE, CAMPANHA,
// PROGRAMACAO, USUARIO, PERFIL, USUARIO_CIDADE, NOTIFICACAO, AUDITORIA, CONFIG).
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(process.env.DB_PATH || path.join(__dirname, '..', 'data.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  n_inicio_proximo INTEGER NOT NULL DEFAULT 7,
  n_vencimento_proximo INTEGER NOT NULL DEFAULT 5,
  max_clientes_por_led INTEGER NOT NULL DEFAULT 8,
  logo_dataurl TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS cidades (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL, uf TEXT NOT NULL DEFAULT '', fuso TEXT NOT NULL DEFAULT 'America/Maceio'
);
CREATE TABLE IF NOT EXISTS leds (
  codigo TEXT PRIMARY KEY, endereco TEXT NOT NULL, cidade_id TEXT NOT NULL REFERENCES cidades(id)
);
CREATE TABLE IF NOT EXISTS anunciantes ( nome TEXT PRIMARY KEY );
CREATE TABLE IF NOT EXISTS campanhas (
  id TEXT PRIMARY KEY, cidade_id TEXT NOT NULL REFERENCES cidades(id),
  led_codigo TEXT NOT NULL REFERENCES leds(codigo), anunciante TEXT NOT NULL REFERENCES anunciantes(nome),
  inicio TEXT NOT NULL, fim TEXT NOT NULL, reservada INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS programacoes (
  id TEXT PRIMARY KEY, campanha_id TEXT NOT NULL REFERENCES campanhas(id) ON DELETE CASCADE,
  led_codigo TEXT NOT NULL, horario_inicio TEXT NOT NULL, duracao_segundos INTEGER NOT NULL DEFAULT 15,
  dias_semana TEXT NOT NULL DEFAULT 'SEG', insercoes_dia INTEGER NOT NULL DEFAULT 1,
  autorizado_por TEXT, motivo_autorizacao TEXT
);
CREATE TABLE IF NOT EXISTS usuarios (
  login TEXT PRIMARY KEY, senha TEXT NOT NULL, perfil TEXT NOT NULL DEFAULT 'visualizador', nome TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS usuario_cidade (
  login TEXT NOT NULL REFERENCES usuarios(login) ON DELETE CASCADE,
  cidade_id TEXT NOT NULL REFERENCES cidades(id) ON DELETE CASCADE,
  PRIMARY KEY (login, cidade_id)
);
CREATE TABLE IF NOT EXISTS permissoes (
  login TEXT NOT NULL REFERENCES usuarios(login) ON DELETE CASCADE,
  recurso TEXT NOT NULL,
  PRIMARY KEY (login, recurso)
);
CREATE TABLE IF NOT EXISTS tema (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  vars TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS reservas (
  id TEXT PRIMARY KEY, campanha_id TEXT NOT NULL REFERENCES campanhas(id) ON DELETE CASCADE,
  inicio TEXT NOT NULL, fim TEXT NOT NULL, anunciante TEXT NOT NULL DEFAULT '',
  criada_por TEXT NOT NULL DEFAULT '', criada_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS notificacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, campanha_id TEXT NOT NULL, evento TEXT NOT NULL,
  titulo TEXT NOT NULL, corpo TEXT NOT NULL, dia TEXT NOT NULL, lida INTEGER NOT NULL DEFAULT 0,
  cidade_id TEXT NOT NULL DEFAULT '',
  criada_em TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (campanha_id, evento, dia)
);
CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT, quando TEXT NOT NULL DEFAULT (datetime('now')),
  quem TEXT NOT NULL DEFAULT 'anon', oque TEXT NOT NULL, detalhe TEXT NOT NULL DEFAULT ''
);
`);

function seed() {
  const n = db.prepare('SELECT COUNT(*) v FROM cidades').get().v;
  db.prepare("INSERT OR IGNORE INTO config (id) VALUES (1)").run();
  if (n > 0) return;
  const ins = (sql, rows) => { const s = db.prepare(sql); for (const r of rows) s.run(...r); };
  ins('INSERT OR IGNORE INTO cidades (id,nome,uf) VALUES (?,?,?)', [
    ['aracaju', 'Aracaju', 'SE'],
    ['salvador', 'Salvador', 'BA'],
  ]);
  ins('INSERT OR IGNORE INTO leds (codigo,endereco,cidade_id) VALUES (?,?,?)', [
    ['AJU 01', 'Silvio Teixeira', 'aracaju'],
    ['AJU 02', 'Tancredo Neves', 'aracaju'],
    ['AJU 03', 'Adélia Franco', 'aracaju'],
    ['AJU 04', 'Francisco Porto', 'aracaju'],
  ]);
  ins('INSERT OR IGNORE INTO anunciantes (nome) VALUES (?)', [
    ['Atakarejo'], ['Vita'], ['Diniz Fonseca'], ['Jardins Delicatessen'],
    ['Boticário'], ['Hospital dos Olhos'], ['Rede Primavera'], ['São Braz'],
  ]);
  ins('INSERT OR IGNORE INTO campanhas (id,cidade_id,led_codigo,anunciante,inicio,fim,reservada) VALUES (?,?,?,?,?,?,?)', [
    ['c1', 'aracaju', 'AJU 01', 'Atakarejo', '2026-02-10', '2027-04-09', 0],
    ['c2', 'aracaju', 'AJU 01', 'Boticário', '2026-11-14', '2026-11-28', 1],
    ['c3', 'aracaju', 'AJU 02', 'Vita', '2026-08-01', '2026-12-20', 0],
    ['c4', 'aracaju', 'AJU 02', 'Diniz Fonseca', '2026-06-15', '2026-09-30', 0],
    ['c5', 'aracaju', 'AJU 03', 'Jardins Delicatessen', '2026-09-01', '2027-01-31', 0],
    ['c6', 'aracaju', 'AJU 03', 'Hospital dos Olhos', '2026-10-20', '2026-10-31', 0],
    ['c7', 'aracaju', 'AJU 04', 'São Braz', '2026-07-10', '2026-12-10', 0],
    ['c8', 'aracaju', 'AJU 04', 'Rede Primavera', '2026-10-27', '2026-11-14', 1],
  ]);
  ins("INSERT OR IGNORE INTO programacoes (id,campanha_id,led_codigo,horario_inicio,duracao_segundos,dias_semana,insercoes_dia) VALUES (?,?,?,?,?,?,?)", [
    ['s1', 'c1', 'AJU 01', '07:00', 15, 'SEG', 1],
    ['s2', 'c3', 'AJU 01', '07:15', 15, 'SEG', 1],
    ['s3', 'c4', 'AJU 01', '07:30', 10, 'SEG', 1],
  ]);
  ins('INSERT OR IGNORE INTO usuarios (login,senha,perfil,nome) VALUES (?,?,?,?)', [
    ['admin', 'admin123', 'admin', 'Administrador'],
    ['regional', 'reg123', 'regional', 'Gestor Regional'],
    ['operador', 'op123', 'operador', 'Operador'],
    ['viewer', 'view123', 'visualizador', 'Visualizador'],
  ]);
  ins('INSERT OR IGNORE INTO usuario_cidade (login,cidade_id) VALUES (?,?)', [['regional', 'aracaju']]);
  // Exemplo de múltiplas reservas: Jardins (c5) tem 1 reserva futura além do período atual
  ins('INSERT OR IGNORE INTO reservas (id,campanha_id,inicio,fim,anunciante,criada_por) VALUES (?,?,?,?,?,?)', [
    ['r1', 'c5', '2027-02-01', '2027-02-28', 'Jardins Delicatessen', 'admin'],
  ]);
}

// Seed opt-in: na implantação o banco nasce VAZIO (não populado).
// SEED=true popula com o dataset demo (inclui o admin).
// Admin de resgate: garantido na criação do banco SEMPRE que não houver nenhum
// usuário — banco novo, limpezas ou SEED parcial (cidades sem usuários). Sem ele
// o login seria impossível, pois criar usuário exige estar logado.
// A linha de config (limites padrão) sempre existe, com ou sem seed.
db.prepare('INSERT OR IGNORE INTO config (id) VALUES (1)').run();
if (process.env.SEED === 'true' || process.env.SEED === '1') {
  seed();
}
if (db.prepare('SELECT COUNT(*) v FROM usuarios').get().v === 0) {
  db.prepare("INSERT INTO usuarios (login,senha,perfil,nome) VALUES ('admin','admin123','admin','Administrador')").run();
  console.log('admin de resgate criado (admin/admin123 — troque a senha)');
}

// Seed aditivo: garante a reserva-exemplo mesmo em bancos criados antes dela
// (só com seed ligado; sem SEED o banco permanece como está)
if (process.env.SEED === 'true' || process.env.SEED === '1') {
  try {
    db.prepare("INSERT OR IGNORE INTO reservas (id,campanha_id,inicio,fim,anunciante,criada_por) VALUES ('r1','c5','2027-02-01','2027-02-28','Jardins Delicatessen','admin')").run();
  } catch {}
}

// Migração: bancos criados antes desta feature não têm as colunas de autorização.
try {
  const cols = db.prepare('PRAGMA table_info(programacoes)').all().map((c) => c.name);
  if (!cols.includes('autorizado_por')) db.exec('ALTER TABLE programacoes ADD COLUMN autorizado_por TEXT');
  if (!cols.includes('motivo_autorizacao')) db.exec('ALTER TABLE programacoes ADD COLUMN motivo_autorizacao TEXT');
  const resCols = db.prepare('PRAGMA table_info(reservas)').all().map((c) => c.name);
  if (!resCols.includes('anunciante')) db.exec("ALTER TABLE reservas ADD COLUMN anunciante TEXT NOT NULL DEFAULT ''");
  const cfgCols = db.prepare('PRAGMA table_info(config)').all().map((c) => c.name);
  if (!cfgCols.includes('max_clientes_por_led')) db.exec('ALTER TABLE config ADD COLUMN max_clientes_por_led INTEGER NOT NULL DEFAULT 8');
  if (!cfgCols.includes('logo_dataurl')) db.exec("ALTER TABLE config ADD COLUMN logo_dataurl TEXT NOT NULL DEFAULT ''");
  const notCols = db.prepare('PRAGMA table_info(notificacoes)').all().map((c) => c.name);
  if (!notCols.includes('cidade_id')) db.exec("ALTER TABLE notificacoes ADD COLUMN cidade_id TEXT NOT NULL DEFAULT ''");
} catch {}

module.exports = db;
