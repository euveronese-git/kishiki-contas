# Kishiki · contas

Planilha pessoal da Kishiki IT Solutions: dívidas, compras, entradas e metas de site. Dá para marcar como pago ou recebido, editar, apagar e parcelar.

```bash
npm install
npm run dev
```

Abra `http://localhost:5173`.

Entrar: o site pede o e-mail `euveronese@gmail.com` e envia um código/link.

Os dados ficam no Supabase. A URL e a chave publishable vão no `.env` local e, em produção, nas variáveis do Netlify:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

No ar: https://kishiki-contas.netlify.app

Build: `npm run build`. Pasta publicada: `dist`. Cada push em `main` no GitHub gera um deploy novo.
