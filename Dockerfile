FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma

# Barcha paketlarni o'rnatish (prisma generate uchun devDeps ham kerak)
RUN npm install

COPY . .

# Prisma client generatsiya qilish
RUN npx prisma generate

EXPOSE 3000

# Start: avval migrate, keyin bot (bot ichida web server ham ishga tushadi)
CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
