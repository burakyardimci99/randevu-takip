# Kuveyt Türk AI Lab · Oda Kiralama Sistemi

Bankacılık güvenlik standartlarına uygun (docs/security/app_security.md & docs/security/data_security.md) demo amaçlı bir oda kiralama / randevu uygulaması.

İstanbul'un 25 farklı ilçesindeki AI Lab odalarını kullanıcıların 1, 2 veya 3 aylık periyotlarla kiralayabildiği, **vibe coding** proje fikirlerini sunduğu; admin'in onayladığı / reddettiği / düzeltme istediği bir sistem.

## Mimari

```
┌──────────────────┐         ┌──────────────────────────────┐
│  Frontend        │         │  Backend                     │
│  React + Vite    │  HTTPS  │  Express + TypeScript        │
│  Tailwind CSS    │ ───────►│  RS256 JWT (User/Admin AYRI) │
│  React Router    │         │  PostgreSQL (pg)             │
└──────────────────┘         │  Helmet · Rate Limit · CORS  │
                             │  Argon2id · Audit Log        │
                             └──────────────────────────────┘
```

### Güvenlik Önlemleri

| Kural | Uygulama | Kaynak |
|------|---------|--------|
| RS256 JWT (HS256 yasak) | 4096-bit RSA keypair, User/Admin için ayrı | app_security §4 |
| Refresh token rotation | Her refresh'te yeni token, eski revoke | app_security §4 |
| Argon2id parola hash | memoryCost 2^16, timeCost 3 | app_security §7 |
| Brute force koruması | 5 deneme → 15 dk lockout | app_security §4 |
| Parola politikası | Min 12 karakter + karmaşıklık | app_security §4 |
| Rate limiting | Global + auth endpoint özel limit | app_security §6 |
| CORS whitelist | Wildcard yasak, sadece izinli origin | app_security §6 |
| Helmet + CSP | HSTS, X-Frame-Options, no-sniff, CSP | app_security §6 |
| Input validation (Zod) | Whitelist tabanlı, tüm endpointlerde | app_security §3 |
| Parameterized queries | Tüm DB sorguları placeholder ile | app_security §3 |
| Race condition koruması | Transaction + uygunluk kontrolü | app_security §10 |
| IDOR koruması | User sadece kendi booking'ini görür | app_security §5 |
| Audit log | Auth, authz, booking, rate-limit | app_security §8 |
| PII/secret scrubber | Log yazılırken otomatik [REDACTED] | data_security §4 |
| Generic auth hatası | Kullanıcı varlığı ifşa edilmez | app_security §8 |
| Admin/User izolasyonu | Ayrı tablo, ayrı key pair, ayrı middleware | app_security §5 |

## Kurulum

### Docker ile (önerilen)

Tüm stack (PostgreSQL + backend + frontend) tek komutla:

```bash
docker compose up -d --build
# frontend: http://localhost:5173 · backend: http://localhost:4000
```

Dev stack kaynak değişikliklerini hot-reload eder (backend `tsx watch`, frontend Vite HMR). İlk açılışta şema + demo seed otomatik yüklenir.

Görsel üretimi (opsiyonel) için **ücretsiz Hugging Face token** — [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)'den "Read" rolünde alınır (FLUX.1-schnell, API key maliyeti yok):

```bash
export HUGGINGFACE_API_KEY=hf_...
docker compose up -d --force-recreate backend
```

> Alternatif sağlayıcılar `IMAGE_PROVIDER=pollinations` (`POLLINATIONS_TOKEN`) veya `IMAGE_PROVIDER=gemini` (`GEMINI_API_KEY`) ile seçilebilir.

### Manuel kurulum (Docker'sız)

Backend:
```bash
cd backend
npm install
npm run setup       # RSA keypair üret + DB schema + seed data
cp .env.example .env
# .env içindeki CSRF_SECRET'ı en az 32 karaktere genişlet
npm run dev         # http://127.0.0.1:4000
```

