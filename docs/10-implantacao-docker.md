# 10 — Roteiro de implantação com Docker (local e nuvem)

Pré-requisito geral: arquivos em `docker/` (`docker-compose.yml`,
`docker-compose.prod.yml`, Dockerfiles, `nginx.conf`, `Caddyfile`,
`.env.example`). Banco em volume (`saasled-data`); sem `JWT_SECRET` nada sobe.

Comandos executados sempre dentro de `docker/` (ou com `-f` apontando).

## A — Local (Windows, Docker Desktop)

1. Instale o Docker Desktop e abra-o (aguarde o ícone estabilizar).
2. `cd docker` · `cp .env.example .env` (ou copie e renomeie no Explorer).
3. Gere o segredo e cole no `.env`:
   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
4. Suba tudo: `docker compose up -d --build` (1º build baixa Node/Nginx e
   compila o SQLite — leva alguns minutos).
5. Confira: `docker compose ps` (ambos `running (healthy)` p/ a API) e abra
   http://localhost:8080 — login `admin/admin123` (banco nasce vazio).
6. Para dados demo numa 1ª carga: `SEED=true` no `.env`, `up -d` de novo e
   recarregue; depois remova o `SEED` para não repovoar.
7. Logs: `docker compose logs -f api` · parar sem perder dados:
   `docker compose down` (nunca `down -v` sem backup).
8. Backup do volume: use a função Backup na tela Configuração (download JSON)
   ou copie o `data.db` do volume (ver `docker/README.md`).

## B — VPS Ubuntu + Compose (controle total)

1. VPS com 1 vCPU/1 GB; instale o Docker:
   ```bash
   curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker $USER
   ```
   (faça logout/login), `sudo ufw allow 80,443/tcp && sudo ufw enable`.
2. Copie o projeto: `git clone <repo> && cd SAASLEDS/docker`, crie o `.env`
   (`JWT_SECRET` forte; `DOMINIO=app.exemplo.com` se tiver domínio).
3. Sem domínio (teste por IP): `docker compose up -d --build` → `http://IP:8080`.
4. Com domínio (HTTPS automático):
   `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`
   → `https://app.exemplo.com` (Caddy emite o certificado sozinho; aguarde 1–2 min).
5. Atualizar versão: `git pull`, `docker compose up -d --build` (o volume com o
   banco é preservado; faça backup antes pela tela Configuração).

## C — Render (Blueprint com Dockerfile + disco)

1. Suba o repo ao GitHub; Render → New → **Blueprint** → selecione o repo
   (ou crie 2 Web Services manuais apontando p/ `docker/backend.Dockerfile` e
   `docker/frontend.Dockerfile`).
2. API: Root Directory `backend`, Docker Command padrão; adicione **Disk**
   montado em `/data` (1 GB) e envs `JWT_SECRET`, `DB_PATH=/data/data.db`.
   Health Check Path: `/api/health`.
3. Web: Root Directory `frontend`, Build com `VITE_API_URL=https://<api>`,
   Publish `dist` — ou sirva o front pelo próprio Nginx do Dockerfile atrás do
   proxy da plataforma.
4. Sem disco, o SQLite zera a cada deploy — o Disk é obrigatório.

## D — Railway (rápido, sem Docker local)

1. Railway → New Project → Deploy from GitHub; adicione 2 serviços
   (backend: Root `backend`, Start `node src/index.js`; frontend: Root
   `frontend`, Build `npm run build`, Publish `dist`, `VITE_API_URL` apontando
   p/ a URL do back-end).
2. Volumes → adicione um volume montado em `/data` no back-end e
   `DB_PATH=/data/data.db`; `JWT_SECRET` nas Variables dos dois.
3. Deploy automático a cada push; confira `/api/health`.

## Problemas comuns

| Sintoma | Ação |
|---------|------|
| `JWT_SECRET is missing` | criar `docker/.env` a partir do `.env.example` |
| Build trava no `better-sqlite3` | normal na 1ª vez (compila toolchain); aguarde ou use máquina com mais CPU |
| `8080` em uso | `WEB_PORT=8081` no `.env` e `up -d` de novo |
| API `unhealthy` | `docker compose logs api` (provável `JWT_SECRET` ou disco cheio) |
| HTTPS não emite (Caddy) | DNS do `DOMINIO` precisa apontar p/ o host; portas 80/443 liberadas |
| Quero recomeçar do zero | backup pela tela Configuração, `docker compose down -v`, `up -d --build` |
