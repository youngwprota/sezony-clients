FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000
# миграции и начальные данные (повторный запуск ничего не перезаписывает)
CMD ["sh", "-c", "npx prisma migrate deploy && npm run db:seed && npm start"]
