import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { addProduct, deleteProduct, getProducts, supabase, updateQuantity } from './data';
import type { Product } from './types';

const categories = ['Acessórios', 'Eletrônicos', 'Escritório', 'Casa', 'Outros'];

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [quantity, setQuantity] = useState('0');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [authLoading, setAuthLoading] = useState(Boolean(supabase));
  const [session, setSession] = useState<{ email?: string } | null>(null);
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'recover' | 'update'>('signin');
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
      void supabase.auth.getSession().then(({ data }) => { setSession(data.session?.user ?? null); setAuthLoading(false); });
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
        setSession(nextSession?.user ?? null);
        setAuthLoading(false);
        if (event === 'PASSWORD_RECOVERY') setAuthMode('update');
        if (nextSession) void refresh();
      });
      return () => subscription.unsubscribe();
    }
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!supabase || !session) return;
    const client = supabase;
    const channel = client.channel('products-live').on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => { void refresh(); }).subscribe();
    return () => { void client.removeChannel(channel); };
  }, [refresh, session]);

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setAuthMessage(''); setAuthLoading(true);
    if (!supabase) return;
    const result = authMode === 'signin'
      ? await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })
      : authMode === 'signup'
        ? await supabase.auth.signUp({ email: authEmail, password: authPassword })
        : authMode === 'recover'
          ? await supabase.auth.resetPasswordForEmail(authEmail, { redirectTo: window.location.origin })
          : await supabase.auth.updateUser({ password: authPassword });
    setAuthLoading(false);
    if (result.error) setAuthMessage(result.error.message);
    else if (authMode === 'signup' && 'session' in result.data && !result.data.session) setAuthMessage('Conta criada. Confira seu e-mail para confirmar o cadastro e depois entre.');
    else if (authMode === 'recover') setAuthMessage('Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha.');
    else if (authMode === 'update') { setAuthMessage('Senha atualizada. Entre novamente com a nova senha.'); setAuthMode('signin'); await supabase.auth.signOut(); }
  };

  const filtered = useMemo(() => products.filter((p) => {
    const matches = `${p.name} ${p.category}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'));
    const state = p.quantity === 0 ? 'out' : p.quantity <= 5 ? 'low' : 'ok';
    return matches && (filter === 'all' || state === filter);
  }), [products, query, filter]);
  const totalUnits = products.reduce((n, p) => n + p.quantity, 0);
  const lowCount = products.filter((p) => p.quantity > 0 && p.quantity <= 5).length;
  const outCount = products.filter((p) => p.quantity === 0).length;

  if (!supabase && !import.meta.env.DEV) return <div className="auth-loading"><strong>Conexão com o banco não configurada.</strong><br />Configure as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no ambiente de produção.</div>;

  const closeForm = () => { setModalOpen(false); setName(''); setCategory(''); setQuantity('0'); };
  const save = async () => {
    if (!name.trim() || !category || !Number.isInteger(Number(quantity)) || Number(quantity) < 0) return;
    setSaving(true);
    try { await addProduct({ name: name.trim(), category, quantity: Number(quantity) }); closeForm(); await refresh(); setToast('Produto adicionado ao estoque.'); }
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
    try { await deleteProduct(deleteTarget.id); setProducts((current) => current.filter((p) => p.id !== deleteTarget.id)); setToast('Produto excluído.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível excluir o produto.'); }
    finally { setDeleteTarget(null); }
  };

  if (supabase && authLoading) return <div className="auth-loading"><span className="spinner" />Conectando ao Orbe…</div>;
  if (supabase && (!session || authMode === 'update')) return <div className="auth-screen"><section className="auth-brand-panel"><a className="brand auth-brand" href="#"><span className="brand-mark"><span /></span><span className="brand-name">orbe</span></a><div className="auth-copy"><div className="eyebrow"><span className="eyebrow-dot" /> ESTOQUE INTELIGENTE</div><h1>Organize hoje.<br/>Cresça amanhã.</h1><p>Tudo o que você precisa para acompanhar produtos, quantidades e o ritmo do seu negócio.</p><div className="auth-orbit orbit-one"/><div className="auth-orbit orbit-two"/><div className="auth-orbit orbit-three"/></div><small>© 2026 Orbe · Plataforma de gestão</small></section><section className="auth-form-panel"><form className="auth-form" onSubmit={(e) => void submitAuth(e)}><div className="eyebrow">ACESSO AO SISTEMA</div><h2>{authMode === 'signin' ? 'Bem-vindo de volta' : authMode === 'signup' ? 'Crie sua conta' : authMode === 'recover' ? 'Redefinir senha' : 'Escolha uma nova senha'}</h2><p>{authMode === 'signin' ? 'Entre para acessar o estoque compartilhado.' : authMode === 'signup' ? 'Cadastre-se para acessar o espaço de trabalho.' : authMode === 'recover' ? 'Enviaremos um link para o seu e-mail.' : 'Defina uma nova senha para sua conta.'}</p>{authMessage && <div className="auth-message" role="status">{authMessage}</div>}{authMode !== 'update' && <label>E-mail<input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="voce@empresa.com" required autoComplete="email" /></label>}{authMode !== 'recover' && <label>{authMode === 'update' ? 'Nova senha' : 'Senha'}<input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="Mínimo de 6 caracteres" required minLength={6} autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} /></label>}{authMode === 'signin' && <button className="auth-forgot" type="button" onClick={() => { setAuthMode('recover'); setAuthMessage(''); }}>Esqueceu a senha?</button>}<button className="primary-button auth-submit" disabled={authLoading}>{authLoading ? 'Aguarde…' : authMode === 'signin' ? 'Entrar na plataforma' : authMode === 'signup' ? 'Criar conta' : authMode === 'recover' ? 'Enviar link de recuperação' : 'Salvar nova senha'}</button>{authMode !== 'update' && <button className="auth-switch" type="button" onClick={() => { setAuthMode(authMode === 'signin' ? 'signup' : 'signin'); setAuthMessage(''); }}>{authMode === 'signin' ? 'Ainda não tem uma conta? Criar conta' : 'Voltar para entrar'}</button>}<div className="auth-secure">♧ &nbsp;Acesso protegido e seguro</div></form></section></div>;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#"><span className="brand-mark"><span /></span><span className="brand-name">orbe</span></a>
        <div className="workspace-label">ESPAÇO DE TRABALHO</div>
        <button className="nav-item active"><Icon name="inventory" /><span>Estoque</span></button>
        <div className="sidebar-bottom"><span className="avatar">{session?.email?.slice(0,1).toUpperCase() ?? 'O'}</span><div><strong>{session?.email ?? 'Operação'}</strong><small>Estoque compartilhado</small></div><button className="signout" onClick={() => void supabase?.auth.signOut()} title="Sair">↗</button></div>
      </aside>

      <main className="main-area">
        <header className="topbar"><div className="breadcrumbs">Workspace <span>/</span> <strong>Gestão de estoque</strong></div><div className="topbar-status"><i /> Todos os dados atualizados</div></header>
        <div className="page-content">
          <div className="page-heading">
            <div><div className="eyebrow"><span className="eyebrow-dot" /> ESTOQUE INTELIGENTE</div><h1>Gestão de estoque</h1><p>Acompanhe seus produtos e mantenha tudo em ordem.</p></div>
            <Button onClick={() => setModalOpen(true)}><Icon name="plus" />Adicionar produto</Button>
          </div>

          {!supabase && <div className="mode-note"><div className="banner-info"><strong>Prévia local</strong><p>Os produtos ficam salvos neste navegador. Para compartilhar dados entre usuários e dispositivos, conecte o Supabase.</p></div></div>}
          {error && <div className="error-note"><div className="banner-error"><strong>Algo deu errado</strong><p>{error}</p><button onClick={() => setError('')}>×</button></div></div>}

          <div className="metrics-grid">
            <div className="metric-panel"><div className="metric-card"><div className="metric-icon teal"><Icon name="package" /></div><div><p>Produtos cadastrados</p><div className="metric-value">{products.length}<small> itens</small></div></div><span className="metric-orbit" /></div></div>
            <div className="metric-panel"><div className="metric-card"><div className="metric-icon blue"><span>▤</span></div><div><p>Unidades em estoque</p><div className="metric-value">{totalUnits}<small> un.</small></div></div><span className="metric-orbit" /></div></div>
            <div className="metric-panel"><div className="metric-card"><div className="metric-icon amber"><span>!</span></div><div><p>Precisam de atenção</p><div className="metric-value">{lowCount + outCount}<small> itens</small></div></div><div className="metric-breakdown"><span>{lowCount} baixo</span><span>{outCount} zerado</span></div></div></div>
          </div>

          <div className="inventory-card"><div className="inventory-head"><div><h2>Seus produtos</h2><p>Visualize e organize os itens do seu inventário.</p></div><span className="item-count">{products.length} {products.length === 1 ? 'produto' : 'produtos'}</span></div>
            <div className="toolbar"><div className="search-wrap"><Icon name="search" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar produto ou categoria" aria-label="Buscar produto ou categoria" /></div><div className="filter-wrap"><label htmlFor="status-filter">Status</label><select id="status-filter" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">Todos</option><option value="ok">Em estoque</option><option value="low">Estoque baixo</option><option value="out">Sem estoque</option></select></div></div>
            <div className="table-scroller"><table className="product-table"><thead><tr><th>PRODUTO</th><th>CATEGORIA</th><th>QUANTIDADE</th><th>SITUAÇÃO</th><th><span className="visually-hidden">Ações</span></th></tr></thead><tbody>
              {loading ? <tr><td colSpan={5} className="loading-cell"><span className="spinner" />Carregando estoque...</td></tr> : filtered.map((p) => {
                const status = p.quantity === 0 ? 'out' : p.quantity <= 5 ? 'low' : 'ok';
                return <tr key={p.id}><td><div className="product-name"><span className="product-icon"><Icon name="package" /></span><strong>{p.name}</strong></div></td><td className="category-cell">{p.category}</td><td><div className="quantity-control"><button onClick={() => void changeQuantity(p, -1)} disabled={p.quantity <= 0} aria-label={`Diminuir quantidade de ${p.name}`}>−</button><strong>{p.quantity}</strong><button onClick={() => void changeQuantity(p, 1)} aria-label={`Aumentar quantidade de ${p.name}`}>+</button><span>un.</span></div></td><td><span className={`status-badge ${status}`}>{status === 'ok' ? 'Em estoque' : status === 'low' ? 'Estoque baixo' : 'Sem estoque'}</span></td><td className="actions-cell"><button className="icon-button delete" aria-label={`Excluir ${p.name}`} onClick={() => setDeleteTarget(p)}><Icon name="trash" /></button></td></tr>;
              })}
              {!loading && filtered.length === 0 && <tr><td colSpan={5}><div className="empty-state"><div className="empty-art"><div className="empty-box"><Icon name="package" /></div><i className="spark s1">✳</i><i className="spark s2">✦</i><i className="spark s3">·</i></div><h3>{products.length === 0 ? 'Seu estoque começa aqui' : 'Nenhum produto encontrado'}</h3><p>{products.length === 0 ? 'Cadastre seu primeiro produto para começar a acompanhar as quantidades.' : 'Tente ajustar sua busca ou trocar o filtro aplicado.'}</p>{products.length === 0 && <Button onClick={() => setModalOpen(true)}><Icon name="plus" />Adicionar primeiro produto</Button>}</div></td></tr>}
            </tbody></table></div>
            <div className="table-footer"><span>Exibindo {filtered.length} de {products.length} produtos</span><span className="shared-label"><span /> Estoque compartilhado</span></div>
          </div>
          <footer className="page-footer"><span><span className="footer-orb" /> Orbe <span>·</span> Organize hoje. Cresça amanhã.</span><span>Gestão simples, decisões melhores.</span></footer>
        </div>
      </main>

      {modalOpen && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closeForm(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><div><h2 id="modal-title">Adicionar produto</h2><p>Inclua um novo item no estoque compartilhado.</p></div><button className="modal-close" onClick={closeForm} aria-label="Fechar">×</button></header><div className="modal-body"><label>Nome do produto<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Caderno universitário" autoFocus /></label><label>Categoria<select value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Selecione uma categoria</option>{categories.map((c) => <option key={c}>{c}</option>)}</select></label><label>Quantidade inicial<input type="number" min="0" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} /><small>Você pode começar com zero unidades.</small></label></div><footer><button className="secondary-button" onClick={closeForm}>Cancelar</button><button className="primary-button" disabled={saving || !name.trim() || !category} onClick={() => void save()}>{saving ? 'Salvando…' : 'Salvar produto'}</button></footer></section></div>}
      {deleteTarget && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleteTarget(null); }}><section className="modal confirm-modal" role="dialog" aria-modal="true"><header><div><h2>Excluir produto?</h2></div><button className="modal-close" onClick={() => setDeleteTarget(null)} aria-label="Fechar">×</button></header><div className="modal-body"><p>O produto <strong>{deleteTarget.name}</strong> será removido do estoque compartilhado para todos os usuários.</p></div><footer><button className="secondary-button" onClick={() => setDeleteTarget(null)}>Cancelar</button><button className="danger-button" onClick={() => void remove()}>Excluir produto</button></footer></section></div>}
      {toast && <div className="toast" role="status">✓ &nbsp;{toast}<button onClick={() => setToast('')} aria-label="Fechar">×</button></div>}
    </div>
  );
}


function Icon({ name }: { name: 'inventory' | 'package' | 'plus' | 'search' | 'trash' }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const };
  const paths = { inventory: <><path d="M4 5.5h16v14H4z"/><path d="M8 5.5v-2h8v2M8 10h8M8 14h5"/></>, package: <><path d="m4 7 8-4 8 4v10l-8 4-8-4z"/><path d="m4 7 8 4 8-4M12 11v10M8 5l8 4"/></>, plus: <><path d="M12 5v14M5 12h14"/></>, search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4 4"/></>, trash: <><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"/></> };
  return <svg {...common}>{paths[name]}</svg>;
}

function Button({ children, onClick, disabled = false }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button className="primary-button" onClick={onClick} disabled={disabled}>{children}</button>;
}