Frontend:
```bash
cd frontend
npm install
npm run dev         # http://127.0.0.1:5173
```

Vite, `/api` isteklerini backend'e proxy eder.

### Production dağıtımı

Üretim için ayrı, sertleştirilmiş stack (multi-stage image, non-root kullanıcı, dışa kapalı DB/backend portları, env'den zorunlu secret):

```bash
cp .env.prod.example .env.prod    # değerleri doldur: güçlü parolalar, CSRF_SECRET, POLLINATIONS_TOKEN
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
# nginx :80 → statik frontend + /api reverse proxy → backend
```

JWT anahtarları image'e gömülmez; `backend/keys/*.pem` salt-okunur volume ile mount edilir (`cd backend && npm run keys:generate` ile üretilir). HTTPS için önüne TLS terminasyonu yapan bir reverse-proxy/LB konmalı (`X-Forwarded-Proto` başlığını iletmeli — backend `trust proxy` ile okur ve secure cookie üretir).

## Demo Hesaplar

| Tip | E-posta | Parola |
|-----|---------|--------|
| Kullanıcı | `user@klab.test` | `Demo1234!Pass` |
| Kullanıcı | `ayse.yilmaz@klab.test` | `Ayse1234!Pass` |
| Kullanıcı | `mehmet.demir@klab.test` | `Mehmet1234!` |
| Admin | `admin@klab.test` | `Admin1234!Pass` |

> Demo amaçlı oluşturulmuştur. Gerçek müşteri verisi kullanmayın (data_security §6).

## Kullanıcı Akışı

1. **Landing** (`/`) → "Kullanıcı Girişi" veya "Admin Girişi" kartı.
2. **User Login** (`/login`) → Demo credential ile giriş.
3. **Rooms** (`/rooms`) → 25 odanın grid görünümü, ilçe/mahalle ismi, müsaitlik durumu, kapasite.
4. **Kiralama Modal** → Periyot (1/2/3 ay), başlangıç tarihi, proje adı, proje açıklaması (vibe coding fikri), yardım talebi, teknolojiler (multi-select + custom).
5. **Bookings** (`/bookings`) → Talep listesi + admin geri bildirimi.

## Admin Akışı

1. **Admin Login** (`/admin/login`) → Ayrı JWT key pair ile auth.
2. **Dashboard** (`/admin`) → İstatistik kartları (toplam/pending/approved/rejected/feedback).
3. **Booking Detail Modal** → Tüm talep detayı + 3 aksiyon: **Onayla** / **Düzeltme İste** / **Reddet** (opsiyonel mesaj).

## API Endpoint'leri

### User
- `POST /api/user/auth/login`
- `POST /api/user/auth/refresh`
- `POST /api/user/auth/logout`
- `GET  /api/user/auth/me`
- `GET  /api/user/rooms`
- `GET  /api/user/bookings`
- `POST /api/user/bookings`
- `GET  /api/user/bookings/:id`

### Admin
- `POST /api/admin/auth/login`
- `POST /api/admin/auth/refresh`
- `POST /api/admin/auth/logout`
- `GET  /api/admin/auth/me`
- `GET  /api/admin/bookings?status=...`
- `GET  /api/admin/bookings/:id`
- `POST /api/admin/bookings/:id/review` (action: approve | reject | request_feedback)
- `GET  /api/admin/stats`

## Veritabanı Şeması

- `users`, `admins` — Auth (ayrı tablolar)
- `rooms` — 25 İstanbul odası (Kadıköy-Moda, Beşiktaş-Bebek, …)
- `bookings` — Kiralama istekleri (user_id, room_id, period, dates, project, status)
- `refresh_tokens` — Rotation için SHA-256 hash ile saklı
- `audit_logs` — Auth, authz, rate-limit, booking, feedback olayları

## Lisans

İç kurumsal kullanım — Kuveyt Türk AI Lab.
