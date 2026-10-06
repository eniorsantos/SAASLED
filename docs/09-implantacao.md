# 09 — Implantação: local e nuvem (passo a passo)

Guia operacional do CONTROLE DE LED. Parte A roda na sua máquina (Windows);
Parte B publica na internet em 3 caminhos (do mais simples ao mais controlado).

> Convenções: comandos PowerShell no Windows (`PS>`) e Bash no Linux (`$`).
> Portas padrão — API `:3001`, painel dev `:5173`, preview `:4173`.

---

# PARTE A — Implantação local

## A.0 Pré-requisitos

| Item | Versão mínima | Como conferir |
|------|---------------|---------------|
| Node.js LTS | 22 | `node --version` → `v22.x` |
| npm | 10 | `npm --version` |
| Git | qualquer | `git --version` |
| Navegador moderno | — | Chrome/Edge/Firefox |

Detalhe: o back-end usa `better-sqlite3` (módulo nativo). No Windows ele baixa
binário pré-compilado no `npm install`; se falhar, instale o
[Build Tools do Visual Studio](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
(workload "Desktop C++") e rode `npm install` de novo.

## A.1 Obter o código

```powershell
PS> git clone <url-do-repo> SAASLEDS
PS> Set-Location SAASLEDS
PS> git status --short   # base limpa: README.md, docs/, backend/, frontend/
```

## A.2 Subir o back-end (etapas)

**Etapa 1 — instalar dependências** (~1 min na 1ª vez):

```powershell
PS> Set-Location .\backend
PS> npm install
```

O que esperar: `added 129 packages`; avisos de `deprecated`/`funding` são normais.
Se `better-sqlite3` falhar, ver A.0 (Build Tools).

**Etapa 2 — iniciar a API:**

```powershell
PS> npm start
# CONTROLE DE LED API on http://localhost:3001 (hoje=2026-10-25)
```

No 1º boot o `src/db.js` cria `backend/data.db` e o seed (2 cidades, 4 LEDs,
8 campanhas, 3 spots, 1 reserva-exemplo, 4 usuários) + poda de órfãs + 1
varredura de notificações. `data.db` é local e ignorado pelo git.

**Etapa 3 — verificar saúde** (novo terminal):

```powershell
PS> Invoke-RestMethod http://localhost:3001/api/health
# ok: True, hoje: 2026-10-25
PS> (Invoke-RestMethod http://localhost:3001/api/dashboard).kpis
# ocupacao_media, leds_ativos 4/4, a_vencer_7d, livres
```

**Etapa 4 — rodar o smoke** (contratos da spec + features: grade, 8 espaços,
reservas, acesso, import, agrupamento — limpa os dados de teste sozinho):

```powershell
PS> npm test
# SMOKE OK — spec §§1–9 + grade compartilhada/autorização admin verificados
```

O teste se limpa sozinho (remove os spots `s-ok-*`/`s-over-*` do banco).

**Etapa 5 — (opcional) variáveis de ambiente:**

```powershell
PS> $env:PORT = 3001; $env:JWT_SECRET = 'troque-isto'; $env:HOJE = '2026-10-25'
PS> npm start
```

`HOJE` permite simular outras datas (ex.: `2026-11-20` para ver vencimentos
mudarem). Em produção, **remova `HOJE`**? Não — o código usa o padrão
`2026-10-25` quando ausente. Para operar com a data real, ajuste
`hojeISO()` em `backend/src/regras.js` para `new Date().toISOString().slice(0,10)`.

## A.3 Subir o front-end (etapas)

**Etapa 1 — instalar e rodar em dev** (novo terminal, API ligada):

```powershell
PS> Set-Location ..\frontend
PS> npm install
PS> npm run dev
# VITE ready in ~1s → Local: http://localhost:5173/
```

O `vite.config.ts` já proxya `/api → http://localhost:3001`; nada a configurar.

**Etapa 2 — abrir e logar:** `http://localhost:5173` → login `admin/admin123`
(topbar mostra `👤 admin`; sem API, o painel cai no modo `OFFLINE` com o mockup).

**Etapa 3 — build de produção local (validação):**

```powershell
PS> npm run build    # tsc + vite → frontend/dist/
PS> npm run preview  # serve o build em http://localhost:4173
```

Aviso `chunk > 500 kB` do Recharts é esperado e inofensivo.

## A.4 Rotina diária local

1. Terminal 1: `cd backend; npm start` · Terminal 2: `cd frontend; npm run dev`.
2. Parar: `Ctrl+C` nos dois.
3. Resetar o banco: pare a API, apague `backend/data.db`, suba de novo — nasce
   vazio (só admin de resgate). Para o dataset demo, suba uma vez com
   `SEED=true` (`$env:SEED='true'; npm start`).
4. Backup do banco: copie `backend/data.db` (com a API parada).

## A.5 Problemas locais comuns

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| `EADDRINUSE :3001` | API já rodando | `Get-Process node \| Stop-Process`, ou `PORT=3002 npm start` (+ ajustar proxy) |
| Painel `OFFLINE` | API fora do ar / proxy errado | conferir A.2 etapa 3; `VITE_API_URL` só quando sem proxy |
| `Cannot find module better-sqlite3` | install incompleto | `cd backend; npm install` de novo (ver A.0) |
| Login rejeitado | banco zerado/seed não rodou | checar `data.db` existe; ver log do boot |
| `tsc` acusa erro | código alterado | corrigir o tipo; nunca commitar com `tsc` vermelho |

---

# PARTE B — Implantação em nuvem

## B.0 Decisões antes de publicar

1. **SQLite persiste em arquivo.** Hospedagens efêmeras (Render/Railway sem disco)
   **apagam `data.db` a cada deploy/redeploy** → anexe um **disco persistente**
   (seção B.1) ou migre p/ Postgres (seção B.4). Sem isso, perde-se tudo.
2. **`JWT_SECRET` forte e único** por ambiente (gerar: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
3. **Trocar as 4 senhas seed** no 1º login em produção (ou via SQL).
4. **`VITE_API_URL` é build-time**: o front precisa da URL pública da API **antes**
   do `npm run build` (ex.: `https://led-api.onrender.com`).
5. **CORS**: hoje `cors()` aberto. Em produção, restrinja à origem do painel
   (ver B.3, endurecimento).

## B.1 Caminho 1 — Render (mais simples; ~20 min, plano free funciona p/ demo)

Arquitetura: 1 Web Service (API) + 1 Static Site (painel) + 1 Disk (persistir `data.db`).

**Etapa 1 — preparar o repo:** commite tudo (menos `data.db`/`node_modules`/`dist`,
já no `.gitignore`) e suba ao GitHub.

**Etapa 2 — criar o banco de dados persistente depois; primeiro o serviço da API:**

1. Render → New → **Web Service** → conecte o repo.
2. Root Directory: `backend`. Build Command: `npm install`. Start Command: `node src/index.js`.
3. Environment: `Node 22`. Health Check Path: `/api/health`.
4. Variables: `JWT_SECRET=<hex gerado>` (+ `HOJE` só se quiser data simulada)
   + `DB_PATH=/var/led-data/data.db` (aponta o SQLite para o disco).
5. **Disks → Add Disk**: Name `led-data`, Mount Path `/var/led-data`, Size `1 GB`.
   Sem este disco, o seed recria do zero a cada deploy (disco efêmero).
   Não monte o disco sobre a pasta do código — o `DB_PATH` existe exatamente
   para separar código (projeto) de dados (disco).
6. Deploy → aguarde `CONTROLE DE LED API on http://localhost:3001` no log e teste:
   `https://<sua-api>.onrender.com/api/health`.

> Nota free-tier: o serviço "dorme" sem tráfego (~50s p/ acordar). O front mostra
> `OFFLINE` até a API responder — comportamento normal, não é bug.

**Etapa 3 — publicar o painel (Static Site):**

1. Render → New → **Static Site** → mesmo repo. Root Directory: `frontend`.
2. Build Command: `npm install && npm run build`. Publish Directory: `dist`.
3. Variable: `VITE_API_URL=https://<sua-api>.onrender.com` (**antes** do build).
4. Deploy → abra a URL, login `admin/admin123`, confira KPIs e planilha.
5. Rewrites: SPA de rota única não precisa (sem react-router), mas se adicionar
   rotas, crie Rewrite `/* → /index.html`.

**Etapa 4 — pós-deploy:** troque as senhas seed; rode 1 varredura manual
(`POST /api/notificacoes/varredura` com o token); confira `data.db` sobrevivendo
a um redeploy (crie 1 campanha de teste, redeploy, confira).

## B.2 Caminho 2 — VPS Ubuntu + Nginx + PM2 (controle total; ~45 min)

Vale para DigitalOcean/Hetzner/Oracle/AWS EC2 (1 vCPU/1 GB basta p/ demo).
Domínio próprio `painel.exemplo.com` (API) — ajuste aos seus nomes.

**Etapa 1 — preparar o servidor:**

```bash
$ sudo apt update && sudo apt upgrade -y
$ curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
$ sudo apt install -y nodejs git nginx python3 make g++   # toolchain p/ better-sqlite3
$ node --version   # v22.x
$ sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable
```

**Etapa 2 — instalar o projeto:**

```bash
$ sudo mkdir -p /var/www && sudo chown $USER:$USER /var/www
$ git clone <url-do-repo> /var/www/saas-leds && cd /var/www/saas-leds
$ cd backend && npm install --omit=dev && cd ../frontend && npm install
```

**Etapa 3 — configurar e buildar o front apontando p/ a API pública:**

```bash
$ cd /var/www/saas-leds/frontend
$ VITE_API_URL=https://api.exemplo.com npm run build   # gera dist/
```

**Etapa 4 — PM2 para a API (sempre no ar + restart):**

```bash
$ sudo npm i -g pm2
$ cd /var/www/saas-leds/backend
$ JWT_SECRET='<hex>' HOJE='' pm2 start src/index.js --name led-api
$ pm2 save && pm2 startup   # execute o comando que ele imprimir (sudo env ...)
$ pm2 logs led-api   # conferir "CONTROLE DE LED API on http://localhost:3001"
$ curl localhost:3001/api/health
```

> `HOJE=''` força string vazia? Não — o código usa o padrão quando ausente.
> Para data real, edite `hojeISO()` (doc 01) e faça `pm2 restart led-api --update-env`.

**Etapa 5 — Nginx (painel estático + proxy da API no mesmo domínio — evita CORS):**

```nginx
# /etc/nginx/sites-available/led-control
server {
  listen 80;
  server_name exemplo.com;

  root /var/www/saas-leds/frontend/dist;
  index index.html;

  location / { try_files $uri $uri/ /index.html; }

  location /api/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
  }
}
```

```bash
$ sudo ln -s /etc/nginx/sites-available/led-control /etc/nginx/sites-enabled/
$ sudo nginx -t && sudo systemctl reload nginx
```

Com front+API no mesmo domínio, `VITE_API_URL` pode ser `""` (mesma origem) —
rebuild sem a variável e o proxy do Nginx assume.

**Etapa 6 — HTTPS (Let's Encrypt):**

```bash
$ sudo apt install -y certbot python3-certbot-nginx
$ sudo certbot --nginx -d exemplo.com   # renova sozinho via timer
$ curl -s https://exemplo.com/api/health
```

**Etapa 7 — rotina de produção:**

```bash
$ cd /var/www/saas-leds && git pull
$ cd backend && npm install --omit=dev && pm2 restart led-api
$ cd ../frontend && npm install && VITE_API_URL= npm run build && sudo systemctl reload nginx
$ sqlite3 backend/data.db ".backup '/root/backup-led-$(date +%F).db'"  # backup (apt install sqlite3)
```

Agende o backup com cron diário e copie para fora do servidor (`scp`/S3).

## B.3 Caminho 3 — Vercel (front) + API externa (~15 min)

1. Vercel → Add New Project → repo → Root Directory `frontend`.
2. Build: `npm run build`, Output: `dist`.
3. Env **`VITE_API_URL=https://<sua-api>`** (Render B.1 ou VPS B.2) → Deploy.
4. A API continua num dos caminhos acima (a Vercel não roda o Express).

## B.4 Endurecimento de produção (checklist)

- [ ] `JWT_SECRET` ≥ 32 bytes, único por ambiente, fora do repo.
- [ ] Senhas seed trocadas (`admin`, `regional`, `operador`, `viewer`).
- [ ] CORS restrito: trocar `app.use(cors())` por `cors({ origin: ['https://<painel>'] })` em `backend/src/index.js`.
- [ ] HTTPS ativo + redirect HTTP→HTTPS.
- [ ] Backup diário de `data.db` para fora do host (testar restore 1×/mês).
- [ ] `data.db`, `node_modules`, `dist` fora do git (já no `.gitignore`).
- [ ] Logs: `pm2 logs` / dashboard do host; `GET /api/auditoria` revisada.
- [ ] Migração futura p/ PostgreSQL quando houver múltiplas instâncias da API
      (SQLite = 1 processo escritor; escalar horizontalmente exige Postgres).

## B.5 Diagnóstico em produção

| Sintoma | Verificar |
|---------|-----------|
| Painel `OFFLINE` | API acordada? (`/api/health`); `VITE_API_URL` do build confere? (rebuild se mudou) |
| `leds_ativos 0/4`, tudo vazio | banco zerado (disco efêmero sem volume?) ou filtro `?cidades=` inválido |
| 401 em tudo | token expirado (12h) → login de novo; `JWT_SECRET` mudou invalidando tokens |
| Toasts repetidos/fantasmas | notificações órfãs → reinicie a API (poda no boot remove e loga a contagem) |
| 403 ao autorizar grade | login não é `admin` (só admin autoriza) |
| Deploy quebra no `npm install` | toolchain nativa (B.2 etapa 1) ou versão do Node ≠ 22 |
