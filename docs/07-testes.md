# 07 — Testes e verificação

## Smoke do back-end (`backend/test/smoke.js`)

```powershell
cd backend; npm test
```

Sobe a API em porta efêmera contra o banco local e valida os contratos da
spec, **limpando os dados de teste no `finally`**. Fixa `HOJE=2026-10-25`
(relativo ao seed; produção usa a data real). Rode **sempre** num banco
isolado (o smoke cria/exclui dados e exige o seed intacto):

```powershell
$env:DB_PATH = '.\test-smoke.db'; npm test; Remove-Item .\test-smoke.db
```

1. `health` + `dashboard` (KPIs, rosca com 3 fatias, Gantt com 4 LEDs);
2. `planilha` com ≥ 8 campanhas; login admin emite JWT;
3. `config` com N 7/5; data `2026-09-31` rejeitada (§1);
4. sobreposição de grade exige `requer_autorizacao_admin`;
5. mesma grade **sem** sobreposição é permitida;
6. admin com `autorizacao_admin:true` salva (`201` + `autorizada_por`);
7. operador com flag recebe `403`;
8. `config.max_clientes_por_led = 8`; AJU 02 lotada até 8/8 e 9º cliente `409`;
9. CRUD de LEDs: incluir, duplicado `409`, renomear, exclusão com campanhas
   `409`, exclusão de vazio `200`; `GET /api/leds` expõe `espacos_usados/total`;
10. dashboard separa `a_vencer_lista` (só vencimento) de `a_iniciar_lista`
    (Rede Primavera em iniciar);
11. importação: 2 válidas + 2 reservas (rotação) criadas; 3 ignoradas
    (LED inexistente, duplicada, data inválida); modelo com colunas de reserva;
12. vencida passou do último dia: fim=hoje → `a_vencer`; fim=ontem → `vencida`;
    FK sem estouro: PUT com anunciante novo (campanha e reserva) cria o
    anunciante; spot com campanha inexistente → 400;
13. acesso por usuário: `/api/me` do admin, criar `teste` (visualizador +
    aracaju + `exportar`), login dele, vínculo respeitado (salvador vazia),
    escrita sem `campanhas_editar` → 403, auto-exclusão `409`, exclusão OK;
14. reservas múltiplas: 3 criadas em rotação (+1 com anunciante próprio e seu
    toast), toast `Reserva de …` verificado, exclusão OK;
    lote: 2 válidas + 1 inexistente (relatório), 401 sem login, 400 vazio;
15. menu de reservas: lista global com cidade, criar, editar (PUT com novo
    anunciante + filtro `?led=`), excluir; viewer sem `reservas` → 403;
16. agrupamento de toasts: 2 LEDs com mesmo anunciante+início → 1 toast
    listando ambos, com `anunciante` + `campanha_ref` (Ver campanha);
    `Dup X`/`Dup X  ` → 1 toast (normalização);
17. escopo de escrita: regional não cria/altera/exclui fora do vínculo (403),
    cidade≠cidade do LED → 400;
18. filtro de cidade fim-a-fim: Salvador vazia = 0; com 3 LEDs de inventário
    conhecido a média dá 20.8 (25+25+12.5 ÷ 8 espaços); LEDs filtrados por
    `?cidades=`;
19. rosca com % reais; LEDs, reservas aninhadas, spots e central com escopo
    (regional só vê Aracaju; toast com `cidade_id`);
20. cidades: incluir, duplicada `409`, editar nome, exclusão com LEDs `409`,
    exclusão de vazia `200`;
21. tema: padrão do mockup, troca/restaura (admin), `403` não-admin, `400`
    cor/variável inválida;
22. relatórios PDF: por cliente filtra e volta `%PDF`; dimensão inválida
    `400`; sem login `401`.

## Checks manuais usados no debug

- Regional pedindo cidade sem vínculo → `leds_ativos "0/4"`, Gantt vazio (sem vazamento);
- `GET /api/export/planilha.csv?cidades=aracaju` → header + 8 linhas.

## Front-end

```powershell
cd frontend; npx tsc --noEmit; npx vite build   # tipos + build (avisos de chunk >500kB do Recharts são esperados)
```

## Evoluções sugeridas (§8.4)

Período do dashboard parametrizável (`?de=&ate=`); PNG dos gráficos;
exportação agendada por e-mail; hash de senha (bcrypt) + `JWT_SECRET`
obrigatório; `FOREIGN KEYS` ativas no SQLite; paginação em
`notificacoes/auditoria`; suíte de testes unitários de `regras.js`.
