# CONTROLE DE LED — SaaS Controle de Veiculação (painéis de LED)

Implementação exata de `spec-saas-controle-leds` (back-end + regras) com painel
nas cores/elementos de `mockup-led-saas`.

## Estrutura

- `backend/` — API REST (Node + Express + SQLite `data.db`)
  - Modelo §2+§9: cidades, leds, anunciantes, campanhas, reservas, programações, usuários/perfis/permissões, notificações, auditoria, config
  - Regras §3 (status), ocupação §4.3, toasts/job §4.1, filtro cidade §8.1, exportação+importação §8.3, grade V3 §9.1 (só API), permissões §9.2
  - `npm start` → http://localhost:3001 · `npm test` → smoke da spec + features
- `frontend/` — painel Vite React + Recharts na paleta do mockup (`--bg:#0b1224` … `--teal:#2dd4bf`)
  - `npm run dev` → http://localhost:5173 (proxy `/api` → back-end) · `npm run build`

## Grade compartilhada (V3 §9.1 — só API; card removido do painel)

- Duas campanhas podem dividir a mesma grade (mesmo LED/dia) **sem sobrepor** os
  intervalos `[horário, horário+duração]` — liberado para operador/regional/admin.
- Com **sobreposição**, a API responde `403` (não-admin) ou `409` (admin sem
  confirmação) com `requer_autorizacao_admin: true` e o detalhe do choque.
- O **admin** confirma com `autorizacao_admin: true` + `motivo_autorizacao`; o
  spot é salvo com `autorizado_por` e o evento `programacao.create.autorizada`
  vai para a auditoria.

## Capacidade, cadastros e acesso

- Cada LED tem **8 espaços de cliente** (anunciantes distintos não-vencidos;
  `max_clientes_por_led` configurável pelo admin). O 9º é rejeitado com `409`.
- Menu **📺 LEDs**: incluir, editar (renomear move tudo junto), excluir (só LED
  vazio) — selo `x/8` por painel; Gantt com o nome de todas as campanhas.
- Menu **🗓️ Reservas** (janela como o cadastro de LEDs + **aba Reservas**,
  independentes): múltiplos períodos futuros por campanha, cada um com seu
  anunciante e toast de início próximo.
- Menu **👥 Usuários**: por usuário, define cidades visíveis + recursos extras.
- Menu **🏙️ Cidades**: incluir, editar (id fixo) e excluir (só vazia).
- **Tela Configurações** (botão + Voltar): Acesso + Cidades + **Cores** + Importar + **Logo** + **Backup** (paleta:
  fundo, fontes, destaques e gráficos, com restaurar padrão; backup JSON com restauração).
- Aba planilha com **＋ Nova campanha**, **Editar/Reservas/Excluir** por linha
  e **Excluir selecionadas**; **⬆ Importar** + **Modelo** na Configuração.
- Aba **Relatórios**: por LED/cidade/cliente, com status e período, preview
  agrupado e download em PDF.

## Rodar (Docker)`r`n`r`n```powershell`r`ncd docker; cp .env.example .env  # JWT_SECRET obrigatório`r`ndocker compose up -d --build   # http://localhost:8080`r`n````r`n`r`n## Rodar (local)

```powershell
cd backend; npm install; npm start      # API
cd frontend; npm install; npm run dev   # painel
```

Login demo: `admin/admin123` (admin), `viewer/view123` (somente leitura).
Sem API no ar, o painel mostra telas vazias com aviso (badge `OFFLINE`).

## Documentação (`docs/`)

| Doc | Conteúdo |
|-----|----------|
| [01 — Visão geral](docs/01-visao-geral.md) | stack, pastas, como rodar, envs, convenções (data real, fallback vazio) |
| [02 — Modelo de dados](docs/02-modelo-de-dados.md) | tabelas, seed, migrações, validações (spec §2+§9) |
| [03 — Regras de negócio](docs/03-regras-de-negocio.md) | status, ocupação, toasts, grade, capacidade, importação, reservas |
| [04 — API](docs/04-api.md) | todos os endpoints (inclui usuários, reservas, import), auth, exemplos |
| [05 — Front-end](docs/05-frontend.md) | telas, paleta do mockup, menus, permissões visuais, offline, build |
| [06 — Auth e permissões](docs/06-auth-permissoes.md) | JWT, perfis, recursos por usuário, escopo por cidade, auditoria (spec §9.2) |
| [07 — Testes](docs/07-testes.md) | smoke (14 itens), checks, evoluções sugeridas |
| [08 — Correções](docs/08-correcoes.md) | histórico: features + debugs por rodada |
| [09 — Implantação](docs/09-implantacao.md) | passo a passo local (Windows) e nuvem (Render, VPS+Nginx+PM2, Vercel) |
| [10 — Implantação Docker](docs/10-implantacao-docker.md) | roteiro local e nuvem só com Docker (Compose, HTTPS, Render, Railway) |