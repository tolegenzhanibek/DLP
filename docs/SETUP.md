# Senim — іске қосу нұсқаулығы

Аккаунт ашу, құпия кілттерді енгізу және төлем — бұларды тек сіз жасайсыз. Төменде әр қадам ретімен берілген. Кілттер ешқашан git-ке кірмейді.

## 0. Не керек

| Қызмет | Не үшін | Бағасы (MVP) |
|---|---|---|
| Supabase | Postgres, Auth, Storage, Realtime, Edge Functions | Free; HIBP тексеруі Pro жоспарында |
| Vercel | Фронтенд хостингі | Hobby: тегін |
| Resend | `no-reply@senim.app` хаттары (SMTP) | Free: айына 3000 хат |
| Cloudflare Turnstile | Captcha | Тегін |
| Anthropic API | AI жіктеу (Claude) | Токенге қарай төленеді |
| Google Sheets + Apps Script | Тіркелушілер кестесі | Тегін |
| Домен `senim.app` | Сайт пен почта | Тіркеушіге төленеді |

Компьютеріңізге орнатыңыз: Node.js 22+ және Supabase CLI (`npm i -g supabase`).

## 1. Supabase жобасы

1. supabase.com → New project. Region: Frankfurt (eu-central-1), Қазақстанға ең жақын аймақ.
2. Жобаны байланыстырып, миграцияларды жүктеңіз:
   ```bash
   supabase login
   supabase link --project-ref <PROJECT_REF>
   supabase db push          # supabase/migrations/0001…0004 орындалады
   ```
3. **Authentication → Providers → Email** бөлімін тексеріңіз: «Confirm email» қосулы, «Secure email change» қосулы болуы керек.
4. **Authentication → Policies (Password)**: «Prevent use of leaked passwords» (HaveIBeenPwned) параметрін қосыңыз. Бұл Pro жоспарда ғана бар.
5. **Authentication → URL Configuration**: Site URL = `https://senim.app`, Redirect URLs-ке `http://localhost:5173` қосыңыз.

## 2. Почта (Resend)

1. resend.com → Domains → `senim.app` қосыңыз, сосын DNS-ке SPF, DKIM және DMARC жазбаларын енгізіңіз.
2. API Key жасаңыз.
3. Auth баптаулары мен хат үлгілерін жүктеңіз (үлгілер `supabase/templates/` бумасында):
   ```bash
   export RESEND_API_KEY=re_...          # тек терминалда, файлға жазбаңыз
   export TURNSTILE_SECRET_KEY=0x...
   supabase config push                  # supabase/config.toml: SMTP, captcha, хат үлгілері, TOTP
   ```
   Хат жіберуші `no-reply@senim.app`, аты «Senim». Хат үш тілде келеді, ал ондағы батырма `/confirm-email` немесе `/reset-password` бетін ашады.

## 3. Captcha (Cloudflare Turnstile)

Cloudflare → Turnstile → Add site → `senim.app` және `localhost` доменін қосыңыз.
- **Site key** фронтендке беріледі: `VITE_TURNSTILE_SITE_KEY`.
- **Secret key** Supabase-ке беріледі: 2-қадамдағы `TURNSTILE_SECRET_KEY`.

## 4. Edge Functions

```bash
supabase secrets set \
  ANTHROPIC_API_KEY=sk-ant-... \
  SITE_URL=https://senim.app \
  PUSH_WEBHOOK_SECRET=<ұзын кездейсоқ жол> \
  VAPID_PUBLIC_KEY=<...> VAPID_PRIVATE_KEY=<...> VAPID_SUBJECT=mailto:no-reply@senim.app
supabase functions deploy login classify send-push
```
- VAPID кілттерін бір рет жасаңыз: `npx web-push generate-vapid-keys`.
- `CLASSIFIER_MODEL` міндетті емес. Әдепкі мән: `claude-opus-5-5`. AI шығынын азайтқыңыз келсе, басқа модель қоюға болады.
- `ANTHROPIC_API_KEY` берілмесе де жүйе жұмыс істейді: нәтиже тек ережелер бойынша шығады, ал экранда «AI бапталмаған» деп көрсетіледі.

## 5. Vault (pg_net триггерлеріне арналған құпиялар)

SQL Editor-да орындаңыз. Мәндерді өзіңіз қоясыз:
```sql
select vault.create_secret('https://<PROJECT_REF>.supabase.co/functions/v1/send-push', 'push_function_url');
select vault.create_secret('<PUSH_WEBHOOK_SECRET-пен бірдей>', 'push_webhook_secret');
select vault.create_secret('<Apps Script web app URL>', 'sheets_webhook_url');
select vault.create_secret('<Apps Script SHARED_SECRET-пен бірдей>', 'sheets_webhook_secret');
```

## 6. Google Sheets

1. Жаңа Google кестесін ашыңыз → Extensions → Apps Script. `integrations/google-sheets/Code.gs` кодын қойыңыз.
2. Project Settings → Script properties бөліміне `SHARED_SECRET` = ұзын кездейсоқ жол қосыңыз.
3. Deploy → New deployment → Web app. Execute as: **Me**, Who has access: **Anyone**.
4. Алынған URL мен secret мәнін 5-қадамдағы Vault-қа енгізіңіз.

Кестеге id, nickname, аты, почта, телефон, жынысы, қала, рөл, мәртебе және тіл жазылады. «Өзі туралы» мен сілтемелер кестеге түспейді.

## 7. Vercel

1. vercel.com → Import Git Repository → осы репо. Framework: Vite.
2. Environment Variables (Production) бөліміне мыналарды енгізіңіз:
   ```
   VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon public key>
   VITE_TURNSTILE_SITE_KEY=<site key>
   VITE_VAPID_PUBLIC_KEY=<VAPID public>
   VITE_SITE_URL=https://senim.app
   ```
   Бұл жерге тек public кілттер енгізіледі. `service_role` мұнда **ешқашан** болмайды.
3. Domains бөлімінде `senim.app` доменін қосыңыз. Осыдан кейін әр `git push` сайтты өзі жаңартады.

## 8. Бірінші әкімші

1. Сайтта өзіңіз тіркеліп, почтаны растаңыз.
2. SQL Editor-да мынаны орындаңыз:
   ```sql
   update public.profiles set role = 'admin', status = 'active' where nickname = '<сіздің никнейм>';
   ```
3. «Әкімші» бөліміне кіргенде жүйе authenticator QR кодын көрсетеді (Google Authenticator, 1Password сияқты қосымшалар). Кейінгі әр кіруде 6 таңбалы код сұралады.

Жаңа қолданушылар `pending` күйінде тіркеледі. Әкімші оларды «Қолданушылар» бөлімінде бекітеді.

## 9. Жергілікті әзірлеу

```bash
cp .env.example .env.local   # мәндерді толтырыңыз
npm install
npm run dev                  # http://localhost:5173
npm test                     # детектор тесттері
npm run build                # tsc + vite build
```
DB тесттері нақты Postgres-те орындалады (Supabase-тің стабымен):
`PGHOST=... PGUSER=postgres supabase/tests/run.sh`

## 10. Сайтқа шыққанын тексеру

Deploy-дан кейін сайттың JS файлынан жаңа өзгеріске ғана тән жолды іздеңіз:
```bash
curl -s https://senim.app | grep -o '/assets/index-[^"]*\.js' | head -1 \
  | xargs -I{} curl -s https://senim.app{} | grep -c "Ақпарат ағып кетпей"
```
