# Orbe — gestão de estoque

MVP de gestão de estoque compartilhado, feito em React, TypeScript, Vite e Supabase. Qualquer usuário autenticado pode consultar e administrar o mesmo catálogo. O banco começa vazio.

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
2. Aplique [`supabase/migrations/20261020000000_create_shared_products_inventory.sql`](supabase/migrations/20261020000000_create_shared_products_inventory.sql) pelo SQL Editor ou pela Supabase CLI.
3. Configure URL e chave publishable como variáveis de ambiente do build.
4. Em Authentication → URL Configuration, informe a URL publicada como Site URL e Redirect URL para os fluxos de confirmação de e-mail e recuperação de senha.

A tabela `public.products` tem RLS habilitado. Usuários autenticados podem ler, inserir, atualizar e excluir produtos compartilhados; visitantes anônimos não têm acesso. Nenhum produto de exemplo é criado. Nunca coloque uma chave `service_role` no cliente.

**E-mail de autenticação:** para permitir confirmação e recuperação para qualquer endereço, configure um provedor SMTP próprio no Supabase Auth. O SMTP padrão do Supabase tem restrições de destinatários e volume.

## Publicar grátis no Cloudflare Pages

Conecte este repositório ao Cloudflare Pages e configure:

- Build command: `npm run build`
- Build output directory: `dist`
- Variáveis de build: `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`

Após o primeiro deploy, adicione o domínio `*.pages.dev` (ou o domínio personalizado) às Redirect URLs do Supabase Auth.
