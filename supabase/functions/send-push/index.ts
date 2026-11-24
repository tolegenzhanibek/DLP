// send-push: called by a DB trigger (pg_net) on every new notification.
// Authenticated by a shared secret stored in Vault + function env, not by a user JWT.
import webpush from "npm:web-push@3.6.7";
import { admin } from "../_shared/clients.ts";

const SECRET = Deno.env.get("PUSH_WEBHOOK_SECRET") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://senim.app";
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
// Without VAPID keys push is simply disabled; the function must still boot.
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT") ?? `mailto:no-reply@${new URL(SITE_URL).hostname}`,
    VAPID_PUBLIC,
    VAPID_PRIVATE,
  );
}

type Lang = "kk" | "ru" | "en";
const TEXT: Record<string, Record<Lang, string>> = {
  scan_done: { kk: "Құжат тексерілді", ru: "Документ проверен", en: "Document classified" },
  scan_resolved: { kk: "Дау қаралды", ru: "Спор рассмотрен", en: "Dispute resolved" },
  dispute_new: { kk: "Жаңа дау", ru: "Новый спор", en: "New dispute" },
  account_approved: { kk: "Аккаунтыңыз бекітілді", ru: "Аккаунт одобрен", en: "Your account is approved" },
  account_blocked: { kk: "Аккаунт бұғатталды", ru: "Аккаунт заблокирован", en: "Account blocked" },
};

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST" || !SECRET || !timingSafeEqual(req.headers.get("x-webhook-secret") ?? "", SECRET)) {
    return new Response("forbidden", { status: 403 });
  }
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return new Response("push not configured");
  const { notification_id } = await req.json().catch(() => ({}));
  if (typeof notification_id !== "string") return new Response("bad request", { status: 400 });

  const db = admin();
  const { data } = await db.rpc("push_payload", { p_notification: notification_id });
  if (!data) return new Response("skip");

  const lang = (data.language ?? "kk") as Lang;
  const payload = JSON.stringify({
    title: "Senim",
    body: [TEXT[data.kind]?.[lang] ?? "Senim", data.data?.file_name].filter(Boolean).join(": "),
    url: data.data?.scan_id ? `/app/scans/${data.data.scan_id}` : "/notifications",
  });

  await Promise.all(
    (data.subscriptions as { endpoint: string; p256dh: string; auth: string }[]).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          TTL: 3600,
        });
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.rpc("drop_push_subscription", { p_endpoint: s.endpoint });
      }
    }),
  );
  return new Response("ok");
});
