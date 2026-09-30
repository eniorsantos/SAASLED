# 02 — Modelo de dados (spec §2 + §9)

```text
CIDADE 1──N LED 1──N CAMPANHA N──1 ANUNCIANTE
CAMPANHA 1──N PROGRAMACAO        USUARIO N──N CIDADE (via USUARIO_CIDADE)
CAMPANHA 1──N RESERVAS           USUARIO 1──N PERMISSOES (recursos extras)
```

Arquivo: `backend/src/db.js`. Banco: `backend/data.db` (criado no 1º boot;
caminho sobrescrito por `$DB_PATH` — usado em nuvem com disco persistente, doc 09;
ignorado pelo git — ver `.gitignore`).

## Tabelas

| Tabela           | Colunas                                                                                  |
|------------------|------------------------------------------------------------------------------------------|
| `config`         | `id=1`, `n_inicio_proximo` (7), `n_vencimento_proximo` (5), `max_clientes_por_led` (8) — limites editáveis pelo admin |
| `cidades`        | `id` (ex. `aracaju`), `nome`, `uf`, `fuso` (padrão `America/Maceio`)                     |
| `leds`           | `codigo` PK (ex. `AJU 01`), `endereco`, `cidade_id` → cada LED pertence a exatamente 1 cidade |
| `anunciantes`    | `nome` PK                                                                                |
| `campanhas`      | `id`, `cidade_id`, `led_codigo`, `anunciante`, `inicio`/`fim` (`AAAA-MM-DD`), `reservada` 0/1 |
| `programacoes`   | `id`, `campanha_id`, `led_codigo`, `horario_inicio` (`HH:MM`), `duracao_segundos`, `dias_semana`, `insercoes_dia`, `autorizado_por`, `motivo_autorizacao` |
| `reservas`       | `id`, `campanha_id` (cascade), `inicio`/`fim`, `anunciante` (próprio; vazio = o da campanha), `criada_por`, `criada_em` — N períodos futuros por campanha |
| `usuarios`       | `login` PK, `senha` (texto — demo), `perfil`, `nome`                                     |
| `usuario_cidade` | `login` + `cidade_id` (cidades que o usuário pode ver; qualquer perfil; vazio = todas) |
| `permissoes`     | `login` + `recurso` (extras além do padrão do perfil; efetivas = padrão ∪ extras)      |
| `notificacoes`   | `campanha_id` (id de campanha, de reserva ou `grupo:<evento>:<anunciante>:<data>`), `evento` (`vencimento`/`inicio`), `titulo`, `corpo`, `dia`, `lida`, `cidade_id` (escopo da central), `criada_em` — UNIQUE (`campanha_id`,`evento`,`dia`) = anti-duplicidade §4.1 |
| `auditoria`      | `quando`, `quem`, `oque`, `detalhe` — quem/o quê/quando §9.2                             |

## Seed (dataset inicial)

`SEED=false` pula o seed (e garante só o admin de resgate). Seed normal,
idempotente (`INSERT OR IGNORE` — pode rodar sobre banco existente sem erro):

- Cidades: `aracaju` (Aracaju/SE), `salvador` (Salvador/BA, sem LEDs — mostra o estado vazio multi-cidade).
- LEDs: AJU 01 Silvio Teixeira · AJU 02 Tancredo Neves · AJU 03 Adélia Franco · AJU 04 Francisco Porto.
- Campanhas `c1…c8`: Atakarejo (longa, veiculando), Boticário (reservada), Vita, Diniz Fonseca (vencida no "hoje" simulado), Jardins Delicatessen, Hospital dos Olhos (a vencer), São Braz, Rede Primavera (agendada).
- Spots `s1…s3`: grade da AJU 01 de segunda (07:00/07:15/07:30).
- Reserva `r1`: Jardins (c5) com período futuro extra (02/2027).
- Usuários: `admin/admin123`, `regional/reg123` (vinculado a `aracaju`), `operador/op123`, `viewer/view123`.

## Migrações

`db.js` no boot: `ALTER TABLE` para `programacoes.autorizado_por`/
`motivo_autorizacao`, `config.max_clientes_por_led` e `reservas.anunciante`
quando ausentes, além de seed aditivo da reserva-exemplo `r1` — bancos criados
antes dessas features continuam funcionando.

## Validações de escrita

- Datas `AAAA-MM-DD` reais (`validarDataISO`): `2026-09-31` é rejeitado —
  cobre a inconsistência "31/9" da planilha (spec §1); `inicio <= fim` obrigatório;
  importação aceita também `DD/MM/AA(A)` e cabeçalhos sem acento.
- Horário `HH:MM` 00:00–23:59; `duracao_segundos > 0`; `insercoes_dia >= 1`.
- Grade: sem interseção de intervalos no mesmo LED/dia → salva; com choque →
  exige autorização admin (doc 03).
- Anunciante é **normalizado** (trim + espaços colapsados) em todas as escritas
  — `Dup X` e `Dup X  ` são o mesmo cliente (e agrupam no mesmo toast).
- Reservas: sem interseção com a campanha nem entre irmãs; 8 espaços/LED só
  contam campanhas (reservas não consomem espaço).
