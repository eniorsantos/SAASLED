import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line } from 'recharts'
import './index.css'
import { api, salvarTema, FALLBACK_DASH, corStatus, STATUS_ROTULO, br, type Dashboard, type Me, type Notif, type PlanilhaRow } from './api'

type Tab = 'dashboard' | 'planilha' | 'graficos' | 'reservas'
type SecaoConfig = 'acesso' | 'cidades' | 'tema'

// Toast arrastável: aparece em todo login/refresh; fechar só dispensa nesta
// sessão (não marca como lida — isso é feito na central). Arraste pelo título.
function ToastItem({ n, onView, onClose }: { n: Notif; onView: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; w: number } | null>(null);
  const grab = useRef<{ dx: number; dy: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    grab.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* sem captura: arrasto parcial */ }
  };
  const onMove = (e: React.PointerEvent) => {
    const g = grab.current;
    if (!g || !ref.current) return;
    setPos({ x: e.clientX - g.dx, y: e.clientY - g.dy, w: ref.current.offsetWidth });
  };
  const onUp = () => { grab.current = null; };
  return (
    <div ref={ref} className={`toast ${n.evento === 'vencimento' ? 'red' : ''}`}
      style={pos ? { position: 'fixed', left: pos.x, top: pos.y, width: pos.w, margin: 0, zIndex: 60 } : undefined}>
      <b style={{ cursor: 'move', touchAction: 'none', userSelect: 'none' }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        title="Arraste para mover">⠿ {n.titulo}</b>
      {n.corpo}
      <div className="actions">
        <button onClick={onView}>Ver campanha</button>
        <button onClick={onClose}>Fechar</button>
      </div>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('led_token') || '')
  const [perfil, setPerfil] = useState(() => localStorage.getItem('led_perfil') || '');
  const isAdmin = perfil === 'admin';
  const [login, setLogin] = useState('admin');
  const [senha, setSenha] = useState('admin123');
  const [loginErro, setLoginErro] = useState('');
  const [cidade, setCidade] = useState(() => new URLSearchParams(location.search).get('cidades') || '');
  const [tab, setTab] = useState<Tab>('planilha');
  const [dash, setDash] = useState<Dashboard>(FALLBACK_DASH);
  const [online, setOnline] = useState(false);
  const [rows, setRows] = useState<PlanilhaRow[]>([]);
  const [q, setQ] = useState(''); const [stFilter, setStFilter] = useState('');
  const [importMsg, setImportMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  // Seleção múltipla da planilha (exclusão em lote)
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const alternarSelecao = (id: string) =>
    setSelecionadas((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
  const excluirSelecionadas = async () => {
    if (!selecionadas.length) return;
    if (!confirm(`Excluir ${selecionadas.length} campanha(s)?`)) return;
    try {
      const r = await api.excluirLote(selecionadas);
      setSelecionadas([]);
      setImportMsg({
        tipo: r.ignoradas.length ? 'erro' : 'ok',
        texto: `Excluídas ${r.excluidas.length}.${r.ignoradas.length ? ` Ignoradas: ${r.ignoradas.map((x) => `${x.id} (${x.motivo})`).join(' · ')}` : ''}`,
      });
      carregar();
    } catch (e: any) { setImportMsg({ tipo: 'erro', texto: e.message }); }
  };
  // Toasts dispensados nesta sessão (voltam no próximo login/refresh)
  const [dismissed, setDismissed] = useState<(number | string)[]>([]);
  // Tipo de gráfico da distribuição por status
  const [tipoDist, setTipoDist] = useState<'rosca' | 'pizza' | 'barras'>('rosca');
  // Navegação: troca a aba e rola até o painel (senão parece que nada aconteceu)
  const painelRef = useRef<HTMLDivElement>(null);
  const irParaAba = (t: Tab, secao?: SecaoConfig) => {
    setTab(t);
    if (secao) setConfigSecao(secao);
    setTimeout(() => painelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };
  const [destaque, setDestaque] = useState<string | null>(null);
  const extrairAnunciante = (n: Notif): string | null => {
    if (n.anunciante) return n.anunciante;
    const t = (n.corpo || '').replace(/^Reserva de /i, '');
    const m = t.match(/^(.*?)\s+(inicia em|encerra em|·)/);
    const nome = (m ? m[1] : t.split('·')[0]).trim();
    return nome || null;
  };
  const verCampanha = (n: Notif) => {
    if (online && me && !can('planilha')) { setTab('dashboard'); return; }
    irParaAba('planilha');
    const nome = extrairAnunciante(n);
    if (nome) setQ(nome);
    setStFilter('');
    trocarCidade('');
    setDestaque(n.campanha_ref || null);
  };
  useEffect(() => {
    if (!destaque) return;
    const t = setTimeout(() => setDestaque(null), 5000);
    return () => clearTimeout(t);
  }, [destaque]);
  // dias de hoje (dash.hoje) até a data: >0 faltam, 0 encerra hoje, <0 encerrou
  const diasAte = (iso: string) => Math.round(
    (new Date(iso + 'T12:00:00').getTime() - new Date(dash.hoje + 'T12:00:00').getTime()) / 86400000);
  const [sortK, setSortK] = useState('inicio'); const [sortD, setSortD] = useState<1 | -1>(1);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [sino, setSino] = useState(false);
  const [ledSel, setLedSel] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [lat, setLat] = useState('0.6s');
  const [form, setForm] = useState({ anunciante: '', led_codigo: 'AJU 01', cidade_id: 'aracaju', inicio: '2026-11-01', fim: '2026-12-01', reservada: false });
  const [editCampId, setEditCampId] = useState<string | null>(null);
  // Menu de cadastro de LEDs (padrão visual do painel)
  const [cidades, setCidades] = useState<{ id: string; nome: string; uf: string }[]>([]);
  const [ledsLista, setLedsLista] = useState<any[]>([]);
  const [ledsMenu, setLedsMenu] = useState(false);
  // Controle de acesso: o que este usuário pode ver/fazer (vem de /api/me)
  const [me, setMe] = useState<Me | null>(null);
  const can = (recurso: string) => online && !!me?.efetivas?.includes(recurso);
  const temConfig = can('usuarios') || can('cidades') || can('config');
  // Menu de usuários (admin): CRUD + cidades + recursos por usuário
  const [usersLista, setUsersLista] = useState<any[]>([]);
  const [recursosLista, setRecursosLista] = useState<{ id: string; rotulo: string }[]>([]);
  const [userForm, setUserForm] = useState({ login: '', senha: '', perfil: 'visualizador', nome: '', cidades: [] as string[], permissoes: [] as string[] });
  const [userEditando, setUserEditando] = useState<string | null>(null);
  const [userMsg, setUserMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  // Múltiplas reservas por campanha (cada uma notifica o início próximo)
  const [resMenu, setResMenu] = useState<{ campId: string; anunciante: string; led: string } | null>(null);
  const [resLista, setResLista] = useState<any[]>([]);
  const [resForm, setResForm] = useState({ anunciante: '', inicio: '2026-12-01', fim: '2026-12-31' });
  const [resMsg, setResMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  // Menu global de cadastro de reservas (padrão LEDs/Usuários)
  const [resListaG, setResListaG] = useState<any[]>([]);
  const [resCamps, setResCamps] = useState<any[]>([]);
  const [resFormG, setResFormG] = useState({ campanha_id: '', anunciante: '', inicio: '2026-12-01', fim: '2026-12-31' });
  // Janela independente de edição de reserva (a criação fica no formulário)
  const [resEditM, setResEditM] = useState<{ id: string; campLabel: string; anunciante: string; inicio: string; fim: string } | null>(null);
  const [resMsgM, setResMsgM] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [resMsgG, setResMsgG] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [ledForm, setLedForm] = useState({ codigo: '', endereco: '', cidade_id: 'aracaju' });
  const [ledEditando, setLedEditando] = useState<string | null>(null);
  const [ledMsg, setLedMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  // Tema (paleta configurável): lido da API e aplicado nas variáveis CSS
  const [tema, setTema] = useState<{ vars: Record<string, string>; rotulos: Record<string, string> }>({ vars: {}, rotulos: {} });
  const [temaMsg, setTemaMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [configSecao, setConfigSecao] = useState<SecaoConfig>('acesso');
  // Tela cheia de configurações (troca o painel; LEDs/Usuários/Cidades moram aqui)
  const [tela, setTela] = useState<'painel' | 'config'>('painel');
  // Menu de cadastro de cidades (id, nome, UF, fuso — padrão do banco)
  const [cidForm, setCidForm] = useState({ id: '', nome: '', uf: '', fuso: 'America/Maceio' });
  const [cidEditando, setCidEditando] = useState<string | null>(null);
  const [cidMsg, setCidMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const carregar = useCallback(async () => {
    const t0 = performance.now();
    try {
      const [d, p, n, cids, leds] = await Promise.all([
        api.dashboard(cidade),
        api.planilha(cidade).catch(() => [] as PlanilhaRow[]),
        api.notificacoes(cidade).catch(() => [] as Notif[]),
        api.cidades().catch(() => [] as { id: string; nome: string; uf: string }[]),
        api.leds(cidade).catch(() => [] as any[]),
      ]);
      const m = await api.me().catch(() => null);
      setDash(d); setOnline(true);
      try {
        const t = await api.tema().catch(() => null);
        if (t) setTema(t);
      } catch { /* mantém paleta padrão */ }
      setRows(p); setNotifs(n.map((x) => ({ ...x, titulo: x.titulo, corpo: x.corpo })));
      if (m) setMe(m);
      if (cids.length) setCidades(cids);
      if (leds.length) setLedsLista(leds);
      setLat(`${((performance.now() - t0) / 1000).toFixed(1)}s`);
    } catch { setOnline(false); }
  }, [cidade]);

  useEffect(() => { carregar(); const i = setInterval(carregar, 30000); return () => clearInterval(i); }, [carregar]);

  // Importação de planilha no padrão Cidade;LED;Anunciante;Início;Fim
  const importarArquivo = async (file: File | undefined) => {
    if (!file) return;
    setImportMsg(null);
    try {
      const csv = await file.text();
      const r = await api.importarPlanilha(csv);
      const det = r.ignoradas.length
        ? ` Ignoradas (${r.ignoradas.length}): ` + r.ignoradas.slice(0, 5).map((x) => `linha ${x.linha} (${x.motivo})`).join(' · ') + (r.ignoradas.length > 5 ? ' …' : '')
        : '';
      const res = r.reservas_criadas ? ` (+${r.reservas_criadas} reserva(s))` : '';
      setImportMsg({ tipo: r.ignoradas.length ? 'erro' : 'ok', texto: `Importadas ${r.criadas} de ${r.total}${res}.${det}` });
      carregar();
    } catch (e: any) { setImportMsg({ tipo: 'erro', texto: e.message }); }
  };

  // Opções do filtro de cidade: sempre da API (novas cidades aparecem sozinhas)
  const cidadesOpts = cidades.length
    ? cidades
    : [{ id: 'aracaju', nome: 'Aracaju', uf: 'SE' }, { id: 'salvador', nome: 'Salvador', uf: 'BA' }];
  const cidadeNome = (id: string) => cidadesOpts.find((c) => c.id === id)?.nome || id || 'Todas';

  const trocarCidade = (v: string) => {
    setCidade(v); setSelecionadas([]);
    setDismissed([]);
    // LED selecionado fora da cidade sai da seleção
    if (ledSel) {
      const todos = [...ledsLista, ...dash.gantt_por_led];
      const led = todos.find((l: any) => l.codigo === ledSel);
      if (led && v && led.cidade_id !== v) setLedSel(null);
    }
    const u = new URL(location.href);
    if (!v) u.searchParams.delete('cidades'); else u.searchParams.set('cidades', v);
    history.replaceState({}, '', u);
  };

  const linhas = useMemo(() => {
    let r = [...rows];
    if (q) { const s = q.toLowerCase(); r = r.filter((x) => [x.cidade, x.led, x.anunciante].join(' ').toLowerCase().includes(s)); }
    if (stFilter) r = r.filter((x) => x.status === stFilter);
    r.sort((a, b) => String((a as any)[sortK]).localeCompare(String((b as any)[sortK])) * sortD);
    return r;
  }, [rows, q, stFilter, sortK, sortD]);

  // Gantt: um bloco por campanha COM NOME (veiculando, reservada e vencida) +
  // LIVRE completando — LED nunca parece vazio havendo campanhas
  const ganttBlocos = (camps: any[]) => {
    const clsPorStatus: Record<string, string> = { veiculando: 'veic', a_vencer: 'veic', agendada: 'res', reservada: 'res', vencida: 'venc' };
    const rotuloStatus: Record<string, string> = { agendada: 'RESERVADA', reservada: 'RESERVADA', vencida: 'ENCERRADA' };
    const blocos: { cls: string; label: string; w: number; title?: string }[] = camps.map((c: any) => {
      const cls = clsPorStatus[c.status] || 'veic';
      const pre = rotuloStatus[c.status] ? `${rotuloStatus[c.status]} · ` : '';
      return {
        cls, label: `${pre}${String(c.anunciante).toUpperCase()}`, w: 0,
        title: `${c.anunciante} · ${br(c.inicio)} → ${br(c.fim)} · ${STATUS_ROTULO[c.status] || c.status}`,
      };
    });
    if (!blocos.length) return [{ cls: 'livre', label: 'LIVRE', w: 96 }];
    const w = Math.min(40, Math.max(10, Math.floor(88 / blocos.length)));
    blocos.forEach((b) => { b.w = w; });
    const usado = w * blocos.length;
    if (usado < 90) blocos.push({ cls: 'livre', label: 'LIVRE', w: 96 - usado });
    return blocos;
  };

  const fazerLogin = async () => {
    try {
      const r = await api.login(login, senha);
      localStorage.setItem('led_token', r.token); localStorage.setItem('led_perfil', r.perfil);
      setToken(r.token); setPerfil(r.perfil); setLoginErro(''); setDismissed([]); carregar();
    }
    catch { setLoginErro('Login inválido — use admin/admin123 (demo). Entrando offline…'); setToken('offline'); }
  };
  const sair = () => { localStorage.removeItem('led_token'); localStorage.removeItem('led_perfil'); setToken(''); setPerfil(''); };

  const salvarInline = async (row: PlanilhaRow, campo: 'anunciante' | 'inicio' | 'fim', valor: string) => {
    try {
      if (row.id) await api.editarCampanha(row.id, { [campo]: valor });
      else {
        const camp = await api.campanhas().then((cs) => cs.find((c: any) => c.anunciante === row.anunciante && c.led_codigo === row.led));
        if (!camp) return;
        await api.editarCampanha(camp.id, { [campo]: valor });
      }
      carregar();
    } catch (e: any) { alert(e.message); }
  };
  const podeEditar = can('campanhas_editar');

  // Aplica a paleta nas variáveis CSS (painel, fontes, gráficos via corStatus)
  useEffect(() => {
    const root = document.documentElement;
    for (const [k, v] of Object.entries(tema.vars || {})) root.style.setProperty(`--${k}`, v);
  }, [tema]);

  // Aba padrão respeita a visibilidade do usuário (só com permissões carregadas)
  useEffect(() => {
    if (!me || !online) return;
    if (tab === 'planilha' && !can('planilha')) setTab('dashboard');
    else if (tab === 'graficos' && !can('graficos')) setTab('dashboard');
    else if (tab === 'reservas' && !can('reservas')) setTab('dashboard');
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps

  const criarCampanha = async () => {
    try {
      if (editCampId) {
        await api.editarCampanha(editCampId, { ...form, reservada: form.reservada ? 1 : 0 });
      } else {
        await api.criarCampanha({ ...form, id: 'c' + Date.now(), cidade_id: form.cidade_id || cidade || 'aracaju', reservada: form.reservada ? 1 : 0 });
      }
      setModal(false); setEditCampId(null); carregar();
    } catch (e: any) { alert(e.message); }
  };
  const abrirNovaCampanha = (led?: string) => {
    setEditCampId(null);
    setForm({ anunciante: '', led_codigo: led || 'AJU 01', cidade_id: cidade || 'aracaju', inicio: '2026-11-01', fim: '2026-12-01', reservada: false });
    setModal(true);
  };
  const abrirEditarCampanha = async (row: PlanilhaRow) => {
    let id: string | undefined = row.id;
    if (!id) {
      const camp = await api.campanhas().then((cs) => cs.find((c: any) => c.anunciante === row.anunciante && c.led_codigo === row.led)).catch(() => null);
      if (!camp) return;
      id = camp.id;
    }
    if (!id) return;
    const camp = await api.campanhas().then((cs) => cs.find((c: any) => c.id === id)).catch(() => null);
    setEditCampId(id);
    setForm({
      anunciante: row.anunciante,
      led_codigo: row.led,
      cidade_id: camp?.cidade_id || cidade || 'aracaju',
      inicio: row.inicio, fim: row.fim,
      reservada: (camp?.reservada ? true : row.status === 'agendada' || row.status === 'reservada'),
    });
    setModal(true);
  };
  const excluirCampanha = async (row: PlanilhaRow) => {
    let id: string | undefined = row.id;
    if (!id) {
      const camp = await api.campanhas().then((cs) => cs.find((c: any) => c.anunciante === row.anunciante && c.led_codigo === row.led)).catch(() => null);
      if (!camp) return;
      id = camp.id;
    }
    if (!id) return;
    if (!confirm(`Excluir a campanha "${row.anunciante}" (${row.led})?`)) return;
    try { await api.excluirCampanha(id); carregar(); } catch (e: any) { alert(e.message); }
  };

  // Dados de acesso para a aba Config (usuários + catálogo de recursos)
  const carregarAcesso = useCallback(async () => {
    setUserMsg(null);
    try {
      const [us, recs] = await Promise.all([api.usuarios(), api.recursos()]);
      setUsersLista(us); setRecursosLista(recs);
    } catch (e: any) { setUserMsg({ tipo: 'erro', texto: e.message }); }
  }, []);
  const alternar = (lista: string[], v: string) =>
    lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v];
  const salvarUsuario = async () => {
    setUserMsg(null);
    if (!userForm.login.trim() || (!userEditando && !userForm.senha)) {
      setUserMsg({ tipo: 'erro', texto: 'Preencha login e senha.' });
      return;
    }
    try {
      if (userEditando) {
        const body: any = { perfil: userForm.perfil, nome: userForm.nome, cidades: userForm.cidades, permissoes: userForm.permissoes };
        if (userForm.senha) body.senha = userForm.senha;
        await api.editarUsuario(userEditando, body);
        setUserMsg({ tipo: 'ok', texto: 'Usuário atualizado.' });
      } else {
        await api.criarUsuario(userForm);
        setUserMsg({ tipo: 'ok', texto: `Usuário ${userForm.login} criado.` });
      }
      setUserForm({ login: '', senha: '', perfil: 'visualizador', nome: '', cidades: [], permissoes: [] });
      setUserEditando(null);
      setUsersLista(await api.usuarios());
      carregar();
    } catch (e: any) { setUserMsg({ tipo: 'erro', texto: e.message }); }
  };
  const excluirUsuario = async (login: string) => {
    if (!confirm(`Excluir o usuário "${login}"?`)) return;
    try { await api.excluirUsuario(login); setUsersLista(await api.usuarios()); }
    catch (e: any) { setUserMsg({ tipo: 'erro', texto: e.message }); }
  };

  // Múltiplas reservas: N períodos futuros por campanha, cada um com toast
  const abrirReservas = async (row: PlanilhaRow) => {
    let id: string | undefined = row.id;
    if (!id) {
      const camp = await api.campanhas().then((cs) => cs.find((c: any) => c.anunciante === row.anunciante && c.led_codigo === row.led)).catch(() => null);
      if (!camp) return;
      id = camp.id;
    }
    if (!id) return;
    setResMenu({ campId: id, anunciante: row.anunciante, led: row.led });
    setResMsg(null);
    setResForm({ anunciante: '', inicio: '2026-12-01', fim: '2026-12-31' });
    try { setResLista(await api.reservas(id)); } catch (e: any) { setResMsg({ tipo: 'erro', texto: e.message }); }
  };
  const salvarReserva = async () => {
    if (!resMenu) return;
    setResMsg(null);
    try {
      await api.criarReserva(resMenu.campId, resForm);
      setResLista(await api.reservas(resMenu.campId));
      setResMsg({ tipo: 'ok', texto: 'Reserva adicionada — avisaremos o início próximo.' });
      carregar();
    } catch (e: any) { setResMsg({ tipo: 'erro', texto: e.message }); }
  };
  const excluirReserva = async (id: string) => {
    if (!resMenu || !confirm('Excluir esta reserva?')) return;
    try { await api.excluirReserva(id); setResLista(await api.reservas(resMenu.campId)); carregar(); }
    catch (e: any) { setResMsg({ tipo: 'erro', texto: e.message }); }
  };

  // Aba de reservas: carrega lista global + campanhas ao abrir
  const carregarAbaReservas = useCallback(async () => {
    try {
      const [lista, camps] = await Promise.all([api.listarReservas(cidade), api.campanhas()]);
      setResListaG(lista); setResCamps(camps);
      if (camps.length) setResFormG((f) => (f.campanha_id ? f : { ...f, campanha_id: camps[0].id }));
    } catch (e: any) { setResMsgG({ tipo: 'erro', texto: e.message }); }
  }, [cidade]);
  useEffect(() => {
    if (tab === 'reservas' && can('reservas')) carregarAbaReservas();
  }, [tab, me, cidade]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (tela !== 'config') return;
    if (configSecao === 'acesso' && !can('usuarios')) {
      if (can('cidades')) setConfigSecao('cidades');
      else if (can('config')) setConfigSecao('tema');
    } else if (configSecao === 'cidades' && !can('cidades')) {
      if (can('usuarios')) setConfigSecao('acesso');
      else if (can('config')) setConfigSecao('tema');
    } else if (configSecao === 'tema' && !can('config')) {
      if (can('usuarios')) setConfigSecao('acesso');
      else if (can('cidades')) setConfigSecao('cidades');
    }
    if (can('usuarios')) carregarAcesso();
  }, [tela, me]); // eslint-disable-line react-hooks/exhaustive-deps

  // Menu global de reservas: lista tudo + criar/editar/excluir
  const [resModal, setResModal] = useState(false);
  const conteudoReservas = () => (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Anunciante</th><th>LED</th><th>Cidade</th><th>Início</th><th>Fim</th><th>Ações</th></tr></thead>
          <tbody>
            {resListaG.map((r: any) => (
              <tr key={r.id}>
                <td><b>{r.anunciante}</b></td><td>{r.led_codigo}</td><td>{r.cidade_nome}</td>
                <td>{br(r.inicio)}</td><td>{br(r.fim)}</td>
                <td className="row-actions">
                  <button onClick={() => abrirEdicaoReserva(r)}>Editar</button>
                  <button className="danger" onClick={() => excluirReservaGlobal(r.id)}>Excluir</button>
                </td>
              </tr>
            ))}
            {resListaG.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--muted)', textAlign: 'center' }}>Nenhuma reserva cadastrada.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="spot-form">
        <h2 style={{ fontSize: '.85rem' }}>＋ NOVA RESERVA</h2>
        <label>Campanha
          <select value={resFormG.campanha_id} onChange={(e) => setResFormG({ ...resFormG, campanha_id: e.target.value })}>
            {resCamps.map((c: any) => (
              <option key={c.id} value={c.id}>{c.anunciante} · {c.led_codigo} ({br(c.inicio)}→{br(c.fim)})</option>
            ))}
          </select>
        </label>
        <div className="spot-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <label>Anunciante (vazio = o da campanha)<input value={resFormG.anunciante} onChange={(e) => setResFormG({ ...resFormG, anunciante: e.target.value })} /></label>
          <label>Início<input type="date" value={resFormG.inicio} onChange={(e) => setResFormG({ ...resFormG, inicio: e.target.value })} /></label>
          <label>Fim<input type="date" value={resFormG.fim} onChange={(e) => setResFormG({ ...resFormG, fim: e.target.value })} /></label>
        </div>
        {resMsgG && <p className={`spot-msg ${resMsgG.tipo === 'ok' ? 'ok' : 'erro'}`}>{resMsgG.texto}</p>}
        <div className="toolbar" style={{ marginTop: 8, marginBottom: 0 }}>
          <button onClick={salvarReservaGlobal}>Adicionar reserva</button>
        </div>
      </div>
    </>
  );
  // Menu global de reservas: lista tudo + criar/editar/excluir
  const abrirReservasMenu = async () => {
    setResModal(true); setResMsgG(null);
    carregarAbaReservas();
  };
  // Janela independente de edição: não usa o formulário de criação
  const abrirEdicaoReserva = (r: any) => {
    const camp = resCamps.find((c: any) => c.id === r.campanha_id);
    setResMsgM(null);
    setResEditM({
      id: r.id,
      campLabel: camp ? `${camp.anunciante} · ${camp.led_codigo} (${br(camp.inicio)}→${br(camp.fim)})` : r.campanha_id,
      anunciante: r.anunciante, inicio: r.inicio, fim: r.fim,
    });
  };
  const salvarEdicaoReserva = async () => {
    if (!resEditM) return;
    setResMsgM(null);
    try {
      await api.editarReserva(resEditM.id, { anunciante: resEditM.anunciante, inicio: resEditM.inicio, fim: resEditM.fim });
      setResEditM(null);
      setResListaG(await api.listarReservas(cidade));
      setResMsgG({ tipo: 'ok', texto: 'Reserva atualizada.' });
      carregar();
    } catch (e: any) { setResMsgM({ tipo: 'erro', texto: e.message }); }
  };
  const salvarReservaGlobal = async () => {
    setResMsgG(null);
    if (!resFormG.campanha_id || !resFormG.inicio || !resFormG.fim) {
      setResMsgG({ tipo: 'erro', texto: 'Escolha a campanha e o período.' });
      return;
    }
    try {
      await api.criarReserva(resFormG.campanha_id, resFormG);
      setResFormG({ campanha_id: resFormG.campanha_id, anunciante: '', inicio: '2026-12-01', fim: '2026-12-31' });
      setResListaG(await api.listarReservas(cidade));
      setResMsgG({ tipo: 'ok', texto: 'Reserva salva — avisaremos o início próximo.' });
      carregar();
    } catch (e: any) { setResMsgG({ tipo: 'erro', texto: e.message }); }
  };
  const excluirReservaGlobal = async (id: string) => {
    if (!confirm('Excluir esta reserva?')) return;
    try { await api.excluirReserva(id); setResListaG(await api.listarReservas(cidade)); carregar(); }
    catch (e: any) { setResMsgG({ tipo: 'erro', texto: e.message }); }
  };

  // Menu de cidades: incluir / editar / excluir (conforme tabela cidades)
  const salvarCidade = async () => {
    setCidMsg(null);
    if (!cidForm.id.trim() || !cidForm.nome.trim()) {
      setCidMsg({ tipo: 'erro', texto: 'Preencha id e nome.' });
      return;
    }
    try {
      if (cidEditando) {
        await api.editarCidade(cidEditando, { nome: cidForm.nome, uf: cidForm.uf, fuso: cidForm.fuso });
        setCidMsg({ tipo: 'ok', texto: 'Cidade atualizada.' });
      } else {
        const { status, body } = await api.criarCidade(cidForm);
        if (status !== 201) { setCidMsg({ tipo: 'erro', texto: body?.erro || `Falha (HTTP ${status}).` }); return; }
        setCidMsg({ tipo: 'ok', texto: `Cidade ${cidForm.nome} cadastrada.` });
      }
      setCidForm({ id: '', nome: '', uf: '', fuso: 'America/Maceio' }); setCidEditando(null);
      carregar();
    } catch (e: any) { setCidMsg({ tipo: 'erro', texto: e.message }); }
  };
  const excluirCidade = async (id: string) => {
    if (!confirm(`Excluir a cidade "${id}"? (só vazia)`)) return;
    try { await api.excluirCidade(id); carregar(); }
    catch (e: any) { setCidMsg({ tipo: 'erro', texto: e.message }); }
  };

  // Conteúdo compartilhado: Usuários (aba Config + uso interno)
  const conteudoUsuarios = () => (
    <>
      <div className="table-scroll">
      <table>
        <thead><tr><th>Login</th><th>Nome</th><th>Perfil</th><th>Cidades</th><th>Recursos</th><th>Ações</th></tr></thead>
        <tbody>
          {usersLista.map((u: any) => (
            <tr key={u.login}>
              <td><b>{u.login}</b></td><td>{u.nome}</td><td>{u.perfil}</td>
              <td style={{ fontSize: '.7rem' }}>{u.cidades.length ? u.cidades.join(', ') : 'todas'}</td>
              <td style={{ fontSize: '.7rem' }}>{u.efetivas.join(', ')}</td>
              <td className="row-actions">
                <button onClick={() => { setUserEditando(u.login); setUserForm({ login: u.login, senha: '', perfil: u.perfil, nome: u.nome, cidades: u.cidades, permissoes: u.permissoes }); }}>Editar</button>
                <button className="danger" onClick={() => excluirUsuario(u.login)}>Excluir</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <div className="spot-form">
        <h2 style={{ fontSize: '.85rem' }}>{userEditando ? `EDITAR ${userEditando}` : '＋ NOVO USUÁRIO'}</h2>
        <div className="spot-row">
          <label>Login<input value={userForm.login} disabled={!!userEditando} onChange={(e) => setUserForm({ ...userForm, login: e.target.value })} /></label>
          <label>{userEditando ? 'Nova senha (vazio mantém)' : 'Senha'}<input type="password" value={userForm.senha} onChange={(e) => setUserForm({ ...userForm, senha: e.target.value })} /></label>
          <label>Perfil
            <select value={userForm.perfil} onChange={(e) => setUserForm({ ...userForm, perfil: e.target.value })}>
              <option value="admin">admin</option>
              <option value="regional">regional</option>
              <option value="operador">operador</option>
              <option value="visualizador">visualizador</option>
            </select>
          </label>
        </div>
        <label>Nome<input value={userForm.nome} onChange={(e) => setUserForm({ ...userForm, nome: e.target.value })} /></label>
        <label>Cidades que pode ver (vazio = todas)
          <div className="perm-grid">
            {(cidades.length ? cidades : [{ id: 'aracaju', nome: 'Aracaju' }]).map((c: any) => (
              <label key={c.id} className="check"><input type="checkbox"
                checked={userForm.cidades.includes(c.id)}
                onChange={() => setUserForm({ ...userForm, cidades: alternar(userForm.cidades, c.id) })} />{c.nome}</label>
            ))}
          </div>
        </label>
        <label>Recursos extras além do perfil
          <div className="perm-grid">
            {recursosLista.map((r) => (
              <label key={r.id} className="check"><input type="checkbox"
                checked={userForm.permissoes.includes(r.id)}
                onChange={() => setUserForm({ ...userForm, permissoes: alternar(userForm.permissoes, r.id) })} />{r.rotulo}</label>
            ))}
          </div>
        </label>
        {userMsg && <p className={`spot-msg ${userMsg.tipo === 'ok' ? 'ok' : 'erro'}`}>{userMsg.texto}</p>}
        <div className="toolbar" style={{ marginTop: 8, marginBottom: 0 }}>
          <button onClick={salvarUsuario}>{userEditando ? 'Salvar alterações' : 'Criar usuário'}</button>
          {userEditando && <button className="ghost" onClick={() => { setUserEditando(null); setUserForm({ login: '', senha: '', perfil: 'visualizador', nome: '', cidades: [], permissoes: [] }); }}>Cancelar edição</button>}
        </div>
      </div>
    </>
  );

  // Conteúdo compartilhado: Cidades (aba Config)
  const conteudoCidades = () => (
    <>
      <div className="table-scroll">
      <table>
        <thead><tr><th>ID</th><th>Nome</th><th>UF</th><th>Fuso</th><th>Ações</th></tr></thead>
        <tbody>
          {(cidades.length ? cidades : []).map((c: any) => (
            <tr key={c.id}>
              <td><b>{c.id}</b></td><td>{c.nome}</td><td>{c.uf}</td><td style={{ fontSize: '.7rem' }}>{c.fuso}</td>
              <td className="row-actions">
                <button onClick={() => { setCidEditando(c.id); setCidForm({ id: c.id, nome: c.nome, uf: c.uf || '', fuso: c.fuso || 'America/Maceio' }); }}>Editar</button>
                <button className="danger" onClick={() => excluirCidade(c.id)}>Excluir</button>
              </td>
            </tr>
          ))}
          {cidades.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--muted)' }}>Nenhuma cidade cadastrada.</td></tr>}
        </tbody>
      </table>
      </div>
      <div className="spot-form">
        <h2 style={{ fontSize: '.85rem' }}>{cidEditando ? `EDITAR ${cidEditando}` : '＋ NOVA CIDADE'}</h2>
        <div className="spot-row" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
          <label>ID<input placeholder="recife" value={cidForm.id} disabled={!!cidEditando} onChange={(e) => setCidForm({ ...cidForm, id: e.target.value.toLowerCase().trim() })} /></label>
          <label>Nome<input placeholder="Recife" value={cidForm.nome} onChange={(e) => setCidForm({ ...cidForm, nome: e.target.value })} /></label>
          <label>UF<input placeholder="PE" value={cidForm.uf} onChange={(e) => setCidForm({ ...cidForm, uf: e.target.value.toUpperCase() })} /></label>
          <label>Fuso<input placeholder="America/Recife" value={cidForm.fuso} onChange={(e) => setCidForm({ ...cidForm, fuso: e.target.value })} /></label>
        </div>
        {cidMsg && <p className={`spot-msg ${cidMsg.tipo === 'ok' ? 'ok' : 'erro'}`}>{cidMsg.texto}</p>}
        <div className="toolbar" style={{ marginTop: 8, marginBottom: 0 }}>
          <button onClick={salvarCidade}>{cidEditando ? 'Salvar alterações' : 'Cadastrar cidade'}</button>
          {cidEditando && <button className="ghost" onClick={() => { setCidEditando(null); setCidForm({ id: '', nome: '', uf: '', fuso: 'America/Maceio' }); }}>Cancelar edição</button>}
        </div>
      </div>
    </>
  );

  // Tema: salva paleta e reaplica
  const salvarTemaAtual = async (restaurar = false) => {
    setTemaMsg(null);
    try {
      const r = await salvarTema(restaurar ? {} : tema.vars, restaurar);
      setTema((t) => ({ ...t, vars: r.vars }));
      setTemaMsg({ tipo: 'ok', texto: restaurar ? 'Paleta padrão restaurada.' : 'Paleta salva e aplicada.' });
    } catch (e: any) { setTemaMsg({ tipo: 'erro', texto: e.message }); }
  };

  // Menu de LEDs: incluir / editar / excluir
  const salvarLed = async () => {
    setLedMsg(null);
    if (!ledForm.codigo.trim() || !ledForm.endereco.trim() || !ledForm.cidade_id) {
      setLedMsg({ tipo: 'erro', texto: 'Preencha código, endereço e cidade.' });
      return;
    }
    try {
      if (ledEditando) {
        await api.editarLed(ledEditando, {
          endereco: ledForm.endereco, cidade_id: ledForm.cidade_id,
          ...(ledForm.codigo !== ledEditando ? { novo_codigo: ledForm.codigo } : {}),
        });
        setLedMsg({ tipo: 'ok', texto: 'LED atualizado.' });
      } else {
        const { status, body } = await api.criarLed(ledForm);
        if (status !== 201) { setLedMsg({ tipo: 'erro', texto: body?.erro || `Falha (HTTP ${status}).` }); return; }
        setLedMsg({ tipo: 'ok', texto: `LED ${ledForm.codigo} cadastrado com 8 espaços.` });
      }
      setLedForm({ codigo: '', endereco: '', cidade_id: ledForm.cidade_id }); setLedEditando(null);
      carregar();
    } catch (e: any) { setLedMsg({ tipo: 'erro', texto: e.message }); }
  };
  const excluirLed = async (codigo: string) => {
    if (!confirm(`Excluir o LED ${codigo}? (só vazio)`)) return;
    try { await api.excluirLed(codigo); carregar(); }
    catch (e: any) { setLedMsg({ tipo: 'erro', texto: e.message }); }
  };

  if (!token) {
    return (
      <div className="login-wrap">
        <div className="card login-card">
          <div className="brand" style={{ marginBottom: 12 }}><div className="icon">📺</div><div><h1>LED CONTROL</h1><span>PAINÉIS DE VEICULAÇÃO</span></div></div>
          <h2>Login</h2>
          <p className="sub">Fluxo §5 · perfis §9.2 (admin / regional / operador / visualizador)</p>
          <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="login" />
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="senha" />
          {loginErro && <p className="sub">{loginErro}</p>}
          <button onClick={fazerLogin}>Entrar</button>
          <p className="sub" style={{ marginTop: 10 }}>Demo: admin/admin123 · viewer/view123</p>
        </div>
      </div>
    );
  }

  const pendentes = notifs.filter((n) => !n.lida);
  const visiveis = pendentes.filter((n) => !dismissed.includes(n.id));
  return (
    <>
      <div className="toasts" role="alert">
        {can('notificacoes') && visiveis.length > 1 && (
          <button className="toasts-close" onClick={() => setDismissed((xs) => [...xs, ...visiveis.map((n) => n.id)])}>
            ✕ fechar todas ({visiveis.length})
          </button>
        )}
        {can('notificacoes') && visiveis.slice(0, 4).map((n) => (
          <ToastItem key={n.id} n={n}
            onView={() => verCampanha(n)}
            onClose={() => setDismissed((xs) => [...xs, n.id])} />
        ))}
      </div>

      <div className="wrap">
        <div className="topbar">
          <div className="brand"><div className="icon">📺</div><div><h1>LED CONTROL</h1><span>PAINÉIS DE VEICULAÇÃO</span></div></div>
          <span className="live">● LIVE{online ? '' : ' · OFFLINE'}</span>
          <div className="kpis">
            <div className="kpi"><label>OCUPAÇÃO MÉDIA</label><b>{dash.kpis.ocupacao_media}%</b></div>
            <div className="kpi"><label>LEDS ATIVOS</label><b>{dash.kpis.leds_ativos}</b></div>
            <div className="kpi"><label>A VENCER (7D)</label><b style={{ color: 'var(--orange)' }}>{dash.kpis.a_vencer_7d}</b></div>
            <div className="kpi"><label>DISPONÍVEIS</label><b style={{ color: 'var(--teal)' }}>{dash.kpis.livres}<small>/{dash.kpis.espacos_total} espaços</small></b></div>
          </div>
          <div className="select">🏙️ Cidade:{' '}
            <select value={cidade} onChange={(e) => trocarCidade(e.target.value)}>
              <option value="">Todas ({cidadesOpts.length})</option>
              {cidadesOpts.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select> ▾
          </div>
          <div className="pill">📅 {dash.periodo}</div>
          {can('leds') && <button className="pill" style={{ cursor: 'pointer' }} onClick={() => { setLedsMenu(true); setLedMsg(null); }} title="Cadastro de LEDs (8 espaços por painel)">📺 LEDs</button>}
          {can('reservas') && <button className="pill" style={{ cursor: 'pointer' }} onClick={abrirReservasMenu} title="Cadastro de reservas (múltiplos períodos por campanha)">🗓️ Reservas</button>}
          {tela === 'painel' && temConfig && <button className="pill" style={{ cursor: 'pointer' }} onClick={() => setTela('config')} title="Tela de configurações: acesso, cidades e cores">⚙️ Configuração</button>}
          {tela === 'config' && <button className="pill" style={{ cursor: 'pointer' }} onClick={() => setTela('painel')} title="Voltar ao painel">← Voltar</button>}
          {perfil && <div className="pill" title="Perfil do usuário (spec §9.2)">👤 {perfil}{isAdmin ? ' · admin' : ''}</div>}
          <div style={{ position: 'relative' }}>
            {can('notificacoes') && (
              <div className="bell" onClick={() => setSino((v) => !v)}>🔔{pendentes.length > 0 && <span className="count">{pendentes.length}</span>}</div>
            )}
            {sino && can('notificacoes') && (
              <div className="notif-panel">
                <h3>Central de notificações</h3>
                {notifs.length === 0 && <div className="item">Nenhuma notificação.</div>}
                {notifs.slice(0, 20).map((n) => (
                  <div key={n.id} className="item" style={n.lida ? { opacity: .55 } : undefined}>
                    <b>{n.titulo}</b><br />{n.corpo}
                    {!n.lida && (
                      <div className="actions">
                        <button onClick={() => verCampanha(n)}>Ver campanha</button>
                        <button onClick={() => {
                          if (online && n.id > 0) api.marcarLida(n.id).then(carregar).catch(() => {});
                          setNotifs((xs) => xs.map((x) => (x.id === n.id ? { ...x, lida: true } : x)));
                        }}>Marcar como lida</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button className="pill" onClick={sair} style={{ cursor: 'pointer' }}>Sair</button>
        </div>

        <div className="breadcrumb">Todas as cidades <span>→</span> <b>{cidadeNome(cidade)}</b>{ledSel && (<><span>→</span> <b>{ledSel}</b></>)}</div>

        {tela === 'painel' && (
        <>
        <div className="grid">
          <div className="card">
            <h2>OCUPAÇÃO POR LED</h2>
            <p className="sub">Linha do tempo de campanhas veiculando / reservadas por painel — {cidadeNome(cidade)}.</p>
            {dash.gantt_por_led.map((l) => {
              const usados = l.espacos_usados ?? l.campanhas.length;
              const total = l.espacos_total ?? 8;
              const pct = Math.min(100, Math.round((usados / Math.max(1, total)) * 100));
              return (
                <div key={l.codigo} className={`ledrow ${ledSel === l.codigo ? 'sel' : ''}`}
                  onClick={() => setLedSel((s) => (s === l.codigo ? null : l.codigo))}
                  title={l.campanhas.map((c: any) => `${c.anunciante} ${br(c.inicio)}→${br(c.fim)}`).join(' · ')}>
                  <div className="ledname">{l.codigo}<small>{l.endereco}</small>
                    <span className="slots" title={`${usados} de ${total} espaços de cliente ocupados`}>
                      <span className="slots-bar"><span style={{ width: `${pct}%` }} /></span>
                      {usados}/{total}
                    </span>
                  </div>
                  <div className="track">
                    {ganttBlocos(l.campanhas).map((b, i) => (
                      <div key={i} className={`seg ${b.cls}`} style={{ width: `${b.w}%` }} title={b.title}>{b.label}</div>
                    ))}
                  </div>
                </div>
              );
            })}
            {ledSel && podeEditar && <button className="pill" style={{ cursor: 'pointer', marginTop: 8 }} onClick={() => abrirNovaCampanha(ledSel)}>+ Nova campanha em {ledSel}</button>}
          </div>

          <div className="card">
            <h2>DISTRIBUIÇÃO POR STATUS</h2>
            <p className="sub">Ocupação geral da rede no período.</p>
            <div className="toolbar" style={{ marginBottom: 4 }}>
              {([['rosca', 'Rosca'], ['pizza', 'Pizza'], ['barras', 'Barras']] as const).map(([id, lb]) => (
                <button key={id} className={tipoDist === id ? undefined : 'ghost'} onClick={() => setTipoDist(id)}>{lb}</button>
              ))}
            </div>
            {tipoDist !== 'barras' ? (
            <div className="donutwrap">
              <ResponsiveContainer width={170} height={170}>
                <PieChart>
                  <Pie data={dash.distribuicao} dataKey="value" nameKey="name"
                    innerRadius={tipoDist === 'rosca' ? 52 : 0} outerRadius={72} paddingAngle={2} strokeWidth={0}>
                    {dash.distribuicao.map((d) => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="legend">
                {dash.distribuicao.map((d) => <div key={d.name}><span className="dot" style={{ background: d.color }} />{d.name}<b>{d.value}%</b></div>)}
              </div>
            </div>
            ) : (
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={dash.distribuicao} layout="vertical">
                <CartesianGrid stroke={tema.vars.border || "#232d4a"} strokeDasharray="3 3" />
                <XAxis type="number" stroke={tema.vars.muted || "#8b93ab"} fontSize={11} domain={[0, 100]} />
                <YAxis type="category" dataKey="name" stroke={tema.vars.muted || "#8b93ab"} fontSize={11} width={80} />
                <Tooltip contentStyle={{ background: tema.vars.panel2 || "#0f1730", border: `1px solid ${tema.vars.border || "#232d4a"}` }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {dash.distribuicao.map((d) => <Cell key={d.name} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="grid2" style={{ marginBottom: 18 }}>
          <div className="card">
            <h2>OCUPAÇÃO POR CIDADE</h2>
            <p className="sub">Ranking de ocupação (%). Clique para filtrar.</p>
            <div className="bars">
              {dash.ocupacao_por_cidade.map((b) => (
                <div key={b.cidade} className="bar" onClick={() => trocarCidade(b.id || '')}>
                  <div className={`val ${b.valor === 0 ? 'empty' : ''}`} style={{ height: `${Math.max(b.valor, 2)}%` }}>
                    <span style={b.valor === 0 ? { color: 'var(--muted)' } : undefined}>{b.valor === 0 ? '—' : `${b.valor}%`}</span>
                  </div>
                  <label>{b.cidade}</label>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h2>CAMPANHAS — A VENCER ({dash.a_vencer_lista.length})</h2>
            <p className="sub">{dash.a_vencer_lista.length} campanhas em {new Set(dash.a_vencer_lista.map((a) => a.led)).size} LEDs · fim − hoje ≤ 7d (mesma base do topo).</p>
            <div style={{ overflowX: 'auto', maxHeight: 220, overflowY: 'auto' }}>
            <table>
              <thead><tr><th>Anunciante</th><th>LED</th><th>Status</th></tr></thead>
              <tbody>
                {dash.a_vencer_lista.map((a, i) => (
                  <tr key={i}><td>{a.anunciante}</td><td>{a.led}</td>
                    <td><span className="status-dot" style={{ background: 'var(--orange)' }} />{a.status}
                      {a.dias !== undefined && <small style={{ color: 'var(--muted)' }}> · {a.dias === 0 ? 'hoje' : `${a.dias}d`}</small>}</td></tr>
                ))}
                {dash.a_vencer_lista.length === 0 && (
                  <tr><td colSpan={3} style={{ color: 'var(--muted)' }}>Nenhuma vencendo no período.</td></tr>
                )}
              </tbody>
            </table>
            </div>
            <h2 style={{ marginTop: 16 }}>CAMPANHAS — A INICIAR ({(dash.a_iniciar_lista || []).length})</h2>
            <p className="sub">Início próximo · início − hoje ≤ 7d.</p>
            <div style={{ overflowX: 'auto', maxHeight: 220, overflowY: 'auto' }}>
            <table>
              <thead><tr><th>Anunciante</th><th>LED</th><th>Status</th></tr></thead>
              <tbody>
                {(dash.a_iniciar_lista || []).map((a, i) => (
                  <tr key={i}><td>{a.anunciante}</td><td>{a.led}</td>
                    <td><span className="status-dot" style={{ background: 'var(--blue)' }} />{a.status}
                      {a.dias !== undefined && <small style={{ color: 'var(--muted)' }}> · em {a.dias}d</small>}</td></tr>
                ))}
                {(dash.a_iniciar_lista || []).length === 0 && (
                  <tr><td colSpan={3} style={{ color: 'var(--muted)' }}>Nenhuma iniciando no período.</td></tr>
                )}
              </tbody>
            </table>
            </div>
          </div>
        </div>

        <div className="card" ref={painelRef} style={{ marginBottom: 18, scrollMarginTop: 12 }}>
          <div className="tabs">
            <div className={`tab ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => setTab('dashboard')}>Dashboard</div>
            {(can('planilha') || !online) && <div className={`tab ${tab === 'planilha' ? 'active' : ''}`} onClick={() => setTab('planilha')}>Visualizar como planilha</div>}
            {(can('graficos') || !online) && <div className={`tab ${tab === 'graficos' ? 'active' : ''}`} onClick={() => setTab('graficos')}>Gráficos</div>}
            {can('reservas') && <div className={`tab ${tab === 'reservas' ? 'active' : ''}`} onClick={() => setTab('reservas')}>Reservas</div>}
          </div>

          {tab === 'planilha' && (can('planilha') || !online) && (
            <>
              <div className="toolbar">
                <input placeholder="🔍 Buscar…" value={q} onChange={(e) => { setQ(e.target.value); setSelecionadas([]); }} />
                <select value={stFilter} onChange={(e) => { setStFilter(e.target.value); setSelecionadas([]); }}>
                  <option value="">Todos os status</option>
                  {Object.keys(STATUS_ROTULO).map((s) => <option key={s} value={s}>{STATUS_ROTULO[s]}</option>)}
                </select>
                {podeEditar && <button onClick={() => abrirNovaCampanha()}>＋ Nova campanha</button>}
                {podeEditar && selecionadas.length > 0 && (
                  <button className="danger" onClick={excluirSelecionadas}>🗑 Excluir {selecionadas.length} selecionada(s)</button>
                )}
                {can('importar') && (
                  <>
                    <label className="toolbar-upload" title="Importar planilha no padrão Cidade;LED;Anunciante;Início;Fim;ReservaN_Início;ReservaN_Fim…">
                      ⬆ Importar
                      <input type="file" accept=".csv,.txt" hidden onChange={(e) => { importarArquivo(e.target.files?.[0]); e.target.value = ''; }} />
                    </label>
                    <a href={api.modeloImportUrl}><button className="ghost" type="button">Modelo</button></a>
                  </>
                )}
                {can('exportar') && <a href={api.exportUrl('xlsx', cidade, q, stFilter)}><button>⬇ .xlsx</button></a>}
                {can('exportar') && <a href={api.exportUrl('csv', cidade, q, stFilter)}><button>⬇ .csv</button></a>}
                <button className="ghost" onClick={() => window.print()}>🖨 PDF</button>
              </div>
              {importMsg && <p className={`spot-msg ${importMsg.tipo}`}>{importMsg.texto}</p>}
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead><tr>
                    {podeEditar && (
                      <th>
                        <input type="checkbox" title="Selecionar visíveis"
                          checked={linhas.length > 0 && linhas.every((r) => !r.id || selecionadas.includes(r.id))}
                          onChange={(e) => {
                            if (e.target.checked) setSelecionadas((xs) => [...new Set([...xs, ...linhas.map((r) => r.id).filter(Boolean) as string[]])]);
                            else setSelecionadas((xs) => xs.filter((id) => !linhas.some((r) => r.id === id)));
                          }} />
                      </th>
                    )}
                    {[['cidade', 'Cidade'], ['led', 'LED'], ['anunciante', 'Anunciante'], ['inicio', 'Início'], ['fim', 'Fim'], ['status', 'Status']].map(([k, lb]) => (
                      <th key={k} onClick={() => { if (k === sortK) setSortD((d) => (d === 1 ? -1 : 1)); else { setSortK(k); setSortD(1); } }}>
                        {lb}{sortK === k ? (sortD === 1 ? ' ▲' : ' ▼') : ''}
                      </th>
                    ))}
                    {podeEditar && <th>Ações</th>}
                  </tr></thead>
                  <tbody>
                    {online ? (
                      linhas.length ? linhas.map((r, i) => (
                        <tr key={r.id || i} className={r.id && r.id === destaque ? 'destaque' : undefined}>
                          {podeEditar && (
                            <td><input type="checkbox" checked={!!r.id && selecionadas.includes(r.id)} disabled={!r.id}
                              onChange={() => r.id && alternarSelecao(r.id)} /></td>
                          )}
                          <td>{r.cidade}</td><td>{r.led}</td>
                          <td><input defaultValue={r.anunciante} onBlur={(e) => salvarInline(r, 'anunciante', e.target.value)} /></td>
                          <td>{br(r.inicio)}</td><td>{br(r.fim)}</td>
                          <td><span className="status-dot" style={{ background: corStatus(r.status) }} />{STATUS_ROTULO[r.status] || r.status}
                            {r.status === 'a_vencer' && r.fim !== '—' && (() => {
                              const d = diasAte(r.fim);
                              const txt = d > 0 ? ` · ${d}d` : ' · encerra hoje';
                              return <small style={{ color: 'var(--muted)' }}>{txt}</small>;
                            })()}
                          </td>
                          {podeEditar && (
                            <td className="row-actions">
                              <button onClick={() => abrirEditarCampanha(r)}>Editar</button>
                              <button onClick={() => abrirReservas(r)}>Reservas</button>
                              <button className="danger" onClick={() => excluirCampanha(r)}>Excluir</button>
                            </td>
                          )}
                        </tr>
                      )) : (
                        <tr><td colSpan={podeEditar ? 8 : 6} style={{ color: 'var(--muted)', textAlign: 'center' }}>
                          Nenhuma campanha para os filtros atuais.
                        </td></tr>
                      )
                    ) : (
                      <tr><td colSpan={podeEditar ? 8 : 6} style={{ color: 'var(--muted)', textAlign: 'center' }}>
                        Sem dados - API offline. Ligue o back-end para carregar.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === 'dashboard' && (
            <>
              <p className="sub">
                {online
                  ? `${linhas.length} campanha(s) no período · ${dash.periodo}`
                  : `Demonstração offline · ${dash.periodo}`}
              </p>
              <div style={{ overflowX: 'auto', maxHeight: 440, overflowY: 'auto' }}>
              <table>
              <thead><tr><th>Cidade</th><th>LED</th><th>Anunciante</th><th>Início</th><th>Fim</th><th>Status</th></tr></thead>
              <tbody>
                {linhas.map((r, i) => (
                  <tr key={r.id || i}>
                    <td>{r.cidade}</td><td>{r.led}</td>
                    <td style={r.status === 'livre' ? { color: 'var(--muted)' } : undefined}>{r.anunciante}</td>
                    <td>{br(r.inicio)}</td><td>{br(r.fim)}</td>
                    <td><span className="status-dot" style={{ background: corStatus(r.status) }} />{STATUS_ROTULO[r.status] || r.status}</td>
                  </tr>
                ))}
                {linhas.length === 0 && (
                  <tr><td colSpan={6} style={{ color: 'var(--muted)', textAlign: 'center' }}>
                    {online ? 'Nenhuma campanha para os filtros atuais.' : 'Sem dados - API offline. Ligue o back-end para carregar.'}
                  </td></tr>
                )}
                {online && linhas.length === 0 && (
                  <tr><td colSpan={6} style={{ color: 'var(--muted)', textAlign: 'center' }}>
                    Nenhuma campanha para os filtros atuais.
                  </td></tr>
                )}
              </tbody>
              </table>
              </div>
            </>
          )}

          {tab === 'graficos' && (can('graficos') || !online) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
              <div><h2 style={{ fontSize: '.85rem' }}>EVOLUÇÃO MENSAL (%)</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={dash.evolucao_mensal}>
                    <CartesianGrid stroke={tema.vars.border || "#232d4a"} strokeDasharray="3 3" />
                    <XAxis dataKey="mes" stroke={tema.vars.muted || "#8b93ab"} fontSize={11} /><YAxis stroke={tema.vars.muted || "#8b93ab"} fontSize={11} domain={[40, 80]} />
                    <Tooltip contentStyle={{ background: tema.vars.panel2 || "#0f1730", border: `1px solid ${tema.vars.border || "#232d4a"}` }} />
                    <Line type="monotone" dataKey="ocupacao" stroke={tema.vars.teal || "#2dd4bf"} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer></div>
              <div><h2 style={{ fontSize: '.85rem' }}>OCUPAÇÃO POR CIDADE (%)</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={dash.ocupacao_por_cidade}>
                    <CartesianGrid stroke={tema.vars.border || "#232d4a"} strokeDasharray="3 3" />
                    <XAxis dataKey="cidade" stroke={tema.vars.muted || "#8b93ab"} fontSize={10} /><YAxis stroke={tema.vars.muted || "#8b93ab"} fontSize={11} />
                    <Tooltip contentStyle={{ background: tema.vars.panel2 || "#0f1730", border: `1px solid ${tema.vars.border || "#232d4a"}` }} />
                    <Bar dataKey="valor" fill={tema.vars.teal || "#2dd4bf"} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer></div>
            </div>
          )}

          {tab === 'reservas' && can('reservas') && (
            <>
              <div className="toolbar">
                <span className="sub">Múltiplos períodos futuros por campanha, cada um com seu anunciante e toast de início próximo.</span>
              </div>
              {conteudoReservas()}
            </>
          )}
        </div>
        </>)}

          {tela === 'config' && temConfig && (
            <div className="card" style={{ marginBottom: 18 }}>
              <h2>CONFIGURAÇÕES</h2>
              <p className="sub">Acesso de usuários, cidades e cores do projeto.</p>
              <div className="tabs">
                {can('usuarios') && <div className={`tab ${configSecao === 'acesso' ? 'active' : ''}`} onClick={() => setConfigSecao('acesso')}>Acesso</div>}
                {can('cidades') && <div className={`tab ${configSecao === 'cidades' ? 'active' : ''}`} onClick={() => setConfigSecao('cidades')}>Cidades</div>}
                {can('config') && <div className={`tab ${configSecao === 'tema' ? 'active' : ''}`} onClick={() => setConfigSecao('tema')}>Cores</div>}
              </div>
              {configSecao === 'acesso' && can('usuarios') && (
                <>
                  <p className="sub">Defina por usuário: perfil, <b>cidades que pode ver</b> e <b>recursos extras</b> além do perfil. Sem cidade vinculada = todas.</p>
                  {conteudoUsuarios()}
                </>
              )}
              {configSecao === 'cidades' && can('cidades') && (
                <>
                  <p className="sub">Conforme a tabela cidades: id, nome, UF e fuso. Exclusão só de cidade vazia (sem LEDs).</p>
                  {conteudoCidades()}
                </>
              )}
              {configSecao === 'tema' && can('config') && (
                <>
                  <p className="sub">Paleta do projeto: fundo, fontes, destaques e gráficos. Aplica na hora em todo o painel.</p>
                  <div className="perm-grid">
                    {Object.keys(tema.rotulos).map((k) => (
                      <label key={k} className="check">{tema.rotulos[k]}
                        <input type="color" value={tema.vars[k] || '#000000'}
                          onChange={(e) => setTema((t) => ({ ...t, vars: { ...t.vars, [k]: e.target.value } }))} />
                        <small style={{ color: 'var(--muted)' }}>{tema.vars[k]}</small>
                      </label>
                    ))}
                  </div>
                  {Object.keys(tema.vars).length === 0 && <p className="sub">Carregando paleta…</p>}
                  {temaMsg && <p className={`spot-msg ${temaMsg.tipo === 'ok' ? 'ok' : 'erro'}`}>{temaMsg.texto}</p>}
                  <div className="toolbar" style={{ marginTop: 8, marginBottom: 0 }}>
                    <button onClick={() => salvarTemaAtual(false)}>Salvar cores</button>
                    <button className="ghost" onClick={() => salvarTemaAtual(true)}>Restaurar padrão</button>
                  </div>
                </>
              )}
            </div>
          )}

        <footer>
          <span>LATÊNCIA DE DADOS: {lat} · TODOS OS PAINÉIS REPORTANDO{online ? '' : ' · MODO OFFLINE (mockup)'}</span>
          <span>MOCKUP DE INTERFACE · PERÍODO: {dash.periodo.toUpperCase()}</span>
        </footer>
      </div>

      {modal && (
        <div className="modal-bg" onClick={() => { setModal(false); setEditCampId(null); }}>
          <div className="card modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editCampId ? 'EDITAR CAMPANHA' : 'CADASTRAR CAMPANHA'} — {form.led_codigo}</h2>
            <p className="sub">Validação de datas ativa (31/9 é rejeitado — spec §1). Limite de 8 espaços de cliente por LED.</p>
            <input placeholder="Anunciante" value={form.anunciante} onChange={(e) => setForm({ ...form, anunciante: e.target.value })} />
            <select value={form.cidade_id} onChange={(e) => {
              const cid = e.target.value;
              const leds = ledsLista.length ? ledsLista : dash.gantt_por_led;
              const mesmoLed = leds.some((l: any) => l.codigo === form.led_codigo && l.cidade_id === cid);
              const primeiro = leds.find((l: any) => l.cidade_id === cid);
              setForm({ ...form, cidade_id: cid, led_codigo: mesmoLed ? form.led_codigo : (primeiro?.codigo || form.led_codigo) });
            }}>
              {(cidades.length ? cidades : [{ id: 'aracaju', nome: 'Aracaju', uf: 'SE' }]).map((c) => (
                <option key={c.id} value={c.id}>{c.nome}/{c.uf}</option>
              ))}
            </select>
            <select value={form.led_codigo} onChange={(e) => {
              const led = (ledsLista.length ? ledsLista : dash.gantt_por_led).find((l: any) => l.codigo === e.target.value);
              setForm({ ...form, led_codigo: e.target.value, cidade_id: led?.cidade_id || form.cidade_id });
            }}>
              {(() => {
                const todos = ledsLista.length ? ledsLista : dash.gantt_por_led;
                const ops = todos.filter((l: any) => !form.cidade_id || l.cidade_id === form.cidade_id);
                return (ops.length ? ops : todos).map((l: any) => <option key={l.codigo} value={l.codigo}>{l.codigo}</option>);
              })()}
            </select>
            <input type="date" value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} />
            <input type="date" value={form.fim} onChange={(e) => setForm({ ...form, fim: e.target.value })} />
            <label className="check"><input type="checkbox" checked={form.reservada} onChange={(e) => setForm({ ...form, reservada: e.target.checked })} /> Campanha reservada (futura)</label>
            <div className="toolbar" style={{ marginTop: 10 }}>
              <button onClick={criarCampanha}>Salvar</button>
              <button className="ghost" onClick={() => { setModal(false); setEditCampId(null); }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
      {resModal && can('reservas') && (
        <div className="modal-bg" onClick={() => { setResModal(false); }}>
          <div className="card modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <h2>CADASTRO DE RESERVAS</h2>
            <p className="sub">Múltiplos períodos futuros por campanha, cada um com seu anunciante; cada um gera toast de início próximo.</p>
            {conteudoReservas()}
            <div className="toolbar" style={{ marginTop: 12, marginBottom: 0 }}>
              <button className="ghost" onClick={() => { setResModal(false); }}>Fechar</button>
            </div>
          </div>
        </div>
      )}
      {resMenu && (
        <div className="modal-bg" onClick={() => setResMenu(null)}>
          <div className="card modal" onClick={(e) => e.stopPropagation()}>
            <h2>RESERVAS — {resMenu.anunciante.toUpperCase()}</h2>
            <p className="sub">{resMenu.led} · múltiplos períodos futuros, cada um com seu anunciante; cada um gera toast de início próximo. Sem sobreposição com a campanha nem entre reservas.</p>
            <table>
              <thead><tr><th>Anunciante</th><th>Início</th><th>Fim</th>{podeEditar && <th>Ações</th>}</tr></thead>
              <tbody>
                {resLista.map((r: any) => (
                  <tr key={r.id}>
                    <td>{r.anunciante}</td><td>{br(r.inicio)}</td><td>{br(r.fim)}</td>
                    {podeEditar && <td className="row-actions"><button className="danger" onClick={() => excluirReserva(r.id)}>Excluir</button></td>}
                  </tr>
                ))}
                {resLista.length === 0 && <tr><td colSpan={podeEditar ? 4 : 3} style={{ color: 'var(--muted)' }}>Nenhuma reserva futura.</td></tr>}
              </tbody>
            </table>
            {podeEditar && (
              <div className="spot-form">
                <h2 style={{ fontSize: '.85rem' }}>＋ NOVA RESERVA</h2>
                <label>Anunciante da reserva (vazio = o da campanha)<input placeholder={resMenu.anunciante} value={resForm.anunciante} onChange={(e) => setResForm({ ...resForm, anunciante: e.target.value })} /></label>
                <div className="spot-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <label>Início<input type="date" value={resForm.inicio} onChange={(e) => setResForm({ ...resForm, inicio: e.target.value })} /></label>
                  <label>Fim<input type="date" value={resForm.fim} onChange={(e) => setResForm({ ...resForm, fim: e.target.value })} /></label>
                </div>
                {resMsg && <p className={`spot-msg ${resMsg.tipo === 'ok' ? 'ok' : 'erro'}`}>{resMsg.texto}</p>}
                <div className="toolbar" style={{ marginTop: 8, marginBottom: 0 }}>
                  <button onClick={salvarReserva}>Adicionar reserva</button>
                </div>
              </div>
            )}
            <div className="toolbar" style={{ marginTop: 12, marginBottom: 0 }}>
              <button className="ghost" onClick={() => setResMenu(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
      {ledsMenu && (
        <div className="modal-bg" onClick={() => { setLedsMenu(false); setLedEditando(null); }}>
          <div className="card modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <h2>CADASTRO DE LEDS</h2>
            <p className="sub">Cada painel tem 8 espaços de cliente. Exclusão só de LED vazio; renomear move campanhas e spots juntos.</p>
            <div className="table-scroll">
            <table>
              <thead><tr><th>Código</th><th>Endereço</th><th>Cidade</th><th>Espaços</th>{podeEditar && <th>Ações</th>}</tr></thead>
              <tbody>
                {(ledsLista.length ? ledsLista : dash.gantt_por_led.map((l: any) => ({
                  codigo: l.codigo, endereco: l.endereco, cidade_id: l.cidade_id,
                  espacos_usados: l.espacos_usados ?? l.campanhas.length, espacos_total: l.espacos_total ?? 8,
                }))).map((l: any) => (
                  <tr key={l.codigo}>
                    <td><b>{l.codigo}</b></td><td>{l.endereco}</td><td>{l.cidade_id}</td>
                    <td>
                      <span className="slots" title={`${l.espacos_usados} de ${l.espacos_total} espaços ocupados`}>
                        <span className="slots-bar"><span style={{ width: `${Math.min(100, Math.round((l.espacos_usados / Math.max(1, l.espacos_total)) * 100))}%` }} /></span>
                        {l.espacos_usados}/{l.espacos_total}
                      </span>
                    </td>
                    {podeEditar && (
                      <td className="row-actions">
                        <button onClick={() => { setLedEditando(l.codigo); setLedForm({ codigo: l.codigo, endereco: l.endereco, cidade_id: l.cidade_id }); }}>Editar</button>
                        <button className="danger" onClick={() => excluirLed(l.codigo)}>Excluir</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {podeEditar && (
              <div className="spot-form">
                <h2 style={{ fontSize: '.85rem' }}>{ledEditando ? `EDITAR ${ledEditando}` : '＋ NOVO LED'}</h2>
                <div className="spot-row">
                  <label>Código<input placeholder="AJU 05" value={ledForm.codigo} onChange={(e) => setLedForm({ ...ledForm, codigo: e.target.value.toUpperCase() })} /></label>
                  <label>Endereço<input placeholder="Av. ..." value={ledForm.endereco} onChange={(e) => setLedForm({ ...ledForm, endereco: e.target.value })} /></label>
                  <label>Cidade
                    <select value={ledForm.cidade_id} onChange={(e) => setLedForm({ ...ledForm, cidade_id: e.target.value })}>
                      {(cidades.length ? cidades : [{ id: 'aracaju', nome: 'Aracaju', uf: 'SE' }]).map((c) => (
                        <option key={c.id} value={c.id}>{c.nome}/{c.uf}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {ledMsg && <p className={`spot-msg ${ledMsg.tipo === 'ok' ? 'ok' : 'erro'}`}>{ledMsg.texto}</p>}
                <div className="toolbar" style={{ marginTop: 8, marginBottom: 0 }}>
                  <button onClick={salvarLed}>{ledEditando ? 'Salvar alterações' : 'Cadastrar LED'}</button>
                  {ledEditando && <button className="ghost" onClick={() => { setLedEditando(null); setLedForm({ codigo: '', endereco: '', cidade_id: ledForm.cidade_id }); }}>Cancelar edição</button>}
                </div>
              </div>
            )}
            <div className="toolbar" style={{ marginTop: 12, marginBottom: 0 }}>
              <button className="ghost" onClick={() => { setLedsMenu(false); setLedEditando(null); }}>Fechar</button>
            </div>
          </div>
        </div>
      )}
      {resEditM && (
        <div className="modal-bg modal-fg" onClick={() => setResEditM(null)}>
          <div className="card modal" onClick={(e) => e.stopPropagation()}>
            <h2>EDITAR RESERVA</h2>
            <p className="sub">{resEditM.campLabel}</p>
            <label>Anunciante da reserva<input value={resEditM.anunciante} onChange={(e) => setResEditM({ ...resEditM, anunciante: e.target.value })} /></label>
            <div className="spot-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <label>Início<input type="date" value={resEditM.inicio} onChange={(e) => setResEditM({ ...resEditM, inicio: e.target.value })} /></label>
              <label>Fim<input type="date" value={resEditM.fim} onChange={(e) => setResEditM({ ...resEditM, fim: e.target.value })} /></label>
            </div>
            {resMsgM && <p className={`spot-msg ${resMsgM.tipo === 'ok' ? 'ok' : 'erro'}`}>{resMsgM.texto}</p>}
            <div className="toolbar" style={{ marginTop: 10 }}>
              <button onClick={salvarEdicaoReserva}>Salvar alterações</button>
              <button className="ghost" onClick={() => setResEditM(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
