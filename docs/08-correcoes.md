# 08 — Histórico de correções (auditoria de debug)

## Feature anterior: grade compartilhada + autorização admin

- `programacoes` ganhou `autorizado_por`/`motivo_autorizacao` (com migração
  `ALTER TABLE` para bancos antigos);
- choque detectado por **intervalo** `[horário, +duração]`, não só horário exato;
- `POST /api/programacoes`: `403` p/ não-admin, `409` + `requer_autorizacao_admin`
  p/ admin sem confirmação, `201` auditado com `autorizacao_admin:true` + motivo;
- front: "+ Agendar spot", selo `🔓 admin`, bloco de autorização só p/ admin.

## Debug — 14 inconsistências encontradas e corrigidas

**Back-end (7)**

1. `cidadesPermitidas()` era código morto — regional enxergava tudo (§9.2). Criados `authOpcional()` + `filtroEfetivo()` e aplicados a dashboard, campanhas, planilha e exports.
2. KPIs mascaravam zeros (`x || 72.4`, `x || 2`) — agora valores reais; `leds_ativos` era sempre `X/X`, agora `escopo/total`.
3. Exports ignoravam filtros (violava §8.3) e o CSV usava id de cidade cru — extraído `linhasPlanilha()` compartilhado; exports aceitam `?cidades=&status=&q=`.
4. Choque de grade só com `dias_semana` idêntico — multi-dia (`SEG,TER`) nunca colidia; agora interseção de dias.
5. `insercoes_dia` sem validação — agora `>= 1`.
6. Smoke poluía `data.db` a cada run — limpeza no `finally`.
7. `?cidade=` vs `?cidades=` divergentes — unificado com compat mantida.

**Front-end (7)**

8. `if (p.length) setRows(p)` (e notifs/campanhas) congelava dados velhos quando a API retornava vazio (ex.: filtro Salvador) — agora sempre substitui.
9. Planilha caía em linhas fixas de Aracaju com filtro vazio — agora mostra estado vazio online; mockup só offline.
10. Sininho alternava estado que nada renderizava — agora abre a central com "Marcar como lida" (+ CSS `.notif-panel`).
11. Exports sem filtros — agora levam cidade/busca/status.
12. Edição inline casava por anunciante+LED (ambíguo) — API expõe `id`, edição usa `id`.
13. Aba Dashboard hardcoded — agora renderiza as linhas reais.
14. Select de campanha do spot podia ficar inválido ao trocar de LED — agora acompanha as opções; removido parâmetro fantasma de `marcarLida`.

Verificação pós-correções: `npm test` OK · `tsc` + `vite build` OK · checks de
regional-vazio e CSV filtrado OK.

## Rodada 2 — capacidade, menu de LEDs e CRUD da planilha

- **8 espaços de cliente por LED**: `config.max_clientes_por_led` (migração para
  bancos antigos); `espacosUsados()` = anunciantes distintos não-vencidos;
  `POST`/`PUT` de campanha devolve `409 {usados, total}` ao lotar (renovação do
  mesmo anunciante nunca bloqueia); `PUT /api/config` valida inteiro ≥ 1.
- **Menu de cadastro de LEDs** (`📺 LEDs` na topbar, mesmo padrão visual):
  `PUT /api/leds/:codigo` (renomear em transação move campanhas+spots),
  `DELETE` bloqueado com contagem se houver campanhas, `409` em código
  duplicado, `400` em cidade inexistente; `GET /api/leds` e Gantt expõem
  `espacos_usados/espacos_total`; selo `x/8` com barra no Gantt e no menu.
- **Planilha com Incluir/Editar/Excluir**: botão Nova campanha, coluna Ações
  (modal completo + confirmação de exclusão), edição inline passa a usar o `id`.
- Smoke cobre: limite 8 (7 inclusões + 9º rejeitado com `{8,8}`), CRUD de LEDs
  (incluir, duplicado, renomear, exclusão bloqueada/liberada) e `x/8` no GET.

## Rodada 3 — modal, A vencer/A iniciar, toasts e importação

- **Cadastro de LEDs sem estouro**: modal com altura/rolagem interna
  (`max-height` + `overflow-y`), tabela em `.table-scroll` (rolagem horizontal),
  modal largo 640px limitado à viewport, botões sem encolher e grade do
  formulário em 1 coluna no mobile.
- **A vencer × A iniciar**: API separou `a_vencer_lista` (só `a_vencer`) de
  `a_iniciar_lista` (só `agendada`); card com as duas seções e estados vazios.
- **Toasts ao centro**: `.toasts` fixo no topo central (`left:50%` +
  `translateX`), largura limitada à viewport.
- **Importação no padrão**: `POST /api/import/planilha` (`{csv}`, doc 03 §3.7)
  + `GET /api/import/modelo.csv`; front com ⬆ Importar + Modelo e relatório
  inline; smoke com 2 criadas/3 ignoradas. Bônus: BOM real (`U+FEFF`) nos CSVs
  para o Excel PT-BR (o `fetch().text()` o remove — assertion ajustada).

