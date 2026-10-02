// Cliente da API (VITE_API_URL ou proxy /api). Com fallback offline fiel ao mockup.
export const API = (import.meta as any).env?.VITE_API_URL || '';

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('led_token');
  const r = await fetch(API + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  // Sessão inválida/expirada: volta ao login em vez de fingir logado
  if (r.status === 401 && token && token !== 'offline' && !path.startsWith('/api/auth/')) {
    localStorage.removeItem('led_token');
    localStorage.removeItem('led_perfil');
    if (!location.href.includes('#sessao-expirada')) {
      location.hash = 'sessao-expirada';
      location.reload();
    }
  }
  if (!r.ok) throw new Error((await r.json().catch(() => ({})) as any).erro || `HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

export interface Dashboard {
  hoje: string; periodo: string;
  kpis: { ocupacao_media: number; leds_ativos: string; a_vencer_7d: number; livres: number };
  distribuicao: { name: string; value: number; color: string }[];
  evolucao_mensal: { mes: string; ocupacao: number }[];
  ocupacao_por_cidade: { cidade: string; id: string; valor: number }[];
  gantt_por_led: { codigo: string; endereco: string; cidade_id: string; campanhas: any[]; espacos_usados?: number; espacos_total?: number }[];
  a_vencer_lista: { anunciante: string; led: string; status: string }[];
  a_iniciar_lista: { anunciante: string; led: string; status: string }[];
}
export interface PlanilhaRow { id?: string; cidade: string; led: string; anunciante: string; inicio: string; fim: string; status: string }
export interface Notif { id: number; titulo: string; corpo: string; lida: boolean; evento: string; campanha_id: string; anunciante?: string; led?: string; campanha_ref?: string }
export interface Me { login: string; perfil: string; nome: string; cidades: string[]; permissoes: string[]; efetivas: string[] }

export const api = {
  login: (login: string, senha: string) =>
    req<{ token: string; perfil: string; nome: string }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ login, senha }) }),
  dashboard: (cidades: string) => req<Dashboard>(`/api/dashboard${cidades ? `?cidades=${cidades}` : ''}`),
  planilha: (cidades: string, q = '', status = '') =>
    req<PlanilhaRow[]>(`/api/planilha?cidades=${cidades}&q=${encodeURIComponent(q)}${status ? `&status=${status}` : ''}`),
  notificacoes: (cidades = '') => req<Notif[]>(`/api/notificacoes${cidades ? `?cidades=${cidades}` : ''}`),
  marcarLida: (id: number) =>
    req('/api/notificacoes/' + id + '/lida', { method: 'PATCH' }).catch(() => null as any),
  cidades: () => req<{ id: string; nome: string; uf: string }[]>('/api/cidades'),
  criarCidade: async (body: any): Promise<{ status: number; body: any }> => {
    const token = localStorage.getItem('led_token');
    const r = await fetch(API + '/api/cidades', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  },
  editarCidade: (id: string, body: any) =>
    req('/api/cidades/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify(body) }),
  excluirCidade: (id: string) =>
    req('/api/cidades/' + encodeURIComponent(id), { method: 'DELETE' }),
  leds: (cidades = '') => req<any[]>(`/api/leds${cidades ? `?cidades=${cidades}` : ''}`),
  criarLed: async (body: any): Promise<{ status: number; body: any }> => {
    const token = localStorage.getItem('led_token');
    const r = await fetch(API + '/api/leds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  },
  editarLed: (codigo: string, body: any) =>
    req('/api/leds/' + encodeURIComponent(codigo), { method: 'PUT', body: JSON.stringify(body) }),
  excluirLed: (codigo: string) =>
    req('/api/leds/' + encodeURIComponent(codigo), { method: 'DELETE' }),
  campanhas: () => req<any[]>('/api/campanhas'),
  criarCampanha: (body: any) => req('/api/campanhas', { method: 'POST', body: JSON.stringify(body) }),
  excluirCampanha: (id: string) => req('/api/campanhas/' + id, { method: 'DELETE' }),
  editarCampanha: (id: string, body: any) => req('/api/campanhas/' + id, { method: 'PUT', body: JSON.stringify(body) }),
  exportUrl: (fmt: 'csv' | 'xlsx', cidades = '', q = '', status = '') =>
    `${API}/api/export/planilha.${fmt}?cidades=${encodeURIComponent(cidades)}&q=${encodeURIComponent(q)}${status ? `&status=${status}` : ''}&token=${localStorage.getItem('led_token') || ''}`,
  me: () => req<Me>('/api/me'),
  recursos: () => req<{ id: string; rotulo: string }[]>('/api/recursos'),
  usuarios: () => req<any[]>('/api/usuarios'),
  criarUsuario: (body: any) => req('/api/usuarios', { method: 'POST', body: JSON.stringify(body) }),
  editarUsuario: (login: string, body: any) => req('/api/usuarios/' + login, { method: 'PUT', body: JSON.stringify(body) }),
  excluirUsuario: (login: string) => req('/api/usuarios/' + login, { method: 'DELETE' }),
  reservas: (campanhaId: string) => req<any[]>(`/api/campanhas/${campanhaId}/reservas`),
  criarReserva: (campanhaId: string, body: any) =>
    req(`/api/campanhas/${campanhaId}/reservas`, { method: 'POST', body: JSON.stringify(body) }),
  excluirReserva: (id: string) => req('/api/reservas/' + id, { method: 'DELETE' }),
  listarReservas: (cidades = '') => req<any[]>(`/api/reservas${cidades ? `?cidades=${cidades}` : ''}`),
  editarReserva: (id: string, body: any) =>
    req('/api/reservas/' + id, { method: 'PUT', body: JSON.stringify(body) }),
  modeloImportUrl: `${API}/api/import/modelo.csv`,
  importarPlanilha: (csv: string) =>
    req<{ total: number; criadas: number; reservas_criadas: number; ignoradas: { linha: number; anunciante: string; motivo: string }[] }>('/api/import/planilha', { method: 'POST', body: JSON.stringify({ csv }) }),
  tema: () => req<{ vars: Record<string, string>; rotulos: Record<string, string> }>('/api/tema'),
};

// Fallback offline — valores literais do mockup-led-saas
export const FALLBACK_DASH: Dashboard = {
  hoje: '2026-10-25', periodo: 'Outubro 2026',
  kpis: { ocupacao_media: 72.4, leds_ativos: '4/4', a_vencer_7d: 2, livres: 1 },
  distribuicao: [
    { name: 'Veiculando', value: 55, color: '#2dd4bf' },
    { name: 'Reservada', value: 25, color: '#8b7cf6' },
    { name: 'Livre', value: 20, color: '#3a4468' },
  ],
  evolucao_mensal: [
    { mes: 'Mai', ocupacao: 58 }, { mes: 'Jun', ocupacao: 61 }, { mes: 'Jul', ocupacao: 66 },
    { mes: 'Ago', ocupacao: 64 }, { mes: 'Set', ocupacao: 70 }, { mes: 'Out', ocupacao: 72.4 },
  ],
  ocupacao_por_cidade: [
    { cidade: 'ARACAJU', id: 'aracaju', valor: 72 },
    { cidade: 'SALVADOR', id: 'salvador', valor: 0 },
    { cidade: 'NOVA CIDADE', id: '', valor: 0 },
  ],
  gantt_por_led: [
    { codigo: 'AJU 01', endereco: 'Silvio Teixeira', cidade_id: 'aracaju', espacos_usados: 2, espacos_total: 8, campanhas: [{ anunciante: 'Atakarejo', inicio: '2026-02-10', fim: '2027-04-09', status: 'veiculando' }, { anunciante: 'Boticário', inicio: '2026-11-14', fim: '2026-11-28', status: 'agendada' }] },
    { codigo: 'AJU 02', endereco: 'Tancredo Neves', cidade_id: 'aracaju', espacos_usados: 1, espacos_total: 8, campanhas: [{ anunciante: 'Vita', inicio: '2026-08-01', fim: '2026-12-20', status: 'veiculando' }] },
    { codigo: 'AJU 03', endereco: 'Adélia Franco', cidade_id: 'aracaju', espacos_usados: 2, espacos_total: 8, campanhas: [{ anunciante: 'Jardins Delicatessen', inicio: '2026-09-01', fim: '2027-01-31', status: 'veiculando' }, { anunciante: 'Hospital dos Olhos', inicio: '2026-10-20', fim: '2026-10-31', status: 'a_vencer' }] },
    { codigo: 'AJU 04', endereco: 'Francisco Porto', cidade_id: 'aracaju', espacos_usados: 2, espacos_total: 8, campanhas: [{ anunciante: 'São Braz', inicio: '2026-07-10', fim: '2026-12-10', status: 'veiculando' }, { anunciante: 'Rede Primavera', inicio: '2026-10-27', fim: '2026-11-14', status: 'agendada' }] },
  ],
  a_vencer_lista: [
    { anunciante: 'Boticário', led: 'AJU 01', status: 'A vencer' },
    { anunciante: 'Hospital dos Olhos', led: 'AJU 03', status: 'A vencer' },
  ],
  a_iniciar_lista: [
    { anunciante: 'Rede Primavera', led: 'AJU 04', status: 'Agendada' },
  ],
};

// Cor de status lida das variáveis CSS — acompanha o tema configurado
const COR_VAR: Record<string, string> = {
  veiculando: '--teal', Veiculando: '--teal',
  a_vencer: '--orange', 'A vencer': '--orange',
  agendada: '--blue', Agendada: '--blue',
  reservada: '--purple', Reservada: '--purple',
  vencida: '--red', Vencida: '--red',
  livre: '--muted', Livre: '--muted',
};
export const corStatus = (s: string): string => {
  const v = COR_VAR[s] || '--muted';
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#888';
  } catch { return '#888'; }
};
export const salvarTema = (vars: Record<string, string>, restaurar = false) =>
  req<{ vars: Record<string, string> }>('/api/tema', { method: 'PUT', body: JSON.stringify({ vars, restaurar }) });
export const STATUS_ROTULO: Record<string, string> = {
  veiculando: 'Veiculando', a_vencer: 'A vencer', agendada: 'Agendada',
  reservada: 'Reservada', vencida: 'Vencida', livre: 'Livre',
};
export const br = (iso: string) => {
  if (!iso || iso === '—') return '—';
  const [y, m, d] = iso.split('-'); return `${d}/${m}/${y.slice(2)}`;
};
