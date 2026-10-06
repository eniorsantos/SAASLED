# 06 — Autenticação, perfis e controle por usuário (spec §9.2)

## Login

`POST /api/auth/login` com `{login, senha}` → JWT assinado com
`JWT_SECRET` (padrão `led-control-dev` — **trocar em produção**), expiração
12h, payload `{login, perfil, nome}`. O front guarda `led_token`/`led_perfil`
e busca `GET /api/me` a cada sessão.

Seed: `admin/admin123` · `regional/reg123` (vinculado a `aracaju`) ·
`operador/op123` · `viewer/view123`. Senhas em texto: aceitável só para demo
(SSO/2FA são futuros previstos na spec).

## Perfis (padrões) + recursos por usuário

Recursos (13): `dashboard, planilha, graficos, leds, cidades, campanhas_editar,
reservas, relatorios, importar, exportar, notificacoes, usuarios, config` (`GET /api/recursos`).
O recurso `config` cobre limites, paleta (`/api/tema`), logo e backup, e define quem abre as seções Cores/Logo/Backup.

| Perfil | Padrão |
|--------|--------|
| `admin` | tudo |
| `regional` | tudo, menos `usuarios` e `config` |
| `operador` | dashboard, planilha, graficos, leds, cidades, campanhas_editar, reservas, relatorios, notificacoes (sem importar/exportar) |
| `visualizador` | dashboard, planilha, graficos, notificacoes (leitura) |

O admin concede **recursos extras por usuário** (`permissoes`; efetivas =
padrão do perfil ∪ extras) e vincula **cidades** (`usuario_cidade`, qualquer
perfil): sem vínculo = todas; com vínculo = só elas (dashboard, campanhas,
planilha, exports, reservas, LEDs, spots e central filtram; fora do vínculo
retorna vazio ou 403).

## Escopo de escrita

Recurso sem escopo não basta: não-admin com vínculo só **altera** dados das
suas cidades (`403 fora do seu escopo` caso contrário) — campanhas (criar,
editar inclusive troca de cidade/LED, excluir), reservas, LEDs e spots. Além
disso, campanha exige **cidade do LED = cidade informada** (`400`); o modal do
front ajusta a cidade sozinho ao trocar de LED.

## Travas

Último admin não pode ser rebaixado/excluído; ninguém exclui o próprio login;
toda mutação de usuário vai para a auditoria (`usuario.create/update/delete`).

## Auditoria

Toda mutação chama `log(quem, oque, detalhe)`: login, CRUDs de cidade/LED/
campanha/reserva/programação/usuário, `config.update`, `notificacoes.varredura` e
`programacao.create.autorizada` (com choque + motivo). Leitura em
`GET /api/auditoria` (só admin, últimas 100).
