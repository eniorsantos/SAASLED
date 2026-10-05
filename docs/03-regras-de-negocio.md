# 03 — Regras de negócio (spec §3, §4.1, §4.3, §8.2, §9.1)

Código puro e testável em `backend/src/regras.js` (sem I/O).

## 3.1 Status de campanha (spec §3)

`statusCampanha(c, cfg, hoje)` — `hoje` = data real (`HOJE` só p/ simular),
derivado **só das datas** (a flag `reservada` da planilha é informativa e nunca
sobrepõe um período em curso):

| Status        | Regra                                                        |
|---------------|--------------------------------------------------------------|
| `vencida`     | `fim < hoje`, ou seja, **passou do último dia** (no último dia ainda conta como `a_vencer`) |
| `agendada`    | futura (`reservada=1` ou `inicio > hoje`) e `inicio−hoje ≤ N_início` (7) |
| `reservada`   | futura além de N_início                                      |
| `a_vencer`    | veiculando e `0 ≤ fim−hoje ≤ N_vencimento` (5) |
| `veiculando`  | `hoje ∈ [início, fim]`, fora da janela de vencimento         |
| `livre`       | só existe no front (LED/período sem campanha)                |

Os limites N vivem na tabela `config` e são editáveis pelo admin via
`PUT /api/config` (spec: "configuráveis por cliente ou globalmente" —
hoje global).

## 3.2 Ocupação (spec §4.3 + §8.2)

`ocupacao(campanhas, pIni, pFim)` = dias distintos cobertos ÷ dias totais do
período (usa `Set`, então campanhas sobrepostas no mesmo LED não contam dobro).
O dashboard usa duas leituras: **KPI/evolução** (dias no mês do "hoje",
spec §4.3) e **ocupação por cidade + rosca** (inventário: anunciantes
**veiculando + reservadas**, i.e. não-vencidas, ÷ `max_clientes_por_led` —
o KPI **DISPONÍVEIS** é o total de espaços livres Σ(8−usados) — exibido como
`livres/total` (`espacos_total` = LEDs × 8) — e a rosca
reparte os mesmos slots em veiculando/reservados/livres). A evolução usa os
**últimos 6 meses** reais; o KPI "A vencer" conta **LEDs distintos** com alguma
campanha com `fim−hoje ∈ [0, 7]` (um LED com 3 vencimentos vale 1).

## 3.3 Notificações toast (spec §4.1)

`varreduraNotificacoes(db)` gera, por campanha:

- `vencimento`: `0 ≤ fim−hoje ≤ N_vencimento` e já iniciada;
- `inicio`: `0 ≤ inicio−hoje ≤ N_início` e ainda futura.

Anti-duplicidade: `UNIQUE(campanha_id, evento, dia)` — 1 toast por
campanha/evento/dia; o `INSERT` duplicado é silenciosamente ignorado.
**Agrupamento**: campanhas com **mesmo anunciante + mesma data de início**
saem num único toast (corpo lista os LEDs + contagem de painéis; id sintético
`grupo:<evento>:<anunciante>:<data>` mantém o dedupe por grupo/dia). Vale para
vencimento (agrupa por anunciante+início, detalhando cada fim), início e
reservas. Anunciante é **normalizado** (trim + espaços) na escrita e na chave,
para `Dup X` e `Dup X  ` agruparem.
**Poda de órfãs**: no boot (e no job), `podarNotificacoesOrfas()` apaga
notificações de campanhas/reservas que não existem mais — sem isso, toasts de
registros excluídos reapareceriam para sempre, furando o agrupamento.
Disparo: job a cada 24h + 1 execução no boot; front faz polling 30s em
`GET /api/notificacoes` e exibe toast **em todo login/refresh**, não-bloqueante,
**arrastável pelo título**, com **Ver campanha** e **Fechar** — fechar dispensa
só na sessão (volta no próximo login/refresh); leitura definitiva
("Marcar como lida") é na central (sininho).

## 3.4 Grade compartilhada + autorização admin (§9.1, feature)

Duas campanhas podem dividir a **mesma grade** (mesmo LED + dia) desde que os
intervalos `[horario_inicio, +duracao_segundos]` **não se intersectem**
(`intervalosSobrepostos`); `dias_semana` aceita lista (`SEG,QUA`) e o choque
exige dia em comum.

