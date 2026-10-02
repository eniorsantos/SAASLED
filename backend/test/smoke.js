// Smoke com dataset demo: fixa o "hoje" em Out-2026 e liga o SEED
// (produção nasce vazia, sem SEED, e usa a data real; ver docs/01)
process.env.HOJE = '2026-10-25';
process.env.SEED = 'true';
// Smoke test: sobe a API em memória e valida os contratos da spec.
const assert = require('assert');
const app = require('../src/index');
const server = app.listen(0, async () => {
  const base = `http://localhost:${server.address().port}`;
  const get = async (p, token) => (await fetch(base + p, { headers: token ? { Authorization: 'Bearer ' + token } : {} })).json();
  try {
    const health = await get('/api/health');
    assert.equal(health.ok, true, 'health');
    const dash = await get('/api/dashboard');
    assert.ok(dash.kpis, 'dashboard kpis');
    assert.equal(dash.kpis.leds_ativos, '4/4', 'kpis leds 4/4');
    assert.ok(Array.isArray(dash.distribuicao) && dash.distribuicao.length === 3, 'rosca 3 fatias');
    assert.ok(Array.isArray(dash.gantt_por_led) && dash.gantt_por_led.length === 4, 'gantt 4 leds');
    assert.ok(dash.ocupacao_por_cidade.find((c) => c.id === 'aracaju').valor > 0, 'aracaju com ocupação real');
    assert.equal(dash.ocupacao_por_cidade.find((c) => c.id === 'salvador').valor, 0, 'salvador sem LEDs = 0');
    const ledsAr = await get('/api/leds?cidades=aracaju');
    assert.ok(ledsAr.length === 4 && ledsAr.every((l) => l.cidade_id === 'aracaju'), 'LEDs filtrados por cidade');
    const plan = await get('/api/planilha');
    assert.ok(plan.length >= 8, 'planilha >= 8 campanhas');
    const login = await (await fetch(base + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'admin', senha: 'admin123' }),
    })).json();
    assert.ok(login.token, 'login admin emite JWT');
    const cfg = await get('/api/config');
    assert.equal(cfg.n_inicio_proximo, 7, 'N inicio = 7');
    assert.equal(cfg.n_vencimento_proximo, 5, 'N vencimento = 5');
    // validação de data inválida (§1: 31/9)
    const bad = await (await fetch(base + '/api/campanhas', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + login.token },
      body: JSON.stringify({ id: 'x', cidade_id: 'aracaju', led_codigo: 'AJU 01', anunciante: 'T', inicio: '2026-09-31', fim: '2026-10-01' }),
    })).json();
    assert.ok(bad.erro, 'data 31/9 rejeitada');
    // anti-sobreposição grade V3 (§9.1)
    const post = (token, body) => fetch(base + '/api/programacoes', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(body),
    }).then(async (r) => ({ status: r.status, json: await r.json() }));
    const choque = await post(login.token, { id: 'sx', campanha_id: 'c1', led_codigo: 'AJU 01', horario_inicio: '07:00', dias_semana: 'SEG' });
    assert.ok(choque.json.erro && choque.json.requer_autorizacao_admin, 'sobreposição exige autorização admin');
    // mesma grade SEM sobreposição: liberado para qualquer editor
    const vizinha = await post(login.token, { id: 's-ok-' + Date.now(), campanha_id: 'c2', led_codigo: 'AJU 01', horario_inicio: '07:01', duracao_segundos: 30, dias_semana: 'SEG' });
    assert.ok(vizinha.json.ok, 'grade compartilhada sem sobreposição permitida');
    // sobreposição com flag admin: liberada e auditada
    const over = await post(login.token, { id: 's-over-' + Date.now(), campanha_id: 'c2', led_codigo: 'AJU 01', horario_inicio: '07:00', duracao_segundos: 15, dias_semana: 'SEG', autorizacao_admin: true, motivo_autorizacao: 'teste smoke' });
    assert.equal(over.status, 201, 'admin autoriza sobreposição');
    assert.equal(over.json.autorizada_por, 'admin', 'autorização registrada');
    // não-admin não pode autorizar
    const opLogin = await (await fetch(base + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'operador', senha: 'op123' }),
    })).json();
    const negada = await post(opLogin.token, { id: 's-neg', campanha_id: 'c2', led_codigo: 'AJU 01', horario_inicio: '07:00', dias_semana: 'SEG', autorizacao_admin: true });
    assert.equal(negada.status, 403, 'não-admin não autoriza sobreposição');
    // dashboard separa a vencer (fim) de a iniciar (início)
    assert.ok(dash.a_vencer_lista.every((a) => a.status === 'A vencer'), 'a vencer só vencimento');
    assert.ok((dash.a_iniciar_lista || []).every((a) => a.status === 'Agendada'), 'a iniciar só agendadas');
    assert.ok((dash.a_iniciar_lista || []).some((a) => a.anunciante === 'Rede Primavera'), 'Rede Primavera em a iniciar');
    // importação de planilha no padrão Cidade;LED;Anunciante;Início;Fim
    const imp = await (await fetch(base + '/api/import/planilha', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + login.token },
      body: JSON.stringify({ csv: 'Cidade;LED;Anunciante;Início;Fim;Reserva1_Anunciante;Reserva1_Início;Reserva1_Fim\nAracaju;AJU 03;Imp A;01/12/26;31/01/27;Imp Parceiro;01/02/27;28/02/27\nAracaju;AJU 03;Imp B;2026-12-01;2027-01-31;;2026-12-15;2027-01-05\nAracaju;ZZZ 99;Imp C;01/12/26;31/01/27;;;\nAracaju;AJU 03;Imp A;01/12/26;31/01/27;;;\nAracaju;AJU 03;Imp D;31/02/27;01/03/27;;;' }),
    })).json();
    assert.equal(imp.criadas, 2, 'importa 2 válidas');
    assert.equal(imp.reservas_criadas, 2, 'importa as 2 reservas (rotação: convivem com a campanha)');
    assert.equal(imp.ignoradas.length, 3, 'ignora LED inexistente + duplicada + data inválida');
    const impA = (await get('/api/campanhas?led=AJU%2003', login.token)).find((c) => c.anunciante === 'Imp A');
    const impARes = await get('/api/campanhas/' + impA.id + '/reservas');
    assert.equal(impARes[0].anunciante, 'Imp Parceiro', 'reserva guarda o próprio anunciante');
    const modelo = await (await fetch(base + '/api/import/modelo.csv')).text();
    assert.ok(modelo.startsWith('Cidade;LED'), 'modelo no padrão'); // fetch .text() remove o BOM (presente no wire p/ o Excel)
    const cfg2 = await get('/api/config');
    assert.equal(cfg2.max_clientes_por_led, 8, 'limite padrão 8 espaços/LED');
    const postCamp = (body) => fetch(base + '/api/campanhas', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + login.token },
      body: JSON.stringify(body),
    }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));
    // vencida passou do último dia: fim=hoje ainda vale; fim=ontem vencida
    await postCamp({ id: 'cap-g1', cidade_id: 'aracaju', led_codigo: 'AJU 03', anunciante: 'Grace 1', inicio: '2026-10-01', fim: '2026-10-25' });
    await postCamp({ id: 'cap-g2', cidade_id: 'aracaju', led_codigo: 'AJU 03', anunciante: 'Grace 2', inicio: '2026-10-01', fim: '2026-10-24' });
    const todas = await get('/api/campanhas');
    assert.equal(todas.find((c) => c.id === 'cap-g1').status, 'a_vencer', 'no último dia ainda não é vencida');
    assert.equal(todas.find((c) => c.id === 'cap-g2').status, 'vencida', 'passou do último dia é vencida');
    // capacidade: 8 espaços de cliente por LED
    // AJU 02 tem 1 anunciante ativo (Vita) → completa até 8
    for (let i = 1; i <= 7; i++) {
      const r = await postCamp({ id: 'cap-t' + i, cidade_id: 'aracaju', led_codigo: 'AJU 02', anunciante: 'Teste ' + i, inicio: '2026-10-01', fim: '2026-12-31' });
      assert.equal(r.status, 201, 'espaço ' + (i + 1) + '/8 na AJU 02');
    }
    const lotado = await postCamp({ id: 'cap-t9', cidade_id: 'aracaju', led_codigo: 'AJU 02', anunciante: 'Teste 9', inicio: '2026-10-01', fim: '2026-12-31' });
    assert.equal(lotado.status, 409, '9º cliente rejeitado (8 espaços)');
    assert.deepEqual(lotado.json.espacos, { usados: 8, total: 8 }, 'retorna ocupação');
    // CRUD de LEDs (menu de cadastro)
    const ledPost = (b) => fetch(base + '/api/leds', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + login.token },
      body: JSON.stringify(b),
    }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));
    assert.equal((await ledPost({ codigo: 'TST 01', endereco: 'Rua Teste', cidade_id: 'salvador' })).status, 201, 'LED incluído');
    assert.equal((await ledPost({ codigo: 'TST 01', endereco: 'Dup', cidade_id: 'salvador' })).status, 409, 'código duplicado rejeitado');
    const ren = await fetch(base + '/api/leds/TST%2001', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + login.token },
      body: JSON.stringify({ novo_codigo: 'TST 02' }),
    });
    assert.equal(ren.status, 200, 'LED renomeado');
    const delBloq = await fetch(base + '/api/leds/AJU%2001', {
      method: 'DELETE', headers: { Authorization: 'Bearer ' + login.token },
    });
    assert.equal(delBloq.status, 409, 'exclusão com campanhas bloqueada');
    assert.equal((await fetch(base + '/api/leds/TST%2002', { method: 'DELETE', headers: { Authorization: 'Bearer ' + login.token } })).status, 200, 'LED vazio excluído');
    const leds = await get('/api/leds');
    const aju01 = leds.find((l) => l.codigo === 'AJU 01');
    assert.ok(aju01 && aju01.espacos_total === 8 && aju01.espacos_usados === 2, 'LED expõe x/8 espaços');
    // CRUD de cidades (id, nome, UF, fuso)
    const cidPost = (b) => fetch(base + '/api/cidades', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + login.token },
      body: JSON.stringify(b),
    }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));
    assert.equal((await cidPost({ id: 'tstc', nome: 'Teste City', uf: 'TC' })).status, 201, 'cidade incluída');
    assert.equal((await cidPost({ id: 'tstc', nome: 'Dup', uf: 'TC' })).status, 409, 'cidade duplicada rejeitada');
    assert.equal((await fetch(base + '/api/cidades/tstc', { method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + login.token },
      body: JSON.stringify({ nome: 'Teste City 2' }) })).status, 200, 'cidade editada');
    assert.ok((await get('/api/cidades')).some((c) => c.id === 'tstc' && c.nome === 'Teste City 2'), 'edição persistiu');
    assert.equal((await fetch(base + '/api/cidades/aracaju', { method: 'DELETE', headers: { Authorization: 'Bearer ' + login.token } })).status, 409, 'exclusão com LEDs bloqueada');
    assert.equal((await fetch(base + '/api/cidades/tstc', { method: 'DELETE', headers: { Authorization: 'Bearer ' + login.token } })).status, 200, 'cidade vazia excluída');
    // controle de acesso por usuário: CRUD + visibilidade + enforcement
    const me = await get('/api/me', login.token);
    assert.ok(me.efetivas.includes('usuarios'), 'admin enxerga tudo');
    const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + login.token };
    const novo = await (await fetch(base + '/api/usuarios', { method: 'POST', headers: H,
      body: JSON.stringify({ login: 'teste', senha: 't123', perfil: 'visualizador', cidades: ['aracaju'], permissoes: ['exportar'] }) })).json();
    assert.ok(novo.efetivas.includes('exportar') && !novo.efetivas.includes('leds'), 'extra concedido sem exceder o perfil');
    const tTok = (await (await fetch(base + '/api/auth/login', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: 'teste', senha: 't123' }) })).json()).token;
    assert.ok(tTok, 'novo usuário loga');
    const meT = await get('/api/me', tTok);
    assert.deepEqual(meT.cidades, ['aracaju'], 'visibilidade restrita às cidades vinculadas');
    const dashT = await get('/api/dashboard?cidades=salvador', tTok);
    assert.equal(dashT.gantt_por_led.length, 0, 'cidade fora do vínculo retorna vazia');
    const semPoder = await (await fetch(base + '/api/campanhas', { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tTok },
      body: JSON.stringify({ id: 'cap-x', cidade_id: 'aracaju', led_codigo: 'AJU 01', anunciante: 'X', inicio: '2026-11-01', fim: '2026-12-01' }) })).json();
    assert.ok(semPoder.erro && semPoder.erro.includes('campanhas_editar'), 'escrita sem permissão bloqueada');
    assert.equal((await fetch(base + '/api/usuarios/admin', { method: 'DELETE', headers: H })).status, 409, 'não exclui o próprio login');
    assert.equal((await fetch(base + '/api/usuarios/teste', { method: 'DELETE', headers: H })).status, 200, 'usuário de teste excluído');
    // múltiplas reservas por campanha + toast de início próximo (c4 vencida: fora do período)
    const postRes = (cid, body) => fetch(base + '/api/campanhas/' + cid + '/reservas', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + login.token },
      body: JSON.stringify(body),
    }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));
    const rA = await postRes('c4', { inicio: '2026-10-27', fim: '2026-11-05' });
    assert.equal(rA.status, 201, 'reserva 1 criada');
    const rB = await postRes('c4', { inicio: '2026-11-06', fim: '2026-11-20' });
    assert.equal(rB.status, 201, 'reserva 2 criada (múltiplas)');
    const rC = await postRes('c4', { inicio: '2026-10-28', fim: '2026-11-02' });
    assert.equal(rC.status, 201, 'reserva em rotação convive com as demais');
    assert.equal((await get('/api/campanhas/c4/reservas')).length, 3, 'lista 3 reservas');
    const rD = await postRes('c6', { inicio: '2026-11-01', fim: '2026-11-05', anunciante: 'Parceiro X' });
    assert.equal(rD.status, 201, 'reserva com anunciante próprio criada');
    const varr = await (await fetch(base + '/api/notificacoes/varredura', { method: 'POST', headers: { Authorization: 'Bearer ' + login.token } })).json();
    assert.ok(varr.criadas >= 1, 'varredura gera toast da reserva');
    const nots = await get('/api/notificacoes');
    assert.ok(nots.some((n) => n.corpo.includes('Reserva de Diniz Fonseca')), 'toast da reserva aparece');
    assert.ok(nots.some((n) => n.corpo.includes('Reserva de Parceiro X')), 'toast usa o anunciante da reserva');
    for (const id of [rA.json.id, rB.json.id, rC.json.id, rD.json.id])
      assert.equal((await fetch(base + '/api/reservas/' + id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + login.token } })).status, 200, 'reserva excluída');
    // agrupamento: mesmo anunciante + mesmo início = 1 toast com os LEDs
    assert.equal((await ledPost({ codigo: 'TST G1', endereco: 'Rua G1', cidade_id: 'salvador' })).status, 201, 'LED grupo 1');
    assert.equal((await ledPost({ codigo: 'TST G2', endereco: 'Rua G2', cidade_id: 'salvador' })).status, 201, 'LED grupo 2');
    for (const [cid, led] of [['cap-gx1', 'TST G1'], ['cap-gx2', 'TST G2']]) {
      const r = await postCamp({ id: cid, cidade_id: 'salvador', led_codigo: led, anunciante: 'Grupo X', inicio: '2026-10-27', fim: '2026-11-30' });
      assert.equal(r.status, 201, 'campanha do grupo criada em ' + led);
    }
    await (await fetch(base + '/api/notificacoes/varredura', { method: 'POST', headers: { Authorization: 'Bearer ' + login.token } })).json();
    const grupo = (await get('/api/notificacoes')).filter((n) => n.corpo.includes('Grupo X'));
    assert.equal(grupo.length, 1, '1 toast para o grupo');
    assert.ok(grupo[0].corpo.includes('TST G1') && grupo[0].corpo.includes('TST G2'), 'toast lista os LEDs');
    assert.equal(grupo[0].anunciante, 'Grupo X', 'toast leva o anunciante p/ Ver campanha');
    assert.ok(grupo[0].campanha_ref, 'toast referencia a campanha');
    assert.equal(grupo[0].cidade_id, 'salvador', 'toast carrega a cidade (escopo da central)');
    const regTokEscopo = (await (await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: 'regional', senha: 'reg123' }) })).json()).token;
    // escopo de leitura: LEDs, reservas aninhadas e central respeitam o vínculo
    const regLeds = await get('/api/leds', regTokEscopo);
    assert.ok(regLeds.length > 0 && regLeds.every((l) => l.cidade_id === 'aracaju'), 'LEDs filtrados pelo vínculo');
    assert.equal((await ledPost({ codigo: 'TST SC', endereco: 'Rua SC', cidade_id: 'salvador' })).status, 201, 'LED salvador p/ escopo');
    assert.equal((await postCamp({ id: 'cap-sc1', cidade_id: 'salvador', led_codigo: 'TST SC', anunciante: 'SC', inicio: '2026-11-01', fim: '2026-12-01' })).status, 201, 'campanha salvador');
    assert.equal((await fetch(base + '/api/campanhas/cap-sc1/reservas', { headers: { Authorization: 'Bearer ' + regTokEscopo } })).status, 403, 'reserva aninhada fora do escopo bloqueada');
    const notsReg = await get('/api/notificacoes', regTokEscopo);
    assert.ok(notsReg.every((n) => !n.cidade_id || n.cidade_id === 'aracaju'), 'central filtrada pelo vínculo');
    await fetch(base + '/api/campanhas/cap-sc1', { method: 'DELETE', headers: { Authorization: 'Bearer ' + login.token } });
    assert.equal((await fetch(base + '/api/leds/TST%20SC', { method: 'DELETE', headers: { Authorization: 'Bearer ' + login.token } })).status, 200, 'limpeza escopo');
    // normalização: 'Dup X' e 'Dup X  ' (espaços) agrupam no mesmo toast
    for (const [cid, anu] of [['cap-d1', 'Dup X'], ['cap-d2', 'Dup X  ']]) {
      const r = await postCamp({ id: cid, cidade_id: 'salvador', led_codigo: cid === 'cap-d1' ? 'TST G1' : 'TST G2', anunciante: anu, inicio: '2026-11-01', fim: '2026-12-01' });
      assert.equal(r.status, 201, 'campanha com espaços criada');
    }
    await (await fetch(base + '/api/notificacoes/varredura', { method: 'POST', headers: { Authorization: 'Bearer ' + login.token } })).json();
    const dup = (await get('/api/notificacoes')).filter((n) => n.corpo.includes('Dup X'));
    assert.equal(dup.length, 1, 'nomes com espaços agrupados em 1 toast');
    // ocupação por cidade calculada por cidade (não só Aracaju)
    assert.equal((await ledPost({ codigo: 'TST O1', endereco: 'Rua O', cidade_id: 'salvador' })).status, 201, 'LED salvador criado');
    assert.equal((await postCamp({ id: 'cap-o1', cidade_id: 'salvador', led_codigo: 'TST O1', anunciante: 'Ocupante', inicio: '2026-10-01', fim: '2026-10-31' })).status, 201, 'campanha mês cheio');
    // ocupação por cidade = inventário: anunciantes ativos (veiculando+reservadas) ÷ 8 espaços
    // salvador aqui: G1/G2 com {Grupo X, Dup X} (25% cada) + O1 com {Ocupante} (12.5%) → média 20.8
    const occ2 = await get('/api/dashboard');
    assert.equal(occ2.ocupacao_por_cidade.find((c) => c.id === 'salvador').valor, 20.8, 'salvador reflete o LED novo');
    await fetch(base + '/api/campanhas/cap-o1', { method: 'DELETE', headers: { Authorization: 'Bearer ' + login.token } });
    assert.equal((await fetch(base + '/api/leds/TST%20O1', { method: 'DELETE', headers: { Authorization: 'Bearer ' + login.token } })).status, 200, 'LED salvador excluído');
    // menu de cadastro de reservas: lista global + edição + permissão
    const menu = await get('/api/reservas');
    assert.ok(menu.some((r) => r.id === 'r1' && r.cidade_nome === 'Aracaju'), 'menu lista com cidade');
    const rM = await postRes('c4', { inicio: '2026-11-21', fim: '2026-11-30' });
    const upd = await (await fetch(base + '/api/reservas/' + rM.json.id, { method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + login.token },
      body: JSON.stringify({ fim: '2026-11-25', anunciante: 'Menu X' }) })).json();
    assert.ok(upd.ok, 'reserva editada pelo menu');
    const menu2 = await get('/api/reservas?led=AJU%2002');
    assert.ok(menu2.some((r) => r.id === rM.json.id && r.anunciante === 'Menu X'), 'filtro por LED + anunciante próprio');
    assert.equal((await fetch(base + '/api/reservas/' + rM.json.id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + login.token } })).status, 200, 'limpeza do menu');
    const vis = await (await fetch(base + '/api/usuarios', { method: 'POST', headers: H,
      body: JSON.stringify({ login: 'vis', senha: 'v123', perfil: 'visualizador' }) })).json();
    assert.ok(vis.login, 'viewer criado');
    const vTok = (await (await fetch(base + '/api/auth/login', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: 'vis', senha: 'v123' }) })).json()).token;
    assert.equal((await postResAuth(vTok, 'c4', { inicio: '2026-12-01', fim: '2026-12-10' })).status, 403, 'viewer sem recurso reservas bloqueado');
    assert.equal((await fetch(base + '/api/usuarios/vis', { method: 'DELETE', headers: H })).status, 200, 'viewer excluído');
    // escopo de escrita: vinculado a aracaju não altera salvador; cidade/LED consistentes
    const regTok = (await (await fetch(base + '/api/auth/login', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: 'regional', senha: 'reg123' }) })).json()).token;
    assert.equal((await ledPost({ codigo: 'TST S1', endereco: 'Rua S', cidade_id: 'salvador' })).status, 201, 'LED salvador criado');
    const Hreg = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + regTok };
    assert.equal((await (await fetch(base + '/api/campanhas', { method: 'POST', headers: Hreg,
      body: JSON.stringify({ id: 'cap-s', cidade_id: 'salvador', led_codigo: 'TST S1', anunciante: 'S', inicio: '2026-11-01', fim: '2026-12-01' }) })).status), 403, 'escrita fora do escopo bloqueada');
    assert.equal((await (await fetch(base + '/api/campanhas', { method: 'POST', headers: H,
      body: JSON.stringify({ id: 'cap-mm', cidade_id: 'salvador', led_codigo: 'AJU 01', anunciante: 'MM', inicio: '2026-11-01', fim: '2026-12-01' }) })).status), 400, 'cidade/LED inconsistentes rejeitados');
    assert.equal((await (await fetch(base + '/api/campanhas/c1', { method: 'PUT', headers: Hreg,
      body: JSON.stringify({ cidade_id: 'salvador', led_codigo: 'TST S1' }) })).status), 403, 'mover p/ fora do escopo bloqueado');
    assert.equal((await fetch(base + '/api/leds/TST%20S1', { method: 'DELETE', headers: { Authorization: 'Bearer ' + regTok } })).status, 403, 'exclusão fora do escopo bloqueada');
    assert.equal((await fetch(base + '/api/leds/TST%20S1', { method: 'DELETE', headers: { Authorization: 'Bearer ' + login.token } })).status, 200, 'admin exclui');
    async function postResAuth(tok, cid, body) {
      return fetch(base + '/api/campanhas/' + cid + '/reservas', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
        body: JSON.stringify(body),
      }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));
    }
    console.log('SMOKE OK — spec §§1–9 + grade compartilhada/autorização admin verificados');
  } catch (e) { console.error('SMOKE FAIL:', e.message); process.exitCode = 1; }
  finally {
    try {
      const d = require('../src/db');
      d.prepare("DELETE FROM programacoes WHERE id LIKE 's-ok-%' OR id LIKE 's-over-%'").run();
      d.prepare("DELETE FROM campanhas WHERE id LIKE 'cap-%'").run();
      d.prepare("DELETE FROM campanhas WHERE id LIKE 'imp-%'").run();
      d.prepare("DELETE FROM reservas WHERE id LIKE 'imp-r-%'").run();
      d.prepare("DELETE FROM reservas WHERE campanha_id IN ('c4','c6')").run(); // sobras de run abortado (r1 é de c5)
      d.prepare("DELETE FROM notificacoes WHERE campanha_id LIKE 'grupo:%'").run();
      d.prepare("DELETE FROM leds WHERE codigo LIKE 'TST %'").run();
    } catch {}
    server.close(); setTimeout(() => process.exit(process.exitCode || 0), 200).unref?.(); process.exit(process.exitCode || 0);
  }
});
