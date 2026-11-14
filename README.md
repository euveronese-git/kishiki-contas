# Kishiki · contas

Planilha pessoal da Kishiki IT Solutions: dívidas, compras, entradas e metas de site. Dá para marcar como pago ou recebido, editar, apagar e parcelar.

```bash
npm install
npm run dev
```

Abra `http://localhost:5173`.

Os dados ficam no Supabase. A URL e a chave publishable vão no `.env` local e, em produção, nas variáveis do Netlify:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Build: `npm run build`. Pasta publicada: `dist`.
