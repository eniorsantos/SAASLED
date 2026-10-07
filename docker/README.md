# Containerização (pasta `docker/`)

Sobe API + painel com um comando. O SQLite vive no volume `saasled-data`
(sobrevive a rebuilds); o Nginx serve o painel e proxya `/api` (mesma origem).

## Uso

```powershell
cd docker
cp .env.example .env   # e preencha JWT_SECRET (obrigatório)
docker compose up -d --build
docker compose ps
```

- Painel: http://localhost:8080 (login `admin/admin123` no banco vazio)
- API direta: o compose não publica a 3001; para expor, adicione `ports: ["3001:3001"]` no serviço `api`.
- Logs: `docker compose logs -f api` · parar: `docker compose down` (o volume com o banco permanece; `down -v` apaga).

## Variáveis (`.env`)

| Var | Efeito |
|-----|--------|
| `JWT_SECRET` | obrigatório — invalida sessões antigas se mudar |
| `HOJE` | vazio = data real; fixe para simular (ex. testes) |
| `SEED` | `true` = popula o demo na criação (padrão: vazio) |
| `VITE_API_URL` | vazio = via proxy (recomendado) |
| `WEB_PORT` | porta do painel (padrão 8080) |

## Backup do volume

```powershell
docker run --rm -v saasled-data:/data -v ${PWD}:/out alpine cp /data/data.db /out/data-$(Get-Date -Format yyyy-MM-dd).db
```

Ou use a função Backup na tela Configuração (download JSON + restauração).
