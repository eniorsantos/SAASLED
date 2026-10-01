# 01 — Visão geral

SaaS de **Controle de Veiculação em Painéis de LED**, implementado a partir de
`spec-saas-controle-leds` (regras e back-end) com o painel nas cores e elementos
de `mockup-led-saas` (front-end).

Origem: planilha `CONTROLE_DE_LEDS.xlsx` — 4 painéis em Aracaju/SE
(AJU 01…04), cada um com campanhas **veiculando** e **reservadas**.

## Estrutura do repositório

```text
F:\SAASLEDS
├── README.md               # índice + guia rápido
├── docs/                   # esta documentação (01–09)
├── backend/                # API REST — Node + Express + SQLite
│   ├── package.json        # scripts: start, dev, test
│   ├── data.db             # SQLite criado no 1º boot (ignorado pelo git)
│   └── src/
│       ├── index.js        # rotas, auth, dashboard, exportação/importação, jobs
│       ├── db.js           # schema + seed + migrações
│       └── regras.js       # regras de negócio puras (status, ocupação, grade, reservas)
│   └── test/smoke.js       # teste de fumaça dos contratos da spec
└── frontend/               # painel — Vite + React + Recharts
    ├── package.json        # scripts: dev, build, preview
    ├── vite.config.ts      # dev :5173 com proxy /api → :3001
    ├── index.html
    └── src/
        ├── main.tsx        # bootstrap
        ├── App.tsx         # todas as telas do painel
        ├── api.ts          # cliente HTTP + fallback offline do mockup
        └── index.css       # paleta e componentes do mockup
```

## Stack (spec §6)

| Camada       | Escolha                                   |
|--------------|-------------------------------------------|
| Front-end    | Vite + React 18 + Recharts 2             |
| Back-end     | Node 22 + Express 4 (JS, sem build)      |
| Banco        | SQLite via `better-sqlite3` (relacional, zero-config; migra fácil p/ PostgreSQL) |
| Auth         | login/senha + JWT 12h                     |
| Jobs         | `setInterval` 24h + execução no boot      |
| Notificações | polling HTTP 30s + central (sininho)      |
| Exportação   | CSV manual + XLSX via lib `xlsx`          |
| Importação   | CSV no padrão da exportação (+ reservas)  |

## Como rodar

```powershell
cd backend; npm install; npm start      # API em http://localhost:3001
cd frontend; npm install; npm run dev   # painel em http://localhost:5173
```

Logins demo: `admin/admin123` (admin), `regional/reg123` (regional),
`operador/op123` (operador), `viewer/view123` (somente leitura).

Variáveis de ambiente:

| Var            | Onde     | Padrão              | Efeito                          |
|----------------|----------|---------------------|---------------------------------|
| `PORT`         | back-end | `3001`              | porta da API                    |
| `JWT_SECRET`   | back-end | `led-control-dev`   | assinatura dos tokens (trocar em prod) |
| `DB_PATH`        | back-end | `backend/data.db`   | caminho do SQLite (em nuvem: apontar p/ disco persistente — doc 09) |
| `HOJE`         | back-end | (data real)         | "hoje" lógico; fixe (`2026-10-25`) só p/ simular/testar |
| `SEED`         | back-end | (vazio)             | `true` popula o dataset demo na criação; sem seed, só o admin de resgate (se não houver usuários) |
| `VITE_API_URL` | front    | `""` (usa proxy)    | base da API quando sem proxy    |

## Convenções importantes

- **"Hoje" = data real** (`hojeISO()`; `HOJE` só para simular). O período de
  referência do dashboard e a evolução mensal seguem o mês do "hoje".
- **Sem API no ar, o painel funciona offline**: `api.ts` tem `FALLBACK_DASH`
  com os valores literais do mockup (72,4%, 4/4, rosca 55/25/20 etc.).
