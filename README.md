# Senim (DLP)

AI-мен құжаттарды құпиялылық деңгейі бойынша автоматты жіктеу және деректердің ағып кетуін болдырмау.

Қолданушы файлды (PDF, DOCX, TXT, CSV…) жүктейді немесе мәтінді қояды. Senim оған төрт деңгейдің бірін береді: **Ашық / Ішкі / Құпия / Қатаң құпия**. Сонымен бірге табылған сезімтал деректерді (ЖСН, БСН, карта, IBAN, кілттер, құпиясөздер…) жасырылған түрде көрсетеді, ал қолданушы нәтижені растайды немесе дау айтады. Әкімші дауларды қарап, өз ережелерін (кілт сөздерді) қосады.

## Жіктеу қалай жұмыс істейді

```
мәтін (браузерде шығарылады; файлдың өзі серверге жүктелмейді)
  → [Edge Function: classify]
      1. Детерминистік детекторлар: ЖСН/БСН (checksum), Luhn, IBAN mod-97, кілттер, белгілер, әкімші ережелері
         → rule_level (төменгі шек)
      2. Табылған мәндер [IIN], [CARD]… токендерімен ауыстырылады
      3. Claude жасырылған мәтінді мағынасы бойынша жіктейді (structured output) → ai_level
      4. final = max(rule_level, ai_level)
  → БД-ға тек метадерек, жасырылған үлгілер мен нәтиже сақталады. Құжат мәтіні САҚТАЛМАЙДЫ.
```
Prompt injection AI деңгейін ереже тапқан деңгейден төмен түсіре алмайды. AI қолжетімсіз болса, жүйе ережелер бойынша жұмысын жалғастырады.

## Стек

React, Vite, TypeScript, React Router, i18next (kk/ru/en) · Supabase (Postgres, RLS, Auth+TOTP, Storage, Realtime, Edge Functions, Vault, pg_net) · Resend SMTP · Cloudflare Turnstile · Vercel · PWA және Web Push · Claude API.

## Құрылымы

```
src/                      фронтенд (pages, components, lib, i18n)
supabase/migrations/      0001 core · 0002 scans · 0003 admin · 0004 integrations
supabase/functions/       login · classify · send-push · _shared/detectors.ts
supabase/templates/       үш тілдегі хаттар (scripts/build-email-templates.mjs арқылы жасалады)
supabase/tests/           Postgres-тегі RLS және RPC тесттері
integrations/google-sheets/Code.gs
docs/SETUP.md             іске қосу нұсқаулығы
```

## Қауіпсіздік

- RLS барлық кестеде қосулы. Клиент кестеге тікелей жаза алмайды: әр өзгеріс `auth.uid()` тексеретін `security definer` функциясы арқылы өтеді.
- Профильдің жеке бағандары (телефон, почта, қала, жыныс) таблица деңгейінде жабық. Иесі оларды тек `my_profile()` арқылы оқиды.
- Әкімшінің әр RPC-і `role = admin` **және** `aal2` (TOTP) талап етеді.
- Әкімші ережелері тек кілт сөзден тұрады. Regex қолданылмайды, себебі ол ReDoS тәуекелін тудырады.
- Rate limit қойылған: кіру (IP және логин бойынша), құпиясөзді тексеру және жіктеу.
- Кілттер тек `supabase secrets` пен Vault-та сақталады. `service_role` клиентте ешқашан қолданылмайды.

Іске қосу: [docs/SETUP.md](docs/SETUP.md)
