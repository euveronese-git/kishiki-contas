import { client, getSession } from "./db.js";

export async function ativarAvisoDiario() {
  const chave = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";
  if (!chave || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "O aviso no celular ainda não está ligado. O cartão daqui continua funcionando.";
  }
  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") return "Sem a permissão, o celular não avisa. O cartão daqui continua.";
  const registro = await navigator.serviceWorker.ready;
  const inscricao = await registro.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: chaveParaBytes(chave),
  });
  const json = inscricao.toJSON();
  const session = await getSession();
  const supabase = client();
  const { error } = await supabase.from("push_subscriptions").upsert({
    user_id: session.user.id,
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh || "",
    auth: json.keys?.auth || "",
  }, { onConflict: "user_id,endpoint" });
  if (error) return "A inscrição do aviso ainda não existe no banco. O cartão daqui continua funcionando.";
  return "Aviso diário ativado neste aparelho. Ele sai às 8h, quando o agendamento estiver ligado.";
}

function chaveParaBytes(chave) {
  const padded = chave + "=".repeat((4 - (chave.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}
