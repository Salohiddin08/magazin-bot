FROM node:20-slim

# Prisma uchun kerakli openssl kutubxonasini o'rnatamiz
RUN apt-get update -y && apt-get install -y openssl

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma

# Barcha paketlarni o'rnatamiz
RUN npm install

COPY . .

# Prisma client generatsiya qilamiz
RUN npx prisma generate

EXPOSE 3000

# Start: avval migration, keyin botni ishga tushirish
CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
