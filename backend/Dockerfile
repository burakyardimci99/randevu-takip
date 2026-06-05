# Backend (Express + TypeScript) — dev odaklı image.
# Native modüller (better-sqlite3, argon2) genelde prebuild iner; inmezse
# python3/make/g++ ile kaynaktan derlenir. Kaynak runtime'da volume-mount edilir
# (hot-reload), node_modules ise anonim volume ile container'ın linux-native
# kopyası korunur (host'un darwin binary'leri gölgelenmez).
FROM node:22-bookworm-slim

WORKDIR /app

# Native bağımlılıkların kaynaktan derlenmesi gerekirse diye build araçları.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Önce manifest → katman cache (kaynak değişince npm install tekrar koşmasın).
COPY package*.json ./
RUN npm install

# Kaynak (dev'de bind-mount ile gölgelenir; image yine de çalışır halde).
COPY . .

# NOT: Non-root sertleştirme (USER node) yalnız PRODUCTION image'inde (Dockerfile.prod)
# uygulanır. Dev image'de bind-mount edilen `./backend:/app` host-sahipli (0700 data/)
# olduğundan `node` kullanıcısı Linux'ta data/ dizinine yazamaz (EACCES) → dev'de
# root kalır (yalnız yerel geliştirme; internet-facing değil).

EXPOSE 4000

# tsx watch — kod değişince otomatik reload.
CMD ["npm", "run", "dev"]
