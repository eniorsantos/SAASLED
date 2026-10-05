# 04 — Referência da API

Base: `http://localhost:3001`. Auth: `Authorization: Bearer <JWT>` onde indicado
(os links de download aceitam `?token=`). Leituras de escopo (`dashboard`,
`campanhas`, `planilha`, exports, reservas) aceitam token **opcional**: sem token
são públicas; com token **não-admin**, o filtro é intersectado com as cidades
vinculadas (doc 06).

Legenda de auth: 🔓 pública · 🔑 login · ✏️ admin/regional/operador ·
`` `recurso` `` exige o recurso · 👑 só admin.

## Auth / config / saúde

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/api/auth/login` | 🔓 | `{login, senha}` → `{token, perfil, nome, login}` (401 se inválido) |
| GET | `/api/health` | 🔓 | `{ok: true, hoje}` |
| GET | `/api/config` | 🔓 | `{hoje, n_inicio_proximo, n_vencimento_proximo, max_clientes_por_led}` |
| PUT | `/api/config` | `config` | `{n_inicio_proximo?, n_vencimento_proximo?, max_clientes_por_led?}` (inteiro ≥ 1) |
| GET | `/api/tema` | 🔓 | `{vars{11 cores}, rotulos}` — paleta do mockup por padrão |
| PUT | `/api/tema` | `config` | `{vars?}` (hex `#rgb`/`#rrggbb`, só chaves conhecidas) ou `{restaurar:true}` |

## Cadastros (§8.1)

| Método | Rota | Auth | Query/Body |
|--------|------|------|------------|
| GET/POST | `/api/cidades` | 🔓/`cidades` | POST: `{id, nome, uf?, fuso?}`; 409 id duplicado |
| PUT | `/api/cidades/:id` | `cidades` | `{nome?, uf?, fuso?}` (id não renomeia) |
| DELETE | `/api/cidades/:id` | `cidades` | 409 se houver LEDs; limpa vínculos |
| GET | `/api/leds?cidade=` | 🔓 (+escopo) | cada LED traz `espacos_usados/espacos_total` (8 por padrão) |
| POST | `/api/leds` | `leds` | `{codigo, endereco, cidade_id}`; 400 cidade inexistente · 409 código duplicado |
| PUT | `/api/leds/:codigo` | `leds` | `{endereco?, cidade_id?, novo_codigo?}`; renomear move campanhas+spots (transação) |
| DELETE | `/api/leds/:codigo` | `leds` | 409 se houver campanhas; 404 se inexistente |
| GET | `/api/anunciantes` | 🔓 | — |

## Campanhas (§4.4, validações no doc 02)

| Método | Rota | Auth | Detalhes |
|--------|------|------|----------|
| GET | `/api/campanhas` | 🔓 (+escopo) | `?cidades=a,b` (aceita legado `?cidade=`), `?led=`, `?status=`; cada item traz `status` calculado |
| POST | `/api/campanhas` | `campanhas_editar` | `{id, cidade_id, led_codigo, anunciante, inicio, fim, reservada?}`; 400 p/ data inválida, `inicio>fim`, LED inexistente ou cidade≠cidade do LED · **409 LED lotado** (`{usados,total}`, 8 espaços) · 403 fora do escopo |
| PUT | `/api/campanhas/:id` | `campanhas_editar` | edição parcial (usada pelo inline da planilha); troca de LED/anunciante revalida a lotação (ignorando a própria campanha) |
| DELETE | `/api/campanhas/:id` | `campanhas_editar` | - |
| DELETE | `/api/campanhas` | `campanhas_editar` | lote `{ids: []}` → `{excluidas[], ignoradas[{id, motivo}]}` (escopo por item) |
| GET | `/api/campanhas/:id/reservas` | 🔓 (+escopo: 403 fora do vínculo) | N períodos futuros (cada um com seu `anunciante`) |
| POST | `/api/campanhas/:id/reservas` | `reservas` | `{inicio, fim, anunciante?}` (vazio = o da campanha); rotação sem choque; cada reserva notifica o início (doc 03 §3.8) |
| GET | `/api/reservas` | 🔓 (+escopo) | menu global: `?cidades=`, `?led=`, `?campanha_id=`; cada item traz `anunciante`, `led_codigo`, `cidade_id/nome` |
| PUT | `/api/reservas/:id` | `reservas` | `{inicio?, fim?, anunciante?}` com as mesmas validações do POST (ignorando a própria) |
| DELETE | `/api/reservas/:id` | `reservas` | - |

## Grade / programação (§9.1, doc 03 §3.4)