## Rodada 4 — sem grade V3 no painel, Gantt com nomes

- Card **PROGRAMAÇÃO — GRADE DE HORÁRIOS (V3) removido** do painel (a API de
  `programacoes` continua ativa no back-end); faixa inferior virou 2 colunas
  (`.grid2`); código morto do agendamento de spots excluído do front.
- **OCUPAÇÃO POR LED com nomes**: cada bloco `veic` exibe o anunciante em
  maiúsculas (ex.: `ATAKAREJO`, `VITA`) em vez do genérico `VEICULANDO`;
  reservadas mostram `RESERVADA · NOME` (ou contagem); tooltip por bloco com
  período; blocos com ellipsis para nomes longos.

## Rodada 5 — toasts de sessão, carência de vencida e modais maiores

- **Toasts**: surgem em todo login/refresh (dispensa só local; refresh/login
  restaura), **arrastáveis pelo título** (vira `fixed` ao arrastar), botões Ver
  campanha/Fechar; "Marcar como lida" permanente só na central. Polling de 30s
  exibe novas sem refresh.
- **Vencida com carência**: `diasEntre(hoje, fim) >= 2` (dia seguinte ao fim
  ainda é `a_vencer`); KPI conta `d ∈ [-1, 7]`; planilha mostra
  `Nd`/`encerra hoje`/`encerrou ontem`; smoke com fim=ontem/anteontem.
- **Cadastro +50%**: `.modal` 420→630px, `.modal-lg` 640→960px (limitados à
  viewport, com rolagem interna).

## Rodada 6 — toast arrastável de verdade + modais +50% de novo

- **Causa do arrasto não funcionar**: faltava `setPointerCapture` — os eventos
  `pointermove` paravam asim que o cursor saía do título. Agora o título
  captura o ponteiro no `pointerdown`, e o arrasto continua até o `pointerup`
  em qualquer lugar da janela.
- **Cadastro +50% novamente**: `.modal` 630→945px, `.modal-lg` 960→1440px
  (sempre limitados a `100vw − 32px`; em telas menores ocupam a viewport).

## Controle de acesso por usuário (o que cada um pode ver)

- **Back**: tabela `permissoes` + catálogo `RECURSOS` (10) com padrões por
  perfil; `GET /api/me|recursos|usuarios`, `POST|PUT|DELETE /api/usuarios`
  (trava último admin e auto-exclusão); `requer(recurso)` nas escritas
  (campanhas, LEDs, import, export, config); `?token=` aceito nas leituras
  para os links de download; vínculo de cidades vale para qualquer perfil
  (sem vínculo = todas).
- **Front**: `me.efetivas` vindo da API esconde abas (planilha/gráficos),
  botões (LEDs, import/export), ações/inline de campanha e sininho/toasts;
  menu **👥 Usuários** com tabela, criar/editar (senha, perfil, cidades e
  recursos por checkbox) e excluir.

## Reservas multiplas por campanha

- **Back**: tabela eservas (cascade) + seed 1; GET|POST /api/campanhas/:id/reservas, DELETE /api/reservas/:id (409 em interseccao com a campanha ou entre reservas); varredura gera 1 toast Reserva proxima por reserva (dedupe pelo id); _iniciar_lista inclui reservas proximas; Gantt anexa eservas por campanha.
- **Front**: botao **Reservas** na planilha + modal (lista, adicionar, excluir).
- **Smoke**: 2 criadas, 2 rejeitadas (409), toast verificado, exclusoes OK.

## Modelo de importacao com reservas multiplas

- **Modelo**: GET /api/import/modelo.csv agora traz Reserva1_Inicio/Reserva1_Fim ... Reserva3_Inicio/Reserva3_Fim com exemplo preenchido.
- **Importador**: colunas ReservaN_* detectadas por padrao (sem acento, tolera espacos), cada par validado como na secao 3.8 (conflito vira item ignorado sem abortar a campanha); resposta com eservas_criadas; front exibe (+N reserva(s)).
- **Smoke**: 1 reserva criada + 1 reserva sobreposta ignorada (total 4 ignoradas).

## Anunciante proprio por reserva

- **Back**: eservas.anunciante (migracao; vazio = o da campanha) + seed; POST aceita nunciante (cria o anunciante se novo); toasts, A INICIAR e GET usam o da reserva; import com ReservaN_Anunciante (default = o da linha).
- **Front**: modal com coluna Anunciante + campo (placeholder = campanha).
- **Smoke**: reserva com anunciante proprio + toast Reserva de Parceiro X; import com Imp Parceiro verificado no GET.

## Menu de cadastro de reservas

- **Back**: recurso eservas (admin/regional/operador por padrao); GET /api/reservas global com ?cidades=&led=&campanha_id= e escopo por vinculo; PUT /api/reservas/:id com validacoes; endpoints de reserva migrados de campanhas_editar para eservas; seed aditivo de 1 (bancos antigos ganham o exemplo).
- **Front**: botao topbar Reservas + modal CADASTRO DE RESERVAS (tabela global, criar, editar, excluir) no padrao LEDs/Usuarios.
- **Smoke**: item 15 (menu + PUT + 403 de viewer).

