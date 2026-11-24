// Generates supabase/templates/*.html from one layout (run: node scripts/build-email-templates.mjs).
import { writeFileSync } from "node:fs";

const BRAND = "#0D0D0D";
const templates = {
  confirmation: {
    link: "{{ .SiteURL }}/confirm-email?token_hash={{ .TokenHash }}&type=signup",
    blocks: [
      ["Почтаңызды растаңыз", "Senim-де тіркелгеніңізге рахмет. Аккаунтты белсендіру үшін төмендегі батырманы басыңыз.", "Растау"],
      ["Подтвердите почту", "Спасибо за регистрацию в Senim. Нажмите кнопку ниже, чтобы активировать аккаунт.", "Подтвердить"],
      ["Confirm your email", "Thanks for signing up for Senim. Press the button below to activate your account.", "Confirm"],
    ],
  },
  recovery: {
    link: "{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery",
    blocks: [
      ["Құпиясөзді қалпына келтіру", "Жаңа құпиясөз қою үшін батырманы басыңыз. Сұрауды сіз жібермесеңіз, хатты елемеңіз.", "Жаңа құпиясөз қою"],
      ["Восстановление пароля", "Нажмите кнопку, чтобы задать новый пароль. Если вы не запрашивали сброс, проигнорируйте письмо.", "Задать пароль"],
      ["Reset your password", "Press the button to set a new password. If you did not request this, ignore this email.", "Set new password"],
    ],
  },
  email_change: {
    link: "{{ .SiteURL }}/confirm-email?token_hash={{ .TokenHash }}&type=email_change",
    blocks: [
      ["Жаңа почтаны растаңыз", "Аккаунт почтасын {{ .NewEmail }} мекенжайына ауыстыруды растаңыз.", "Растау"],
      ["Подтвердите новую почту", "Подтвердите смену почты аккаунта на {{ .NewEmail }}.", "Подтвердить"],
      ["Confirm your new email", "Confirm changing your account email to {{ .NewEmail }}.", "Confirm"],
    ],
  },
};

const block = ([title, text, cta], link, last) => `
          <tr><td style="padding:0 32px ${last ? 32 : 8}px">
            <h2 style="margin:0 0 8px;font-size:20px;line-height:28px;color:#0f172a;font-weight:800">${title}</h2>
            <p style="margin:0 0 20px;font-size:15px;line-height:24px;color:#475569">${text}</p>
            <a href="${link}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 24px;border-radius:14px">${cta}</a>
            ${last ? "" : '<hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0 20px">'}
          </td></tr>`;

for (const [name, t] of Object.entries(templates)) {
  const html = `<!doctype html>
<html lang="kk">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Senim</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;box-shadow:0 4px 24px rgba(15,23,42,.06)">
          <tr><td style="padding:32px 32px 24px">
            <img src="{{ .SiteURL }}/logo.png" width="120" height="36" alt="Senim" style="display:block;border:0">
          </td></tr>${t.blocks.map((b, i) => block(b, t.link, i === t.blocks.length - 1)).join("")}
      </table>
      <p style="margin:20px 0 0;font-size:13px"><a href="{{ .SiteURL }}" style="color:#64748b;text-decoration:none">senim.app</a></p>
    </td></tr>
  </table>
</body>
</html>
`;
  writeFileSync(new URL(`../supabase/templates/${name}.html`, import.meta.url), html);
}
console.log("templates written");