| Método | Rota | Auth | Detalhes |
|--------|------|------|----------|
| GET | `/api/programacoes` | 🔓 (+escopo) | `?led=` e/ou `?campanha=` |
| POST | `/api/programacoes` | ✏️ | `{id, campanha_id, led_codigo, horario_inicio, duracao_segundos?, dias_semana?, insercoes_dia?, autorizacao_admin?, motivo_autorizacao?}`; 400 validação · 403 choque sem poder de admin · 409 choque aguardando confirmação admin (`requer_autorizacao_admin: true` + `choque`) · 201 `{ok, id, autorizada_por?}` |

## Dashboard / planilha / exportação (§8.2, §4.4, §8.3)

| Método | Rota | Auth | Resposta |
|--------|------|------|----------|
| GET | `/api/dashboard?cidades=` | 🔓 (+escopo) | `{hoje, periodo, kpis{...}, distribuicao[3] (slots), evolucao_mensal[6], ocupacao_por_cidade[] (inventario), gantt_por_led[] (espacos + `reservas[]`), a_vencer_lista[] (janela 0-7d, sem corte, com `dias`), a_iniciar_lista[] (`agendada` + reservas, com `dias`)}` |
| GET | `/api/planilha?cidades=&status=&q=` | 🔓 (+escopo) | `[{id, cidade, led, anunciante, inicio, fim, status}]` |
| GET | `/api/export/planilha.csv?...` | `exportar` | mesmos filtros da planilha (+`?token=`); `;`-separado com BOM |
| GET | `/api/export/planilha.xlsx?...` | `exportar` | mesmos filtros (+`?token=`); aba `Veiculação` |
| GET | `/api/import/modelo.csv` | 🔓 | modelo no padrão (cabeçalho + 2 exemplos, com Reserva1) |
| POST | `/api/import/planilha` | `importar` | `{csv}` → `{total, criadas, reservas_criadas, anos_ajustados, ignoradas[{linha, anunciante, motivo, aviso?}], ids}` (doc 03 §3.7) |

## Notificações / auditoria (§4.1, §9.2)

| Método | Rota | Auth | Detalhes |
|--------|------|------|----------|
| GET | `/api/notificacoes` | 🔓 (+escopo: filtra por `cidade_id`) | últimas 50 `{..., cidade_id?, anunciante?, led?, campanha_ref?}` (para o Ver campanha) |
| POST | `/api/notificacoes/varredura` | 🔑 | executa a varredura sob demanda → `{criadas, hoje}` |
| PATCH | `/api/notificacoes/:id/lida` | 🔑 | marca como lida |
| GET | `/api/auditoria` | 👑 | últimas 100 linhas `{quando, quem, oque, detalhe}` |

## Usuários e acesso (controle por usuário)

| Método | Rota | Auth | Detalhes |
|--------|------|------|----------|
| GET | `/api/me` | 🔑 | `{login, perfil, nome, cidades[], permissoes[] (extras), efetivas[]}` — o front usa para exibir/esconder módulos |
| GET | `/api/recursos` | 🔑 | catálogo `{id, rotulo}` (12: dashboard, planilha, graficos, leds, cidades, campanhas_editar, reservas, importar, exportar, notificacoes, usuarios, config) |
| GET | `/api/usuarios` | `usuarios` | lista com cidades + permissões + efetivas |
| POST | `/api/usuarios` | `usuarios` | `{login, senha, perfil?, nome?, cidades[]?, permissoes[]?}`; 409 login duplicado |
| PUT | `/api/usuarios/:login` | `usuarios` | senha (vazio mantém), perfil, nome, `cidades[]` e `permissoes[]` substituem; 409 ao rebaixar o último admin |
| DELETE | `/api/usuarios/:login` | `usuarios` | 409 p/ próprio login ou último admin |

Escritas exigem o recurso: campanhas→`campanhas_editar`, LEDs→`leds`,
reservas→`reservas`, import→`importar`, export→`exportar` (link leva `?token=`),
config→`config`, usuários→`usuarios` (programações e cidades seguem perfis
editores). Leituras de escopo intersectam o filtro com as cidades vinculadas
(não-admin sem vínculo = todas).

Exemplo:

```powershell
$tok = (Invoke-RestMethod -Method Post http://localhost:3001/api/auth/login `
  -ContentType 'application/json' -Body '{"login":"admin","senha":"admin123"}').token
Invoke-RestMethod http://localhost:3001/api/dashboard
Invoke-RestMethod "http://localhost:3001/api/export/planilha.csv?cidades=aracaju" -OutFile leds.csv
```
