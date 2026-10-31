import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { addProduct, deleteProduct, getProducts, supabase, updateQuantity } from './data';
import type { Product } from './types';

const categories = ['Medicamentos', 'Higiene pessoal', 'Alimentos', 'Outros'];
const LOW_STOCK_THRESHOLD = 10;
const EXPIRY_ALERT_DAYS = 30;
const TOAST_DURATION_MS = 5000;

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [activePage, setActivePage] = useState<'inventory' | 'expirations'>('inventory');
  const [expiryFilter, setExpiryFilter] = useState<'all' | 'upcoming' | 'expired'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [quantity, setQuantity] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [toastSequence, setToastSequence] = useState(0);
  const showToast = (message: string) => { setToast(message); setToastSequence((sequence) => sequence + 1); };

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(''), TOAST_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [toastSequence]);
  const [authLoading, setAuthLoading] = useState(Boolean(supabase));
  const [session, setSession] = useState<{ email?: string } | null>(null);
  const [authMode, setAuthMode] = useState<'signin' | 'recover' | 'update'>('signin');
  const [hasInventoryAccess, setHasInventoryAccess] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMessage, setAuthMessage] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try { setProducts(await getProducts()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível carregar o estoque.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (supabase) {
      const client = supabase;
      const verifyAccess = async (user: { id: string; email?: string } | null) => {
        if (!user) {
          setSession(null);
          setHasInventoryAccess(false);
          setAuthLoading(false);
          return;
        }
        setAuthLoading(true);
        const { data, error } = await client.from('inventory_access').select('user_id').eq('user_id', user.id).maybeSingle();
        setSession(user);
        setHasInventoryAccess(Boolean(data) && !error);
        setAuthLoading(false);
      };
      void client.auth.getSession().then(({ data }) => { void verifyAccess(data.session?.user ?? null); });
      const { data: { subscription } } = client.auth.onAuthStateChange((event, nextSession) => {
        if (event === 'PASSWORD_RECOVERY') setAuthMode('update');
        window.setTimeout(() => { void verifyAccess(nextSession?.user ?? null); }, 0);
      });
      return () => subscription.unsubscribe();
    }
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (supabase && session && hasInventoryAccess) void refresh();
  }, [hasInventoryAccess, refresh, session]);

  useEffect(() => {
    if (!supabase || !session || !hasInventoryAccess) return;
    const client = supabase;
    const channel = client.channel('products-live').on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => { void refresh(); }).subscribe();
    return () => { void client.removeChannel(channel); };
  }, [hasInventoryAccess, refresh, session]);

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setAuthMessage(''); setAuthLoading(true);
    if (!supabase) return;
    const result = authMode === 'signin'
      ? await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })
      : authMode === 'recover'
        ? await supabase.auth.resetPasswordForEmail(authEmail, { redirectTo: window.location.origin })
        : await supabase.auth.updateUser({ password: authPassword });
    setAuthLoading(false);
    if (result.error) setAuthMessage(result.error.message);
    else if (authMode === 'recover') setAuthMessage('Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha.');
    else if (authMode === 'update') { setAuthMessage('Senha atualizada. Entre novamente com a nova senha.'); setAuthMode('signin'); await supabase.auth.signOut(); }
  };

  const filtered = useMemo(() => products.filter((p) => {
    const matches = `${p.name} ${p.category}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'));
    const state = p.quantity === 0 ? 'out' : p.quantity <= LOW_STOCK_THRESHOLD ? 'low' : 'ok';
    return matches && (filter === 'all' || state === filter);
  }), [products, query, filter]);
  const totalUnits = products.reduce((n, p) => n + p.quantity, 0);
  const lowCount = products.filter((p) => p.quantity > 0 && p.quantity <= LOW_STOCK_THRESHOLD).length;
  const outCount = products.filter((p) => p.quantity === 0).length;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const expiringProducts = products.filter((p) => p.category === 'Medicamentos' && p.expiration_date).map((p) => {
    const expiry = new Date(`${p.expiration_date}T00:00:00`);
    return { ...p, daysUntilExpiry: Math.ceil((expiry.getTime() - today.getTime()) / 86400000) };
  }).filter((p) => p.daysUntilExpiry <= EXPIRY_ALERT_DAYS).sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
  const upcomingCount = expiringProducts.filter((p) => p.daysUntilExpiry >= 0).length;
  const expiredCount = expiringProducts.filter((p) => p.daysUntilExpiry < 0).length;
  const visibleExpiringProducts = expiringProducts.filter((p) => expiryFilter === 'all' || (expiryFilter === 'expired' ? p.daysUntilExpiry < 0 : p.daysUntilExpiry >= 0));

  if (!supabase && !import.meta.env.DEV) return <div className="auth-loading"><strong>Conexão com o banco não configurada.</strong><br />Configure as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no ambiente de produção.</div>;

  const closeForm = () => { setModalOpen(false); setName(''); setCategory(''); setQuantity(''); setExpirationDate(''); };
  const save = async () => {
    if (!name.trim() || !category || !quantity || (category === 'Medicamentos' && !expirationDate) || !Number.isInteger(Number(quantity)) || Number(quantity) < 1) return;
    setSaving(true);
    try { await addProduct({ name: name.trim(), category, quantity: Number(quantity), expiration_date: category === 'Medicamentos' ? expirationDate : null }); closeForm(); await refresh(); showToast('Produto adicionado ao estoque.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar o produto.'); }
    finally { setSaving(false); }
  };
  const changeQuantity = async (p: Product, delta: number) => {
    const next = Math.max(0, p.quantity + delta);
    try { await updateQuantity(p.id, next); setProducts((current) => current.map((item) => item.id === p.id ? { ...item, quantity: next } : item)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível atualizar a quantidade.'); }
  };
  const remove = async () => {
    if (!deleteTarget) return;
    try { await deleteProduct(deleteTarget.id); setProducts((current) => current.filter((p) => p.id !== deleteTarget.id)); showToast('Produto excluído.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível excluir o produto.'); }
    finally { setDeleteTarget(null); }
  };

  if (supabase && authLoading) return <div className="auth-loading"><span className="spinner" />Conectando ao Orbe…</div>;
  if (supabase && session && !hasInventoryAccess && authMode !== 'update') return <div className="auth-loading access-denied"><div><strong>Acesso restrito</strong><p>Esta conta não está autorizada a consultar o estoque. Peça acesso ao responsável.</p><button className="secondary-button" onClick={() => void supabase?.auth.signOut()}>Sair</button></div></div>;
  if (supabase && (!session || authMode === 'update')) return <div className="auth-screen"><section className="auth-brand-panel"><a className="brand auth-brand" href="#"><span className="brand-mark"><span /></span><span className="brand-name">orbe</span></a><div className="auth-copy"><div className="eyebrow"><span className="eyebrow-dot" /> GESTÃO DE ESTOQUE</div><h1>Seu estoque sob controle.</h1><p>Acompanhe produtos, quantidades e validades em um só lugar.</p><div className="auth-orbit orbit-one"/><div className="auth-orbit orbit-two"/><div className="auth-orbit orbit-three"/></div><small>© 2026 Orbe · Plataforma de gestão</small></section><section className="auth-form-panel"><form className="auth-form" onSubmit={(e) => void submitAuth(e)}><div className="eyebrow">ACESSO AO SISTEMA</div><h2>{authMode === 'signin' ? 'Bem-vindo de volta' : authMode === 'recover' ? 'Redefinir senha' : 'Escolha uma nova senha'}</h2><p>{authMode === 'signin' ? 'Entre para acessar o estoque protegido.' : authMode === 'recover' ? 'Enviaremos um link para o seu e-mail.' : 'Defina uma nova senha para sua conta.'}</p>{authMessage && <div className="auth-message" role="status">{authMessage}</div>}{authMode !== 'update' && <label>E-mail<input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="voce@empresa.com" required autoComplete="email" /></label>}{authMode !== 'recover' && <label>{authMode === 'update' ? 'Nova senha' : 'Senha'}<input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="Mínimo de 6 caracteres" required minLength={6} autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} /></label>}{authMode === 'signin' && <button className="auth-forgot" type="button" onClick={() => { setAuthMode('recover'); setAuthMessage(''); }}>Esqueceu a senha?</button>}<button className="primary-button auth-submit" disabled={authLoading}>{authLoading ? 'Aguarde…' : authMode === 'signin' ? 'Entrar na plataforma' : authMode === 'recover' ? 'Enviar link de recuperação' : 'Salvar nova senha'}</button>{authMode === 'recover' && <button className="auth-switch" type="button" onClick={() => { setAuthMode('signin'); setAuthMessage(''); }}>Voltar para entrar</button>}<div className="auth-secure">♧ &nbsp;Acesso protegido e seguro</div></form></section></div>;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#"><span className="brand-mark"><span /></span><span className="brand-name">orbe</span></a>
        <div className="workspace-label">ESPAÇO DE TRABALHO</div>
        <button className={`nav-item ${activePage === 'inventory' ? 'active' : ''}`} onClick={() => setActivePage('inventory')}><Icon name="inventory" /><span>Estoque</span></button>
        <button className={`nav-item ${activePage === 'expirations' ? 'active' : ''}`} onClick={() => setActivePage('expirations')}><Icon name="calendar" /><span>Validades</span>{expiringProducts.length > 0 && <span className="nav-count">{expiringProducts.length}</span>}</button>
        <div className="sidebar-bottom"><span className="avatar">{session?.email?.slice(0,1).toUpperCase() ?? 'O'}</span><div><strong>{session?.email ?? 'Operação'}</strong><small>Estoque compartilhado</small></div><button className="signout" onClick={() => void supabase?.auth.signOut()} title="Sair">↗</button></div>
      </aside>

      <main className="main-area">
        <header className="topbar"><div className="breadcrumbs">Workspace <span>/</span> <strong>{activePage === 'inventory' ? 'Gestão de estoque' : 'Validades dos produtos'}</strong></div><div className="topbar-status"><i /> Todos os dados atualizados</div></header>
        <div className="page-content" key={activePage}>
          {activePage === 'inventory' ? <>
          <div className="page-heading">
            <div><div className="eyebrow"><span className="eyebrow-dot" /> GESTÃO DE ESTOQUE</div><h1>Gestão de estoque</h1><p>Acompanhe seus produtos e mantenha tudo em ordem.</p></div>
            <Button onClick={() => setModalOpen(true)}><Icon name="plus" />Adicionar produto</Button>
          </div>

          {!supabase && <div className="mode-note"><div className="banner-info"><strong>Prévia local</strong><p>Os produtos ficam salvos neste navegador. Para compartilhar dados entre usuários e dispositivos, conecte o Supabase.</p></div></div>}
          {error && <div className="error-note"><div className="banner-error"><strong>Algo deu errado</strong><p>{error}</p><button onClick={() => setError('')}>×</button></div></div>}

          <div className="metrics-grid" aria-label="Resumo do estoque">
            <div className="metric-panel"><div className="metric-card"><div className="metric-icon teal"><Icon name="package" /></div><div><p>Produtos cadastrados</p><div className="metric-value">{products.length}<small> itens</small></div></div></div></div>
            <div className="metric-panel"><div className="metric-card"><div className="metric-icon blue"><Icon name="layers" /></div><div><p>Unidades disponíveis</p><div className="metric-value">{totalUnits}<small> un.</small></div></div></div></div>
            <div className="metric-panel"><div className="metric-card attention-metric"><div className="metric-icon amber"><Icon name="alert" /></div><div><p>Itens para revisar</p><div className="metric-value">{lowCount + outCount}<small> produtos</small></div></div><div className="metric-breakdown"><span>{lowCount} com até {LOW_STOCK_THRESHOLD} un.</span><span>{outCount} sem unidades</span></div></div></div>
          </div>

          <div className="inventory-card"><div className="inventory-head"><div><h2>Seus produtos</h2><p>Visualize e organize os itens do seu inventário.</p></div><span className="item-count">{products.length} {products.length === 1 ? 'produto' : 'produtos'}</span></div>
            <div className="toolbar"><div className="search-wrap"><Icon name="search" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar produto ou categoria" aria-label="Buscar produto ou categoria" /></div><div className="filter-wrap"><label htmlFor="status-filter">Status</label><span className="select-control"><select id="status-filter" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">Todos</option><option value="ok">Em estoque</option><option value="low">Estoque baixo</option><option value="out">Sem estoque</option></select></span></div></div>
            <div className="table-scroller"><table className="product-table"><thead><tr><th>PRODUTO</th><th>CATEGORIA</th><th>QUANTIDADE</th><th>SITUAÇÃO</th><th><span className="visually-hidden">Ações</span></th></tr></thead><tbody>
              {loading ? <tr><td colSpan={5} className="loading-cell"><span className="spinner" />Carregando estoque...</td></tr> : filtered.map((p) => {
                const status = p.quantity === 0 ? 'out' : p.quantity <= LOW_STOCK_THRESHOLD ? 'low' : 'ok';
                return <tr key={p.id}><td><div className="product-name"><span className="product-icon"><Icon name={categoryIconName(p.category)} /></span><strong>{p.name}</strong></div></td><td className="category-cell">{p.category}</td><td><div className="quantity-control"><button onClick={() => void changeQuantity(p, -1)} disabled={p.quantity <= 0} aria-label={`Diminuir quantidade de ${p.name}`}>−</button><strong>{p.quantity}</strong><button onClick={() => void changeQuantity(p, 1)} aria-label={`Aumentar quantidade de ${p.name}`}>+</button><span>un.</span></div></td><td><span className={`status-badge ${status}`}>{status === 'ok' ? 'Em estoque' : status === 'low' ? 'Estoque baixo' : 'Sem estoque'}</span></td><td className="actions-cell"><button className="icon-button delete" aria-label={`Excluir ${p.name}`} onClick={() => setDeleteTarget(p)}><Icon name="trash" /></button></td></tr>;
              })}
              {!loading && filtered.length === 0 && <tr><td colSpan={5}><div className="empty-state"><div className="empty-art"><div className="empty-box"><Icon name="package" /></div></div><h3>{products.length === 0 ? 'Seu estoque começa aqui' : 'Nenhum produto encontrado'}</h3><p>{products.length === 0 ? 'Cadastre seu primeiro produto para começar a acompanhar as quantidades.' : 'Tente ajustar sua busca ou trocar o filtro aplicado.'}</p>{products.length === 0 && <Button onClick={() => setModalOpen(true)}><Icon name="plus" />Adicionar primeiro produto</Button>}</div></td></tr>}
            </tbody></table></div>
            <div className="table-footer"><span>Exibindo {filtered.length} de {products.length} produtos</span><span className="shared-label"><span /> Estoque compartilhado</span></div>
          </div>
          
          </> : <section className="expiry-page">
            <div className="page-heading expiry-heading">
              <div><div className="eyebrow"><span className="eyebrow-dot" /> ACOMPANHAMENTO DE VALIDADE</div><h1>Validade dos medicamentos</h1><p>Priorize o que vence logo e revise o que já passou da data.</p></div>
              <div className="expiry-threshold"><Icon name="calendar" /><span>Aviso antecipado<strong>{EXPIRY_ALERT_DAYS} dias</strong></span></div>
            </div>
            <div className="expiry-summary" aria-label="Resumo dos alertas de validade">
              <button type="button" className={`expiry-summary-card upcoming ${expiryFilter === 'upcoming' ? 'selected' : ''}`} onClick={() => setExpiryFilter(expiryFilter === 'upcoming' ? 'all' : 'upcoming')} aria-pressed={expiryFilter === 'upcoming'}>
                <span className="expiry-summary-icon"><Icon name="calendar" /></span><span className="expiry-summary-copy"><span className="expiry-summary-label">Vencem nos próximos {EXPIRY_ALERT_DAYS} dias</span><strong>{upcomingCount}</strong><small>{upcomingCount === 1 ? 'medicamento para revisar' : 'medicamentos para revisar'}</small></span><span className="expiry-summary-link">Ver itens <b aria-hidden="true">→</b></span>
              </button>
              <button type="button" className={`expiry-summary-card overdue ${expiryFilter === 'expired' ? 'selected' : ''}`} onClick={() => setExpiryFilter(expiryFilter === 'expired' ? 'all' : 'expired')} aria-pressed={expiryFilter === 'expired'}>
                <span className="expiry-summary-icon"><Icon name="alert" /></span><span className="expiry-summary-copy"><span className="expiry-summary-label">Já vencidos</span><strong>{expiredCount}</strong><small>{expiredCount === 1 ? 'medicamento vencido' : 'medicamentos vencidos'}</small></span><span className="expiry-summary-link">Ver itens <b aria-hidden="true">→</b></span>
              </button>
            </div>
            <div className="inventory-card expiry-list">
              <div className="inventory-head expiry-list-head"><div><h2>Medicamentos em atenção</h2><p>Os alertas mostram itens vencidos e os que vencem em até {EXPIRY_ALERT_DAYS} dias.</p></div><span className="item-count">{visibleExpiringProducts.length} {visibleExpiringProducts.length === 1 ? 'item' : 'itens'}</span></div>
              <div className="expiry-toolbar"><span className="expiry-toolbar-label">Exibir</span><div className="expiry-tabs" role="group" aria-label="Filtrar por situação da validade">
                <button type="button" className={expiryFilter === 'all' ? 'active' : ''} aria-pressed={expiryFilter === 'all'} onClick={() => setExpiryFilter('all')}>Todos <span>{expiringProducts.length}</span></button>
                <button type="button" className={expiryFilter === 'upcoming' ? 'active' : ''} aria-pressed={expiryFilter === 'upcoming'} onClick={() => setExpiryFilter('upcoming')}>Próximos <span>{upcomingCount}</span></button>
                <button type="button" className={expiryFilter === 'expired' ? 'active' : ''} aria-pressed={expiryFilter === 'expired'} onClick={() => setExpiryFilter('expired')}>Vencidos <span>{expiredCount}</span></button>
              </div></div>
              {visibleExpiringProducts.length ? <div className="expiry-rows">{visibleExpiringProducts.map((p) => {
                const isExpired = p.daysUntilExpiry < 0;
                const daysLabel = isExpired ? `Vencido há ${Math.abs(p.daysUntilExpiry)} ${Math.abs(p.daysUntilExpiry) === 1 ? 'dia' : 'dias'}` : p.daysUntilExpiry === 0 ? 'Vence hoje' : `Vence em ${p.daysUntilExpiry} ${p.daysUntilExpiry === 1 ? 'dia' : 'dias'}`;
                return <article className={`expiry-row ${isExpired ? 'expired' : 'upcoming'}`} key={p.id}>
                  <div className="expiry-main"><span className="expiry-product-icon"><Icon name="medicine" /></span><div className="expiry-product"><strong>{p.name}</strong><small>{p.quantity} {p.quantity === 1 ? 'unidade' : 'unidades'} em estoque</small></div></div>
                  <div className="expiry-date"><small>Data de validade</small><strong>{new Date(`${p.expiration_date}T00:00:00`).toLocaleDateString('pt-BR')}</strong></div>
                  <div className="expiry-status"><span className={`expiry-badge ${isExpired ? 'expired' : 'upcoming'}`}>{daysLabel}</span></div>
                  <button type="button" className="expiry-row-action" onClick={() => { setQuery(p.name); setFilter('all'); setActivePage('inventory'); }} aria-label={`Ver ${p.name} no estoque`}>Ver no estoque <span aria-hidden="true">→</span></button>
                </article>;
              })}</div> : <div className="expiry-empty"><span className={`expiry-empty-mark ${expiryFilter === 'expired' && expiredCount ? 'attention' : ''}`} aria-hidden="true">{expiringProducts.length === 0 ? '✓' : '—'}</span><div><h3>{expiringProducts.length === 0 ? 'Tudo em dia' : expiryFilter === 'upcoming' ? 'Nenhum vencimento próximo' : expiryFilter === 'expired' ? 'Nenhum produto vencido' : 'Nenhum produto neste filtro'}</h3><p>{expiringProducts.length === 0 ? `Nenhum medicamento vence nos próximos ${EXPIRY_ALERT_DAYS} dias.` : 'Mude o filtro acima para conferir os outros itens.'}</p></div>{expiryFilter !== 'all' && <button className="secondary-button" onClick={() => setExpiryFilter('all')}>Ver todos</button>}</div>}
            </div>
          </section>}
        </div>
      </main>

      {modalOpen && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closeForm(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><div><h2 id="modal-title">Adicionar produto</h2><p>Inclua um novo item no estoque compartilhado.</p></div><button className="modal-close" onClick={closeForm} aria-label="Fechar">×</button></header><div className="modal-body"><label>Nome do produto<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Caderno universitário" autoFocus /></label><label>Categoria<span className="select-control"><select value={category} onChange={(e) => { setCategory(e.target.value); if (e.target.value !== 'Medicamentos') setExpirationDate(''); }}><option value="">Selecione uma categoria</option>{categories.map((c) => <option key={c}>{c}</option>)}</select></span></label>{category === 'Medicamentos' && <label>Data de validade<input type="date" value={expirationDate} onChange={(e) => setExpirationDate(e.target.value)} required /><small>Informe a validade indicada na embalagem.</small></label>}<label>Quantidade inicial<input type="number" min="1" step="1" required value={quantity} onChange={(e) => setQuantity(e.target.value)} /><small>Selecione pelo menos 1 unidade para cadastrar.</small></label></div><footer><button className="secondary-button" onClick={closeForm}>Cancelar</button><button className="primary-button" disabled={saving || !name.trim() || !category || !quantity || Number(quantity) < 1 || !Number.isInteger(Number(quantity)) || (category === 'Medicamentos' && !expirationDate)} onClick={() => void save()}>{saving ? 'Salvando…' : 'Salvar produto'}</button></footer></section></div>}
      {deleteTarget && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleteTarget(null); }}><section className="modal confirm-modal" role="dialog" aria-modal="true"><header><div><h2>Excluir produto?</h2></div><button className="modal-close" onClick={() => setDeleteTarget(null)} aria-label="Fechar">×</button></header><div className="modal-body"><p>O produto <strong>{deleteTarget.name}</strong> será removido do estoque compartilhado para todos os usuários.</p></div><footer><button className="secondary-button" onClick={() => setDeleteTarget(null)}>Cancelar</button><button className="danger-button" onClick={() => void remove()}>Excluir produto</button></footer></section></div>}
      {toast && <div className="toast" role="status">✓ &nbsp;{toast}<button onClick={() => setToast('')} aria-label="Fechar">×</button><span key={toastSequence} className="toast-timer" aria-hidden="true" /></div>}
    </div>
  );
}


type IconName = 'inventory' | 'package' | 'plus' | 'search' | 'trash' | 'calendar' | 'medicine' | 'hygiene' | 'layers' | 'alert' | 'food';

function categoryIconName(category: string): IconName {
  const icons: Record<string, IconName> = {
    'Medicamentos': 'medicine',
    'Higiene pessoal': 'hygiene',
    'Alimentos': 'food',
  };
  return icons[category] ?? 'package';
}

function Icon({ name }: { name: IconName }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const };
  const paths = {
    inventory: <><path d="M4 5.5h16v14H4z"/><path d="M8 5.5v-2h8v2M8 10h8M8 14h5"/></>,
    package: <><path d="m4 7 8-4 8 4v10l-8 4-8-4z"/><path d="m4 7 8 4 8-4M12 11v10M8 5l8 4"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4 4"/></>,
    trash: <><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></>,
    food: <><path d="M12 9c-4-3-9-.8-9 4.4 0 4.1 2.8 7.6 6.2 7.6 1.2 0 2-.4 2.8-.4s1.6.4 2.8.4c3.4 0 6.2-3.5 6.2-7.6C21 8.2 16 6 12 9Z"/><path d="M12 8c.1-2.4 1.6-4.2 4-5"/></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>,
    alert: <><path d="M12 3 2.8 19h18.4L12 3Z"/><path d="M12 9v4m0 3h.01"/></>,
    medicine: <><rect x="4.5" y="7" width="15" height="10" rx="5" transform="rotate(-45 12 12)"/><path d="m9.2 14.8 5.6-5.6"/></>,
    hygiene: <><path d="M9 3h6v3l2 2v13H7V8l2-2z"/><path d="M9 3h6M7 11h10M10 15h4"/></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function Button({ children, onClick, disabled = false }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button className="primary-button" onClick={onClick} disabled={disabled}>{children}</button>;
}
