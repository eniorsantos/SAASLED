# 05 — Front-end (fluxo §5 + mockup-led-saas)

Vite + React 18 + Recharts 2. Código em `frontend/src/`:
`App.tsx` (telas) · `api.ts` (HTTP + fallback) · `index.css` (paleta) · `main.tsx`.

## Paleta (literal do mockup)

`--bg:#0b1224` · `--panel:#131b32` · `--panel2:#0f1730` · `--border:#232d4a` ·
`--text:#eef1f8` · `--muted:#8b93ab` · `--teal:#2dd4bf` · `--orange:#f5943a` ·
`--blue:#4f8ff7` · `--purple:#8b7cf6` · `--red:#f0546a`.

## Fluxo de telas (§5)

`Login → Dashboard geral → (filtro cidade | gráficos | planilha | detalhe do LED → cadastro | toasts)`.
Filtro de cidade espelhado na URL (`?cidades=`) — link compartilhável (§8.1)
e **vale para tudo**: dashboard, planilha, LEDs, reservas, notificações e
selects; só em **Todas** os dados unificam. Trocar de cidade limpa LED
selecionado e toasts dispensados;
breadcrumb `Todas as cidades → Cidade → LED`; clique na barra de cidade filtra;
clique na linha do Gantt seleciona o LED e libera "+ Nova campanha".

## Cards (iguais ao mockup)

Topbar (brand, LIVE, 4 KPIs, filtro, período, botões **📺 LEDs**, **🗓️ Reservas**,
**🏙️ Cidades**, **👥 Usuários**, sininho, perfil/sair — cada um só com o recurso) ·
Ocupação por LED (Gantt com **um bloco por campanha, com o nome** — veiculando
em teal, `RESERVADA · NOME` em roxo, `ENCERRADA · NOME` apagado — e LIVRE só no
restante; tooltip com período e status; **selo `x/8 espaços`** por painel) ·
Distribuição por status (seletor Rosca/Pizza/Barras horizontais, % reais: veiculando vs. reservadas
vs. livres) · Ocupação por cidade (barras de inventário: veiculando+reservadas ÷ 8) · A vencer (só `a_vencer`) + **A iniciar**
(`agendada` + reservas próximas, com estados vazios próprios) ·
Abas **Dashboard (todas as linhas, com rolagem e contador) / Visualizar como planilha / Gráficos / Reservas** (rosca→linha
latência medida do fetch e período dinâmico.

## Comportamentos que importam

- **Visibilidade por usuário** (`/api/me`): abas planilha/gráficos/reservas,
  botões LEDs/Reservas/Cidades/Usuários, import/export, ações de campanha e
  reservas, edição inline e sininho/toasts só aparecem com o recurso (offline:
  abas planilha/gráficos liberadas com dados do mockup); aba padrão cai para
  Dashboard se a atual for vetada (com permissões carregadas).
- **Menu 🗓️ Reservas** (recurso `reservas`, botão na topbar abre a **janela**
  como o cadastro de LEDs): **aba Reservas** e janela com o mesmo conteúdo —
  tabela global (anunciante, LED, cidade, período) + criar (campanha +
  anunciante + período) e excluir; **Editar abre janela independente** com a
  campanha de contexto, anunciante e período. Janela e aba funcionam de forma
  independente (conteúdo compartilhado).
- **Menu 🏙️ Cidades** (recurso `cidades`): tabela (id, nome, UF, fuso) +
  **＋ Nova cidade**, **Editar** (id não renomeia) e **Excluir** (só vazia).
- **Menu 📺 LEDs** (recurso `leds`): tabela de painéis com `x/8 espaços`,
  **＋ Novo LED** (código, endereço, cidade), **Editar** (renomear move tudo
  junto) e **Excluir** (só LED vazio).
- **Tela Configurações** (botão topbar ⚙️ + ← Voltar; recurso `usuarios`, `cidades` ou `config`): troca o painel, com seções
  **Acesso** (controle de usuários), **Cidades** (cadastro) e **Cores** (paleta); sem seção
  permitida, volta ao painel.
- **Tema**: paleta lida de `/api/tema` e aplicada nas variáveis CSS (painel,
  fontes, Gantt, dots via `corStatus()`); gráficos Recharts usam os valores
  (rosca vem com as cores da API); formulário com color picker por variável +
  Salvar/Restaurar padrão.
- **Planilha com CRUD + importação + reservas**: botão **＋ Nova campanha**,
  coluna **Ações** (Editar, **Reservas**, Excluir); modal Reservas lista os
  períodos com o anunciante de cada um e adiciona/exclui (anunciante vazio =
  o da campanha); modal de campanha ajusta a **cidade sozinho ao trocar de
  LED** (nunca grava cidade≠cidade do LED); status `a_vencer` mostra `Nd` ou
  `encerra hoje`; **⬆ Importar**
  + **Modelo** com relatório criadas/ignoradas inline. LED lotado volta `409`.
- **Toasts de sessão**: aparecem em todo login/refresh, arrastáveis pelo título
  (⠿, com captura de ponteiro — vira flutuante ao arrastar), com Ver campanha
  (vai à planilha, busca o anunciante e pisca a linha; extrai o nome do texto
  se a API não mandar; sem permissão carregada não desvia de aba) e Fechar
  (dispensa só local); sininho com Ver campanha + Marcar como lida; modais de
  cadastro com 945px (LEDs: 1440px), sempre limitados à viewport, rolagem
  interna e tabela com rolagem horizontal.
- **Polling 30s** recarrega dashboard + planilha + notificações **+ cidades e
  LEDs**; respostas vazias **substituem** o estado (sem dados velhos) e filtros
  sem resultado mostram estado vazio — nunca linhas de outra cidade.
- **Edição inline** da planilha usa o `id` da linha (`PUT /api/campanhas/:id`).
- **Exports** (`.xlsx`/`.csv`) levam cidade + busca + status + token atuais.
- **Offline**: sem API, `FALLBACK_DASH` + linhas do mockup (badge `OFFLINE`);
  login com erro entra em modo offline de leitura.
- Sessão em `localStorage` (`led_token`, `led_perfil`); 401 com token velho desloga sozinho (volta ao login); sininho abre a central
  com "Marcar como lida". Navegação da topbar rola até o painel.

## Build

```powershell
cd frontend; npm install; npm run dev      # :5173 (proxy /api → :3001)
npm run build                               # tsc + vite → dist/
```
