# Magazin Hisob-Kitob Bot

Kichik magazinlar uchun xarajatlarni yozib boruvchi va kunlik/haftalik/oylik hisobot beruvchi Telegram bot.

## Imkoniyatlari

- Xarajat qo'shish (oddiy matn orqali)
- `/hisobot` — hisobot olish (kunlik, haftalik, oylik)

## Texnologiyalar

- Node.js
- Telegraf (Telegram Bot API)
- Prisma ORM + SQLite

## O'rnatish

1. Repozitoriyani klon qiling va papkaga kiring.
2. `.env` faylini yarating (`.env.example` asosida) va o'z bot tokeningizni kiriting:

   ```
   BOT_TOKEN=sizning_bot_tokeningiz
   DATABASE_URL="file:./dev.db"
   ```

3. Paketlarni o'rnating:

   ```bash
   npm install
   ```

4. Ma'lumotlar bazasini yarating:

   ```bash
   npx prisma migrate dev --name init
   ```

5. Botni ishga tushiring:

   ```bash
   npm start
   ```

## Veb-saytni ishga tushirish

Bot bilan bir xil ma'lumotlar bazasidan foydalanadigan veb-dashboard mavjud:

```bash
npm run web
```

So'ng brauzerda oching: **http://localhost:3000**

Veb-saytda:
- Bugungi jami xarajat kassa cheki ko'rinishida yuqorida ko'rsatiladi
- Chapda — yangi xarajat qo'shish formasi
- O'ngda — Kunlik / Haftalik / Oylik hisobot (jadval + kunlar bo'yicha jamlar)
- Har bir yozuvni ✕ tugmasi orqali o'chirish mumkin

## Docker bilan ishga tushirish

Bot va veb-sayt ikkalasi ham bitta buyruq bilan ishga tushadi:

```bash
docker compose up -d --build
```

Veb-sayt: http://localhost:3000 (portni `docker-compose.yml` da o'zgartirish mumkin)

## Foydalanish

### Xarajat qo'shish

Botga oddiy xabar sifatida yuboring:

```
+ Non 20 120000
```

Format: `+ <mahsulot nomi> <miqdor> <narx>`

Yoki ko'p qatorli formatda:

```
Kategoriya: Non
Miqdor: 20
Narx: 120000
Izoh: ertalabki yetkazma
```

Bot javob beradi:

```
✅ Saqlandi.

Bugungi jami xarajat:
120 000 so'm
```

### Hisobot olish

| Buyruq | Natija |
|---|---|
| `/hisobot` | Bugungi (kunlik) hisobot |
| `/hisobot kunlik` | Kunlik hisobot |
| `/hisobot haftalik` | Shu haftaning hisobot (kunlar bo'yicha) |
| `/hisobot oylik` | Shu oyning hisobot (kunlar bo'yicha + eng katta xarajat) |

## Loyiha strukturasi

```
magazin-bot/
├── prisma/
│   └── schema.prisma      # Ma'lumotlar bazasi sxemasi
├── src/
│   ├── db.js              # Prisma client
│   ├── utils.js           # Sana/raqam formatlash yordamchilari
│   ├── parser.js          # Xarajat matnini tahlil qilish
│   ├── report.js          # Kunlik/haftalik/oylik hisobot generatsiyasi (bot uchun matn)
│   ├── index.js           # Bot va handlerlar
│   └── web/
│       ├── server.js      # Express server (API)
│       ├── stats.js       # Hisobot ma'lumotlari (JSON, web uchun)
│       └── public/        # Frontend (HTML/CSS/JS)
│           ├── index.html
│           ├── css/style.css
│           └── js/app.js
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## Kengaytirish

Loyiha keyinchalik quyidagilar bilan kengaytirilishi mumkin: daromad qo'shish, ombor, qarzdorlar, Excel/PDF eksport, admin panel, rollar (Super Admin/Admin/Kassir). Hozirgi versiya faqat xarajat va hisobot funksiyalariga qaratilgan — minimal va ishonchli.
