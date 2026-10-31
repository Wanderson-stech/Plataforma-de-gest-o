# Orbe — gestão de estoque

MVP de gestão de estoque compartilhado, feito em React, TypeScript, Vite e Supabase. Somente contas autorizadas podem consultar e administrar o catálogo.

## Executar localmente

```bash
npm install
cp .env.example .env.local
# preencha as variáveis Supabase em .env.local
npm run dev
```

Sem configuração Supabase, o app abre em modo de demonstração com dados salvos apenas no navegador atual. Para o uso real compartilhado, configure as duas variáveis abaixo e aplique a migration.

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sua-chave-publishable
```

## Supabase

1. Crie ou selecione um projeto Supabase.
2. Aplique as migrations em `supabase/migrations` na ordem dos nomes, incluindo `restrict_inventory_access`.
3. Crie os usuários permitidos em Authentication → Users e adicione seus IDs a `public.inventory_access` pelo SQL Editor. Somente contas nessa tabela acessam o estoque.
4. Configure URL e chave publishable como variáveis de ambiente do build.
5. Em Authentication → URL Configuration, informe a URL publicada como Site URL e Redirect URL para confirmação de e-mail e recuperação de senha.

A tabela `public.products` tem RLS habilitado. Visitantes e contas sem autorização não podem consultar nem alterar os produtos. A tela não oferece cadastro público. Para liberar outra pessoa, crie a conta pelo painel do Supabase e inclua o UUID dela em `public.inventory_access`. Nunca coloque uma chave `service_role` no cliente.

**E-mail de autenticação:** para permitir confirmação e recuperação para qualquer endereço, configure um provedor SMTP próprio no Supabase Auth. O SMTP padrão do Supabase tem restrições de destinatários e volume.

## Publicar grátis no Cloudflare Pages

Conecte este repositório ao Cloudflare Pages e configure:

- Build command: `npm run build`
- Build output directory: `dist`
- Variáveis de build: `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`

Após o primeiro deploy, adicione o domínio `*.pages.dev` (ou o domínio personalizado) às Redirect URLs do Supabase Auth.
