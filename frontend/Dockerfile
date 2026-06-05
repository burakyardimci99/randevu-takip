# Frontend (Vite + React) — dev odaklı image.
# Native modül yok; slim yeterli. Kaynak runtime'da volume-mount edilir (HMR).
FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# NOT: Non-root sertleştirme yalnız PRODUCTION image'inde (Dockerfile.prod → nginx)
# uygulanır. Dev image bind-mount edilen host kaynağıyla çalışır; root kalır
# (yalnız yerel geliştirme).

EXPOSE 5173

# Vite dev — tüm arayüzlere bind (container dışından erişim için).
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
