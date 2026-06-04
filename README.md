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

### 1. Backend

```bash
cd backend
npm install
npm run setup       # RSA keypair üret + DB schema + seed data
cp .env.example .env
# .env içindeki CSRF_SECRET'ı en az 32 karaktere genişlet
npm run dev         # http://127.0.0.1:4000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev         # http://127.0.0.1:5173
```

Vite, `/api` isteklerini backend'e proxy eder.

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

## Geliştirme Araçları

### 21st.dev Magic MCP (frontend component üretimi)

Proje köküne `.mcp.json.example` örnek olarak commit edilmiştir. Gerçek API anahtarını içeren `.mcp.json` `.gitignore`'a alınmıştır (data_security §1).

Kurulum:
```bash
cp .mcp.json.example .mcp.json
# .mcp.json içindeki "YOUR_21ST_DEV_API_KEY_HERE" değerini gerçek anahtarınızla değiştirin
```

Claude Code projeyi açtığında `.mcp.json`'u otomatik yükler. Onay penceresi çıkarsa "Yes, use this server" seçin.

> **Güvenlik notu (data_security §8)**: 21st.dev üçüncü taraf bir AI servisi; demo ortam için kullanılabilir, production'da kurumsal allowlist + DPA + PII scrubber gateway zorunludur.

## Production'a Geçiş Notları

Aşağıdaki kalemler **mutlaka** production'a geçmeden tamamlanmalı:

- [ ] Keyleri **HashiCorp Vault / AWS KMS / Azure Key Vault**'tan al (data_security §1).
- [x] PostgreSQL + connection pooling (pg Pool, #7 — SQLite kaldırıldı).
- [ ] Token saklamayı `HttpOnly + Secure + SameSite=Strict` cookie'ye taşı; XSS yüzeyini küçült (app_security §6).
- [ ] CSP'yi sıkılaştır, `'unsafe-inline'` kaldırılsın; nonce kullan.
- [ ] HTTPS terminasyonu + HSTS preload.
- [ ] Reverse proxy (nginx/Cloudflare) ile WAF.
- [ ] Admin endpoint'lerini iç ağ / IP allowlist arkasına al (app_security §5).
- [ ] Şifre sıfırlama akışı + MFA (özellikle admin için zorunlu) (app_security §4).
- [ ] SBOM üretimi + bağımlılık CVE taraması CI/CD'ye (data_security §11).
- [ ] Log gönderimini merkezi SIEM'e + retention sürelerine uyum (data_security §4).
- [ ] Yük testi + DoS senaryosu.

## Lisans

İç kurumsal kullanım — Kuveyt Türk AI Lab.
