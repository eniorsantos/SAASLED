// Regras de negócio — spec §3 + §4.3 + §8.2
function getConfig(db) {
  return db.prepare('SELECT * FROM config WHERE id = 1').get();
}
function normalizarAnunciante(s) {
  return String(s || '').trim().replace(/\s+/g, ' ');
}
function diasEntre(aISO, bISO) {
  return Math.round((new Date(aISO + 'T12:00:00') - new Date(bISO + 'T12:00:00')) / 86400000);
}
// Poda de órfãs: notificações de campanhas/reservas que não existem mais
// (ex.: criadas antes do agrupamento, ou de registros excluídos — sem isso os
// toasts mortos reaparecem para sempre, ignorando o agrupamento)
function podarNotificacoesOrfas(db) {
  let apagadas = 0;
  const idsCamp = new Set(db.prepare('SELECT id FROM campanhas').all().map((r) => r.id));
  const idsRes = new Set(db.prepare('SELECT id FROM reservas').all().map((r) => r.id));
  const vivas = (anu, data, deReserva) => {
    if (deReserva)
      return db.prepare(`SELECT COUNT(*) v FROM reservas r JOIN campanhas c ON c.id = r.campanha_id
        WHERE r.inicio = ? AND (r.anunciante = ? OR (r.anunciante = '' AND c.anunciante = ?))`).get(data, anu, anu).v > 0;
    return db.prepare('SELECT COUNT(*) v FROM campanhas WHERE anunciante = ? AND inicio = ?').get(anu, data).v > 0;
  };
  for (const n of db.prepare('SELECT id, campanha_id, evento FROM notificacoes').all()) {
    const cid = n.campanha_id;
    if (idsCamp.has(cid) || idsRes.has(cid)) continue;
    const m = /^grupo:(ini|venc|res):(.*):(\d{4}-\d{2}-\d{2})$/.exec(cid);
    if (m && vivas(m[2], m[3], m[1] === 'res')) continue;
    db.prepare('DELETE FROM notificacoes WHERE id = ?').run(n.id);
    apagadas++;
  }
  return apagadas;
}
function hojeISO() {
  if (process.env.HOJE) return process.env.HOJE;
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10); // data local real
}
const MESES_PT_LONGO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MESES_PT_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
// Período de referência = mês do "hoje" (antes era Out-2026 fixo do mockup)
function periodoReferencia(hoje = hojeISO()) {
  const [y, m] = hoje.split('-').map(Number);
  const ini = `${hoje.slice(0, 7)}-01`;
  const fimDia = new Date(y, m, 0).getDate();
  return { ini, fim: `${hoje.slice(0, 7)}-${String(fimDia).padStart(2, '0')}`, rotulo: `${MESES_PT_LONGO[m - 1]} ${y}` };
}
// Últimos 6 meses até o "hoje": [{mes:'Abr', ini, fim}] p/ evolução mensal
function ultimos6Meses(hoje = hojeISO()) {
  const [y0, m0] = hoje.split('-').map(Number);
  const out = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(y0, m0 - 1 - i, 1);
    const y = d.getFullYear(), m = d.getMonth() + 1;
    const ini = `${y}-${String(m).padStart(2, '0')}-01`;
    const fim = `${y}-${String(m).padStart(2, '0')}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
    out.push({ mes: MESES_PT_CURTO[m - 1], ini, fim });
  }
  return out;
}
// Veiculando: hoje ∈ [início, fim] · Início próximo: início−hoje ≤ N(7) ·
// Vencimento próximo: fim−hoje ≤ N(5) · Vencida: passou do último dia (fim < hoje) · Livre: sem campanha
function statusCampanha(c, cfg, hoje = hojeISO()) {
  if (c.fim < hoje) return 'vencida';
  if (Number(c.reservada) === 1 || c.inicio > hoje)
    return diasEntre(c.inicio, hoje) <= cfg.n_inicio_proximo ? 'agendada' : 'reservada';
  return diasEntre(c.fim, hoje) <= cfg.n_vencimento_proximo ? 'a_vencer' : 'veiculando';
}
// Ocupação (%) = dias contratados no período ÷ dias totais do período (spec §4.3)
function ocupacao(campanhas, pIni, pFim) {
  const t0 = new Date(pIni + 'T12:00:00').getTime(), t1 = new Date(pFim + 'T12:00:00').getTime();
  const total = Math.max(1, Math.round((t1 - t0) / 86400000) + 1);
  const dias = new Set();
  for (const c of campanhas) {
    const a = Math.max(t0, new Date(c.inicio + 'T12:00:00').getTime());
    const b = Math.min(t1, new Date(c.fim + 'T12:00:00').getTime());
    for (let t = a; t <= b; t += 86400000) dias.add(new Date(t).toISOString().slice(0, 10));
  }
  return +(Math.min(100, (dias.size / total) * 100).toFixed(1));
}
function validarDataISO(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false; // barra "31/9" inválida (§1)
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
// Varredura diária spec §4.1 — 1 toast por campanha/evento/dia (anti-duplicidade)
// + 1 toast por reserva/evento/dia (múltiplas reservas de campanha).
// Agrupamento: campanhas com MESMO anunciante + MESMA data de início saem num
// único toast (corpo lista os LEDs); o id sintético `grupo:<evento>:<anu>:<data>`
// mantém a anti-duplicidade por grupo/dia.
function varreduraNotificacoes(db) {
  const cfg = getConfig(db), hoje = hojeISO();
  const grupos = new Map();
  const push = (key, g) => {
    if (!grupos.has(key)) grupos.set(key, { ...g, leds: [], dias: [] });
    const cur = grupos.get(key);
    cur.leds.push(g.led);
    cur.dias.push(g.dias);
  };
  const notificar = (campanhaId, evento, titulo, corpo, cidadeId) => {
    try {
      db.prepare(`INSERT INTO notificacoes (campanha_id,evento,titulo,corpo,dia,cidade_id) VALUES (?,?,?,?,?,?)`)
        .run(campanhaId, evento, titulo, corpo, hoje, cidadeId || '');
      return true;
    } catch { return false; }
  };
  const camps = db.prepare('SELECT * FROM campanhas').all();
  for (const c of camps) {
    const anu = normalizarAnunciante(c.anunciante);
    const dFim = diasEntre(c.fim, hoje), dIni = diasEntre(c.inicio, hoje);
    if (dFim >= 0 && dFim <= cfg.n_vencimento_proximo && c.inicio <= hoje)
      push(`venc||${anu}||${c.inicio}`, {
        campanhaId: `grupo:venc:${anu}:${c.inicio}`, evento: 'vencimento',
        titulo: `⚠ Vencimento próximo`, anunciante: anu, tipo: 'venc',
        led: c.led_codigo, dias: dFim, cidade: c.cidade_id,
      });
    if (dIni >= 0 && dIni <= cfg.n_inicio_proximo && c.inicio > hoje)
      push(`ini||${anu}||${c.inicio}`, {
        campanhaId: `grupo:ini:${anu}:${c.inicio}`, evento: 'inicio',
        titulo: `🔔 Início próximo`, anunciante: anu, tipo: 'ini',
        led: c.led_codigo, dias: dIni, cidade: c.cidade_id,
      });
  }
  // Reservas: cada (anunciante, início) gera seu próprio grupo
  const reservas = db.prepare(`
    SELECT r.*, c.anunciante AS camp_anunciante, c.led_codigo, c.cidade_id FROM reservas r
    JOIN campanhas c ON c.id = r.campanha_id`).all();
  for (const r of reservas) {
    const dIni = diasEntre(r.inicio, hoje);
    const anu = normalizarAnunciante(r.anunciante || r.camp_anunciante);
    if (dIni >= 0 && dIni <= cfg.n_inicio_proximo)
      push(`res||${anu}||${r.inicio}`, {
        campanhaId: `grupo:res:${anu}:${r.inicio}`, evento: 'inicio',
        titulo: `🔔 Reserva próxima`, anunciante: anu, tipo: 'res',
        led: r.led_codigo, dias: dIni, cidade: r.cidade_id,
      });
  }
  let criadas = 0;
  for (const g of grupos.values()) {
    const leds = [...new Set(g.leds)].join(', ');
    let corpo;
    if (g.tipo === 'venc' && new Set(g.dias).size === 1)
      corpo = `${g.anunciante} encerra em ${g.dias[0]} dias · ${leds}`;
    else if (g.tipo === 'venc')
      corpo = `${g.anunciante} · ${g.leds.map((l, i) => `${l} em ${g.dias[i]} dias`).join('; ')}`;
    else if (g.tipo === 'res')
      corpo = `Reserva de ${g.anunciante} inicia em ${g.dias[0]} dias · ${leds}`;
    else
      corpo = `${g.anunciante} inicia em ${g.dias[0]} dias · ${leds}`;
    if (g.leds.length > 1) corpo += ` (${g.leds.length} painéis)`;
    if (notificar(g.campanhaId, g.evento, g.titulo, corpo, g.cidade)) criadas++;
  }
  return { criadas, hoje };
}
// Grade V3 §9.1 — duas campanhas podem dividir a mesma grade (mesmo LED/dia)
// desde que os intervalos [horário, horário+duração] NÃO se sobreponham.
// Sobreposição só entra com autorização explícita de um admin (auditada).
function validarHorario(hhmm) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm || '')) return false;
  return true;
}
function horarioParaSegundos(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 3600 + m * 60;
}
function intervalosSobrepostos(aIni, aDur, bIni, bDur) {
  const aFim = aIni + aDur, bFim = bIni + bDur;
  return aIni < bFim && bIni < aFim;
}
function diasSet(s) {
  return new Set(String(s || '').split(',').map((x) => x.trim()).filter(Boolean));
}
function acharChoqueGrade(existentes, novo) {
  const nIni = horarioParaSegundos(novo.horario_inicio);
  const nDias = diasSet(novo.dias_semana);
  for (const e of existentes) {
    const eDias = diasSet(e.dias_semana);
    const diaComum = [...nDias].some((d) => eDias.has(d));
    if (!diaComum) continue;
    if (intervalosSobrepostos(nIni, Number(novo.duracao_segundos), horarioParaSegundos(e.horario_inicio), Number(e.duracao_segundos)))
      return e;
  }
  return null;
}
// Capacidade: cada LED tem N espaços de cliente (padrão 8). Um "espaço" é um
// anunciante distinto com campanha não-vencida (fim >= hoje) no LED.
function espacosUsados(db, ledCodigo, hoje = hojeISO(), excetoId = null) {
  let sql = 'SELECT DISTINCT anunciante FROM campanhas WHERE led_codigo = ? AND fim >= ?';
  const args = [ledCodigo, hoje];
  if (excetoId) { sql += ' AND id != ?'; args.push(excetoId); }
  return db.prepare(sql).all(...args).map((r) => r.anunciante);
}
module.exports = { getConfig, hojeISO, periodoReferencia, ultimos6Meses, diasEntre, normalizarAnunciante, podarNotificacoesOrfas, statusCampanha, ocupacao, validarDataISO, varreduraNotificacoes, validarHorario, horarioParaSegundos, intervalosSobrepostos, acharChoqueGrade, espacosUsados };
