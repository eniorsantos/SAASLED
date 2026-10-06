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

## Vencida sem carencia

- Reportado que o vencido exibia errado: havia carencia de 1 dia (>= 2). Agora im < hoje = vencida (ultimo dia ainda conta); KPI volta a [0, 7]; planilha sem encerrou ontem; smoke fim=hoje/ontem.

## Vencidas em massa - era a data simulada

- **Causa**: HOJE fixo em 2026-10-25 com dados reais (hoje real 30/09): 148/179 campanhas marcadas vencidas. Confirmado comparando status simulado x real.
- **Correcao**: hojeISO() usa a data real (HOJE virou override); periodo e evolucao mensal seguem o mes do hoje; smoke fixa HOJE para o seed; rodape do painel dinamico. Com data real: 47 veiculando, 81 a vencer, 27 vencidas (legitimas).

## Ver campanha funcional

- **Causa**: o botao so trocava de aba, sem localizar a campanha. Agora GET /api/notificacoes resolve nunciante, led e campanha_ref (campanha direta, reserva ou grupo); o botao (toast e central) vai a planilha, busca o anunciante, limpa os filtros e pisca a linha por 5s.

## Ver campanha ainda falhava

- **Causas**: (1) sem nunciante na notificacao (back antigo ou caso nao resolvido), o botao ia a planilha sem buscar nada; (2) com permissao ainda carregando (me=null), o clique desviava para o Dashboard ou caia em aba vazia.
- **Correcao**: extracao do nome do texto do toast como fallback; sem permissao carregada nao desvia; abas/planilha liberadas no modo offline (antes o fallback offline era inalcançavel).

## Filtro de cidade em tudo

- Faltava escopo em LEDs, reservas, toasts e selects (filtros mostravam outras cidades). Agora GET /api/leds|reservas|notificacoes aceitam ?cidades=, o front propaga o filtro, trocar de cidade limpa LED/toasts, e o modal de campanha lista só LEDs da cidade.

## Menu de Cidades + janela de edição de reserva

- **Cidades**: recurso cidades (12 no catálogo; regional/operador por padrão); PUT (nome/UF/fuso, id fixo) e DELETE (409 com LEDs) novos; POST migrado para o recurso; menu topbar no padrão.
- **Reservas**: Editar abre janela independente (campanha de contexto + anunciante + período); formulário da aba/janela ficou só de criação.

## Editar reserva em primeiro plano + fechar todas

- Edicao de reserva virou janela propria por ultimo na ordem (z-index 70, acima de todas) em vez de bloco embutido.
- Botao echar todas no topo da pilha de toasts dispensa as visiveis de uma vez (sesso local, voltam no refresh).

## Banco nasce vazio + restauracao apos delecao acidental

- Deploy cria banco VAZIO por padrao; SEED=true popula o demo; config garantida em todo boot (sem ela, o POST de campanha quebrava com cfg undefined); admin de resgate criado so se nao houver usuarios.
- **Incidente**: comando de verificacao apagou data.db por engano; restaurado 100% (6 cidades + 32 LEDs recadastrados via API e reimport do CSV: 179/76).

## Ocupação por cidade ignorava veiculando/reservadas

- **Causa**: métrica mensal (dias no mês corrente) zerava LEDs cheios de bookings futuros (Olinda 3,2% com painéis lotados). Nova métrica de inventário: anunciantes não-vencidos ÷ 8 espaços, média dos LEDs (Aracaju 50, Salvador 39,6, Recife 30...). KPI/evolução seguem dias-no-mês (spec §4.3).

## Aba Configuracoes (Acesso + Cidades + Cores)

- Menus de Usuarios e Cidades viraram secoes da aba (botoes navegam); modais removidos.
- **Tema**: tabela 	ema + GET|PUT /api/tema (recurso config, valida hex, restaurar); front aplica nas CSS vars (Gantt, dots, login, toasts) e nos Recharts; rosca da API usa as cores do tema; smoke item 21.

## Config vira tela cheia

- Botao topbar Configuracao + Voltar; 	ela troca o painel (Acesso/Cidades/Cores dentro); botoes Usuarios/Cidades da topbar removidos; tab config removida.

## Flag reservada sobrepunha período em curso

- 6 campanhas no ar (ex.: São Braz até 30/10) exibiam Agendada porque a flag eservada=1 prevalecia. Status agora deriva só das datas; flag virou informativa.