## Aba de Reservas

- **Front**: 4a aba (Dashboard / Planilha / Graficos / Reservas, visivel com o recurso) com tabela global, criar, editar e excluir reaproveitando os handlers do menu; botao topbar Reservas navega para a aba; modal duplicado removido; aba padrao recua se vetada.

## Botao Reservas em janela

- Botao topbar Reservas abre janela modal CADASTRO DE RESERVAS (padrao do cadastro de LEDs), independente da aba; aba e janela compartilham o mesmo conteudo/handlers (conteudoReservas()).

## Toasts agrupados por anunciante+inicio

- Varredura agrupa campanhas/reservas de mesmo anunciante + mesma data de inicio num unico toast (corpo lista os LEDs + contagem); id sintetico grupo:<evento>:<anu>:<data> preserva o dedupe; smoke com 2 LEDs (1 toast).

## Auditoria 2 - escopo de escrita e integridade

- **Falha grave**: vinculo de cidades valia so na leitura; escrita por ID (campanhas, reservas, LEDs, spots) passava livre. Agora escopoCidadeOk() barra com 403 (ora do seu escopo) criar/editar/excluir fora do vinculo (PUT de campanha checa origem E destino).
- **Integridade cidade/LED**: campanha exige cidade do LED = cidade informada (400); modal ajusta a cidade ao trocar de LED; import marca divergencia como ignorada.
- **Limpeza**: programacoes/criarProgramacao (api), .grid3 e .spot-auth (css) removidos apos a retirada da grade.
- **Smoke**: item 17 (403 de escopo x3 + 400 de divergencia).

## Toasts duplicados - causa raiz e poda

- **Causa**: 18 notificacoes orfas no banco (ids de reservas de testes ja excluidas, geradas antes do agrupamento) reapareciam a cada sessao, furando o agrupamento. Confirmado inspecionando 
otificacoes (18x Reserva de Diniz Fonseca, 0 campanhas vivas).
- **Correcao**: podarNotificacoesOrfas() no boot/job (apaga toasts sem campanha/reserva/grupo vivo; 18 podadas na base atual) + 
ormalizarAnunciante() em todas as escritas e nas chaves de grupo (Dup X = Dup X  ).
- **Smoke**: item 16 estendido (normalizacao).

## Limpeza total + SEED desligavel

- Banco esvaziado (todas as tabelas zeradas; config mantida).
- **Achao no caminho**: seed usava INSERT puro e recriava tudo no boot seguinte, chegando a quebrar (UNIQUE usuarios.login). Seed agora idempotente (INSERT OR IGNORE) + SEED=false pula o seed garantindo so o admin de resgate.
- Uso: $env:SEED='false'; npm start para operar vazio; sem a variavel, o seed repovoa.

## Filtro de cidade nao carregava tudo

- **Causas**: select do topo com cidades fixas (Aracaju/Salvador) — cidades novas nunca apareciam; clique na barra de cidade limpava o filtro em vez de filtrar; ocupacao_por_cidade valia so para Aracaju ( resto 0).
- **Correcao**: opcoes vindas da API (+ breadcrumb/subtitulo dinamicos); clique filtra pela cidade; ocupacao calculada por cidade (media dos LEDs). Smoke isolado por DB_PATH (item 18); base real do usuario (17 LEDs) preservada.

## Limpeza mantendo os LEDs

- Banco zerado exceto leds (32), cidades (6, para os LEDs nao ficarem orfaos) e config; admin de resgate recriado. Boot normal nao resemeia (cidades presentes).

## Importacao real (256 linhas)

- Resultado: 179 campanhas + 76 reservas; 84 ignoradas (48 vazias, 27 nomes sem datas, 2 duplicadas, 7 avisos de reserva-virada-campanha).
- **Regra aprendida com o arquivo**: rotação — reservas convivem com campanha e entre si (validação de choque removida do POST/PUT/import).
- **Datas por extenso** (27/nov.,  2/out...), **ano seguinte** (28/02/26 apos  1/09/26 = 2027, conta em nos_ajustados), **diária única**, **reserva-only vira campanha reservada**, match de LED/cidade sem acento (PRAÇA  ABRANTES, Camaçari).
- **Defeito pego no smoke**: fallback de diária única aceitava lado inválido (31/02 + fim válido virava diária do fim); agora só lado vazio.

## Gantt mostra todas as campanhas

- Vencidas sumiam da faixa e o LED parecia vazio: agora cada campanha tem bloco com nome (teal veiculando, roxo reservada, apagado encerrada) e LIVRE so no restante.

## Auditoria 3 - rosca real e escopo de leitura

- **Rosca fixa**: donut era 55/25/20 chumbado com dados reais; agora % de veiculando/reservadas/livres (soma 100).
- **Leituras sem escopo**: GET /api/leds, reservas aninhadas, programacoes e central ignoravam o vinculo. Agora filtram/403; notificacoes ganharam cidade_id (migracao).
- **Smoke**: item 19.