Com choque, `POST /api/programacoes` responde:

| Quem   | Sem `autorizacao_admin` | Com `autorizacao_admin: true` + motivo |
|--------|-------------------------|----------------------------------------|
| admin  | `409` + `requer_autorizacao_admin: true` + detalhe do choque | `201`, salva com `autorizado_por=<login>` |
| demais | `403` ("exige autorização de um usuário admin") | `403` (flag ignorada) |

Toda autorização gera `programacao.create.autorizada` na auditoria; o front
exibia `🔓 admin` na linha do spot (grade removida do painel na Rodada 4; API
mantida).

## 3.5 Capacidade: 8 espaços de cliente por LED

Cada LED tem `max_clientes_por_led` espaços (padrão 8, em `config`, editável
pelo admin). Um espaço = um **anunciante distinto com campanha não-vencida**
(`fim >= hoje`) no LED (`espacosUsados()`).

- `POST /api/campanhas` e `PUT /api/campanhas/:id` (ao trocar LED/anunciante):
  anunciante novo em LED com `usados >= max` → `409` com
  `{erro, espacos: {usados, total}}`. Renovar o mesmo anunciante no mesmo LED
  nunca é bloqueado.
- `GET /api/leds` e o Gantt do dashboard expõem `espacos_usados/espacos_total`.
- LEDs com campanhas não podem ser excluídos (`409`); renomear (`novo_codigo`)
  move campanhas e spots juntos numa transação.

## 3.6 Exportação (spec §8.3)

Exporta **exatamente a view atual**: `GET /api/export/planilha.{csv,xlsx}`
aceita os mesmos `?cidades=&status=&q=` de `GET /api/planilha` (colunas
Cidade, LED, Anunciante, Início, Fim, Status). PDF = impressão da página;
PNG por gráfico = evolução futura (§8.4).

## 3.7 Importação de planilha (mesmo padrão da exportação)

`POST /api/import/planilha` recebe `{csv}` com cabeçalho
`Cidade;LED;Anunciante;Início;Fim[;Reservada]` **mais pares opcionais
`ReservaN_Anunciante;ReservaN_Início;ReservaN_Fim` (N = 1, 2, 3…)** — cada par
vira uma reserva da campanha da linha, com seu anunciante (vazio = o da
linha). (`;` ou `,`; datas `DD/MM/AA`, `DD/MM/AAAA`, ISO ou `DD/mês`
(`27/nov.`); `Reservada` aceita 1/sim; cabeçalhos sem acento funcionam.)
**Rotação**: reservas convivem com o período da campanha e entre si.
**Ano seguinte**: `fim < inicio` vira `fim + 1 ano` (`01/09/26→28/02/26` =
28/02/27; conta em `anos_ajustados`). **Diária única**: só um lado preenchido
vale para ambos. **Sem datas de campanha + reserva válida** = campanha
`reservada` criada do 1º par. Cidade por nome ou id (sem acento), LED por nome
normalizado (ex.: `PRAÇA  ABRANTES` casa com `PRAÇA ABRANTES`), anunciante
criado se novo, `Status` recalculado. Cada linha vira criada ou ignorada com
motivo (LED/cidade, data inválida, duplicada, LED lotado, fora do escopo) —
`{total, criadas, reservas_criadas, anos_ajustados, ignoradas[], ids[]}`.
Modelo em `GET /api/import/modelo.csv` (com exemplo de Reserva1).

## 3.8 Reservas múltiplas por campanha

Cada campanha aceita N períodos futuros (`reservas`), cada um com **seu
anunciante** (vazio = o da campanha; toast e `A INICIAR` usam o da reserva):
datas válidas, `inicio <= fim` (com rolagem de ano). Em **rotação**, reservas
convivem com o período da campanha e entre si (sem validação de choque). Cada reserva com
`0 ≤ inicio−hoje ≤ N_início` gera **seu próprio toast** `🔔 Reserva próxima`
na varredura (dedupe por reserva/dia via id da reserva); reservas próximas
também entram em `a_iniciar_lista` do dashboard.
