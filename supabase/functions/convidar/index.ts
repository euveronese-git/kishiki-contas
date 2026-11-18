import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const APP_URL = "https://casaveronese.netlify.app";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "invalid" });
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const authorization = req.headers.get("Authorization") || "";
  if (!url || !anon || !service || !authorization) return json(401, { error: "unauthorized" });

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const caller = userData.user?.email?.toLowerCase() || "";
  if (userError || !caller) return json(401, { error: "unauthorized" });

  const { data: eu } = await userClient.from("acessos").select("papel").eq("email", caller).maybeSingle();
  if (eu?.papel !== "super") return json(403, { error: "unauthorized" });

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  if (!email.includes("@")) return json(400, { error: "invalid" });
  const { data: alvo } = await userClient.from("acessos").select("email").eq("email", email).maybeSingle();
  if (!alvo) return json(403, { error: "unauthorized" });

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const invite = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: APP_URL });
  if (!invite.error) return json(200, { enviado: "convite" });
  if (!/already|registered|exists/i.test(invite.error.message || "")) return json(502, { error: "invalid" });

  const recover = await fetch(`${url}/auth/v1/recover?redirect_to=${encodeURIComponent(APP_URL)}`, {
    method: "POST",
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
  });
  if (recover.status === 429) return json(429, { error: "O Supabase só deixa mandar poucos e-mails por hora. Espere e peça de novo." });
  if (!recover.ok) return json(502, { error: "invalid" });
  return json(200, { enviado: "recuperacao" });
});

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}