## Aba Dashboard mostrava só 8 linhas

- linhas.slice(0, 8) sem estado vazio. Agora lista tudo com rolagem, contador e mensagem de vazio.

## Disponíveis contava painéis vazios

- KPI media só LEDs 100% vazios (0 ou 1) ignorando 166 espaços livres nos 8 espaços/LED. Agora soma os espaços livres; rosca usa os mesmos slots (veiculando/reservados/livres).

## A vencer contava campanhas, não LEDs

- KPI somava campanhas (20, com LEDs repetidos 3x); agora conta painéis distintos (14).

## Mais gráficos na distribuição por status

- Seletor Rosca/Pizza/Barras horizontais no card (mesmos dados, tema aplicado).

## PUT estourava FOREIGN KEY

- Editar campanha/reserva para anunciante novo quebrava (FOREIGN KEY constraint failed, pois só o POST criava o anunciante) + spot aceitava campanha inexistente. Agora PUTs criam o anunciante e spot valida (400); smoke cobre.

## Offline sem dados fictícios

- FALLBACK_DASH neutro (zeros/vazio), toasts iniciais vazios, tabelas com aviso Sem dados - API offline; breadcrumb padrão Todas.

## Exclusão múltipla na planilha

- Checkbox por linha + cabeçalho (visíveis), botão Excluir N com confirmação e relatório; DELETE /api/campanhas em lote com escopo por item; seleção limpa ao trocar filtro/cidade.

## Card A vencer divergia do topo

- Topbar contava LEDs, card listava campanhas cortadas em 10 e em janela menor (status 5d vs 7d). Agora mesma janela 0-7d, sem corte (rolagem), com dias por linha e contagem N campanhas em M LEDs (M = KPI).

## Disponíveis mostra livres/total

- KPI com espacos_total (LEDs x 8, respeita filtro); topbar exibe livres/total espaços.

## Importar/Modelo na Configuração

- Botões saíram da planilha para a seção Importar da Configuração (recurso importar); relatório inline mantido.

## Aba Relatórios com PDF

- Recurso elatorios (13 no catálogo; regional/operador por padrão); POST /api/relatorios/pdf (pdfkit, respeita escopo); aba ao lado da planilha com dimensão, filtros, preview agrupado e download.

## Varredura pos-relatorios

- Download do PDF usava URL relativa (quebrava com VITE_API_URL); POST /api/usuarios e PUT /api/tema aceitavam tipos errados nos arrays/objetos (coagidos para array/objeto).

## PDF sem filtros, sem LED repetido, datas BR

- Removida a linha de filtros, LED fora das linhas, período em DD/MM/AAAA; PDFs sem compressão (texto inspecionável) e smoke decodificando o conteúdo.

## Layout das linhas do PDF

- Sem cidade/LED na linha, período com hífen (DD/MM/AAAA - DD/MM/AAAA) e colunas em posições fixas com altura uniforme.

## LED de volta como primeira coluna

- Linhas em 4 colunas fixas: LED (margem esquerda, 1 linha com ellipsis) | anunciante | período | status.

## Cabeçalhos do PDF na margem direita

- **Causa**: textos absolutos das linhas deixavam o cursor X na direita; os cabeçalhos de grupo seguintes fluíam dali. Agora cabeçalho com X explícito (40) + corte manual de 1 linha (ellipsis quebrava no meio da palavra).

## Linhas sem LED (só no cabeçalho)

- 3 colunas: anunciante | período | status; LED só no cabeçalho do grupo.

## Logo da empresa

- config.logo_dataurl + GET|PUT|DELETE /api/logo (recurso config, valida tipo e 512KB); seção Logo na Configuração com preview 38px; brand usa a logo em tamanho fixo.

## Vite quebrava por BOM no package.json

- 
pm run dev falhava com Failed to load PostCSS config ... Unexpected token: edições via script haviam gravado rontend/package.json (e index.html) com BOM UTF-8, que o JSON.parse do Vite rejeita. Removido o BOM; cuidado: [System.Text.Encoding]::UTF8 do .NET grava **com** BOM — usar New-Object System.Text.UTF8Encoding($false) em scripts.

## Fonte do LED no PDF -30%

- Cabeçalho do grupo de 13pt para 9pt.

## Backup do banco na Configuração

- GET /api/backup (download JSON) + POST /api/backup/restaurar (valida e substitui em transação, com auditoria); seção Backup (recurso config); smoke com roundtrip.
