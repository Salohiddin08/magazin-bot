require('dotenv').config();
const { Telegraf, Markup, Input } = require('telegraf');
const { Readable } = require('stream');
const prisma = require('./db');
const { formatSum, getRange, formatDate } = require('./utils');
const { parseExpense, parseExpenseMultiline, parseDateRange } = require('./parser');
const { dailyReport, weeklyReport, monthlyReport, customReport } = require('./report');
const { generateExcelReport } = require('./excel');
const { initScheduler } = require('./scheduler');

// ---- Web server (single process uchun) ----
const path = require('path');
const express = require('express');
const stats = require('./web/stats');
const { getRange: getR } = require('./utils');

const webApp = express();
const WEB_PORT = process.env.WEB_PORT || 3000;
const WEB_URL = process.env.WEB_URL || `http://localhost:${WEB_PORT}`;

webApp.use(express.json());
webApp.use(express.static(path.join(__dirname, 'web', 'public')));

// Hisobot ma'lumotlarini olish
webApp.get('/api/report', async (req, res) => {
  try {
    const period = (req.query.period || 'kunlik').toLowerCase();
    let data;
    if (period === 'haftalik') data = await stats.getWeekly();
    else if (period === 'oylik') data = await stats.getMonthly();
    else data = await stats.getDaily();
    res.json({ ok: true, data });
  } catch (err) {
    console.error('Hisobot xatosi:', err);
    res.status(500).json({ ok: false, error: 'Hisobotni olishda xatolik yuz berdi.' });
  }
});

// Excel yuklab olish
webApp.get('/api/report/excel', async (req, res) => {
  try {
    let start, end;
    const { period, start: queryStart, end: queryEnd } = req.query;

    if (queryStart && queryEnd) {
      start = new Date(queryStart);
      end = new Date(queryEnd);
    } else {
      const p = (period || 'kunlik').toLowerCase();
      const range = getR(p);
      start = range.start;
      end = range.end;
    }

    const expenses = await prisma.expense.findMany({
      where: { createdAt: { gte: start, lte: end } },
      orderBy: { createdAt: 'asc' },
    });

    const title = 'Xarajatlar Hisoboti';
    const subtitle = `${formatDate(start)} - ${formatDate(end)}`;
    const excelBuffer = await generateExcelReport(expenses, title, subtitle);
    const filename = `${subtitle.replace(/\s+/g, '_')}_hisobot.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(excelBuffer);
  } catch (err) {
    console.error('Web Excel xatosi:', err);
    res.status(500).send('Excel faylini shakllantirishda xatolik yuz berdi.');
  }
});

// Yangi xarajat qo'shish
webApp.post('/api/expenses', async (req, res) => {
  try {
    const { product, quantity, price, note, addedBy } = req.body;
    if (!product || typeof product !== 'string' || !product.trim()) {
      return res.status(400).json({ ok: false, error: "Mahsulot nomi kiritilmagan." });
    }
    const qty = Number(quantity);
    const prc = Number(price);
    if (Number.isNaN(qty) || qty <= 0)
      return res.status(400).json({ ok: false, error: "Miqdor musbat son bo'lishi kerak." });
    if (Number.isNaN(prc) || prc <= 0)
      return res.status(400).json({ ok: false, error: "Narx musbat son bo'lishi kerak." });

    const expense = await prisma.expense.create({
      data: {
        product: product.trim(),
        quantity: qty,
        price: prc,
        note: note && String(note).trim() ? String(note).trim() : null,
        addedBy: addedBy && String(addedBy).trim() ? String(addedBy).trim() : 'Veb-sayt',
        addedById: BigInt(0),
      },
    });

    res.json({ ok: true, data: { ...expense, addedById: expense.addedById.toString() } });
  } catch (err) {
    console.error("Xarajat qo'shishda xatolik:", err);
    res.status(500).json({ ok: false, error: 'Saqlashda xatolik yuz berdi.' });
  }
});

// Xarajatni o'chirish
webApp.delete('/api/expenses/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id))
      return res.status(400).json({ ok: false, error: "Noto'g'ri ID." });
    await prisma.expense.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    console.error("O'chirishda xatolik:", err);
    res.status(404).json({ ok: false, error: 'Bunday yozuv topilmadi.' });
  }
});

// Web serverni ishga tushirish
webApp.listen(WEB_PORT, () => {
  console.log(`✅ Veb-server ishga tushdi: ${WEB_URL}`);
});

// ---- Telegram Bot ----
const userSessions = new Map();

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("Xato: .env faylida BOT_TOKEN ko'rsatilmagan.");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Callback query timeout xatolarini yumshatish uchun middleware
bot.use(async (ctx, next) => {
  if (ctx.callbackQuery) {
    const originalAnswer = ctx.answerCbQuery.bind(ctx);
    ctx.answerCbQuery = async (...args) => {
      try {
        return await originalAnswer(...args);
      } catch (err) {
        if (
          err.description &&
          (err.description.includes('query is too old') ||
            err.description.includes('query ID is invalid'))
        ) {
          return; // Eski so'rovlarni e'tiborsiz qoldiramiz
        }
        console.error('Callback Query javob xatosi:', err);
      }
    };
  }
  return next();
});

function getMainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('📅 Bugungi hisobot', 'report_daily'),
      Markup.button.callback('🗓 Haftalik hisobot', 'report_weekly'),
    ],
    [
      Markup.button.callback('📆 Oylik hisobot', 'report_monthly'),
      Markup.button.callback('🔍 Boshqa davr', 'report_custom'),
    ],
    [Markup.button.callback('📊 Excel yuklab olish', 'excel_menu')],
  ]);
}

// User saqlash
async function saveUser(ctx) {
  try {
    const from = ctx.from;
    if (!from) return;
    await prisma.user.upsert({
      where: { id: BigInt(from.id) },
      update: {
        username: from.username || null,
        firstName: from.first_name,
        lastName: from.last_name || null,
      },
      create: {
        id: BigInt(from.id),
        username: from.username || null,
        firstName: from.first_name,
        lastName: from.last_name || null,
      },
    });
  } catch (err) {
    console.error('Userni saqlashda xatolik:', err);
  }
}

/**
 * Buffer'dan Telegram'ga fayl yuborish.
 * Input.fromBuffer dan foydalanish — to'g'ri usul Telegraf 4.x da.
 */
async function sendExcelBuffer(telegramTarget, buffer, filename) {
  // Telegraf 4.x: Input.fromBuffer(buffer, filename) → { source: ReadableStream, filename }
  const source = Input.fromBuffer(buffer, filename);
  await telegramTarget.sendDocument(source);
}

// /start
bot.start(async (ctx) => {
  await saveUser(ctx);
  await ctx.reply(
    "Assalomu alaykum! Men magazin xarajatlarini hisobga oluvchi botman.\n\n" +
      "1️⃣ Xarajat qo'shish:\n" +
      "  • Tezkor: `+ Non 20 120000` (mahsulot, miqdor, narx)\n" +
      "  • Batafsil:\n" +
      "    Kategoriya: Non\n" +
      "    Miqdor: 20\n" +
      "    Narx: 120000\n" +
      "    Izoh: ixtiyoriy yozuv\n\n" +
      "2️⃣ Excel hisobotlar:\n" +
      "  • Istalgan vaqtda Excel yuklab olishingiz mumkin.\n" +
      "  • Har kuni 23:59 da kunlik Excel avtomatik yuboriladi.\n" +
      "  • Yakshanba kuni haftalik, oy oxirida oylik Excel avtomat yuboriladi.\n\n" +
      "3️⃣ Maxsus davr:\n" +
      "  • `1-15` deb kiriting — 1 dan 15 gacha hisobot olasiz.\n\n" +
      "Quyidagi tugmalardan birini bosing:",
    { parse_mode: 'Markdown', ...getMainMenuKeyboard() }
  );
});

// /cancel
bot.command('cancel', async (ctx) => {
  if (userSessions.has(ctx.from.id)) {
    userSessions.delete(ctx.from.id);
    await ctx.reply('❌ Amaliyot bekor qilindi.', getMainMenuKeyboard());
  } else {
    await ctx.reply("Bekor qilinadigan faol amaliyot yo'q.");
  }
});

// /hisobot [kunlik|haftalik|oylik]
bot.command('hisobot', async (ctx) => {
  try {
    const args = ctx.message.text.split(/\s+/).slice(1);
    const period = (args[0] || 'kunlik').toLowerCase();

    let text;
    if (period === 'haftalik' || period === 'hafta') {
      text = await weeklyReport();
    } else if (period === 'oylik' || period === 'oy') {
      text = await monthlyReport();
    } else {
      text = await dailyReport();
    }

    await ctx.reply(text);
  } catch (err) {
    console.error('Hisobot xatosi:', err);
    await ctx.reply('❌ Hisobotni chiqarishda xatolik yuz berdi.');
  }
});

// Button callbacks
bot.action('report_daily', async (ctx) => {
  await ctx.answerCbQuery();
  try {
    const text = await dailyReport();
    await ctx.reply(
      text,
      Markup.inlineKeyboard([[Markup.button.callback('📊 Excel formatida yuklash', 'excel_daily')]])
    );
  } catch (err) {
    console.error(err);
    await ctx.reply('❌ Xatolik yuz berdi.');
  }
});

bot.action('report_weekly', async (ctx) => {
  await ctx.answerCbQuery();
  try {
    const text = await weeklyReport();
    await ctx.reply(
      text,
      Markup.inlineKeyboard([[Markup.button.callback('📊 Excel formatida yuklash', 'excel_weekly')]])
    );
  } catch (err) {
    console.error(err);
    await ctx.reply('❌ Xatolik yuz berdi.');
  }
});

bot.action('report_monthly', async (ctx) => {
  await ctx.answerCbQuery();
  try {
    const text = await monthlyReport();
    await ctx.reply(
      text,
      Markup.inlineKeyboard([[Markup.button.callback('📊 Excel formatida yuklash', 'excel_monthly')]])
    );
  } catch (err) {
    console.error(err);
    await ctx.reply('❌ Xatolik yuz berdi.');
  }
});

bot.action('report_custom', async (ctx) => {
  await ctx.answerCbQuery();
  userSessions.set(ctx.from.id, { state: 'waiting_for_date_range' });
  await ctx.reply(
    '🔍 Maxsus davr uchun hisobot olish.\n\n' +
      'Iltimos, hisobot davrini quyidagi formatlardan birida kiriting:\n' +
      '• `1-15` (joriy oyning 1-15 kunlari)\n' +
      '• `1 dan 15 gacha`\n' +
      '• `01.07-15.07` (joriy yil)\n' +
      '• `01.07.2026-15.07.2026` (to\'liq sana)\n\n' +
      'Jarayonni bekor qilish uchun /cancel deb yozing.',
    { parse_mode: 'Markdown' }
  );
});

bot.action('excel_menu', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    '📊 Excel formatidagi hisobotni tanlang:',
    Markup.inlineKeyboard([
      [Markup.button.callback('📅 Bugungi Excel', 'excel_daily')],
      [Markup.button.callback('🗓 Haftalik Excel', 'excel_weekly')],
      [Markup.button.callback('📆 Oylik Excel', 'excel_monthly')],
    ])
  );
});

bot.action('excel_daily', async (ctx) => {
  await ctx.answerCbQuery();
  await sendExcelForPeriod(ctx, 'kunlik');
});

bot.action('excel_weekly', async (ctx) => {
  await ctx.answerCbQuery();
  await sendExcelForPeriod(ctx, 'haftalik');
});

bot.action('excel_monthly', async (ctx) => {
  await ctx.answerCbQuery();
  await sendExcelForPeriod(ctx, 'oylik');
});

async function sendExcelForPeriod(ctx, period) {
  let waitMsg;
  try {
    waitMsg = await ctx.reply('⏳ Excel fayl shakllantirilmoqda, iltimos kuting...');
    const { start, end } = getRange(period);
    const expenses = await prisma.expense.findMany({
      where: { createdAt: { gte: start, lte: end } },
      orderBy: { createdAt: 'asc' },
    });

    let title = 'Xarajatlar Hisoboti';
    let subtitle = '';

    if (period === 'kunlik') {
      title = 'Kunlik Xarajatlar Hisoboti';
      subtitle = formatDate(start);
    } else if (period === 'haftalik') {
      title = 'Haftalik Xarajatlar Hisoboti';
      subtitle = `${formatDate(start)} - ${formatDate(end)}`;
    } else if (period === 'oylik') {
      title = 'Oylik Xarajatlar Hisoboti';
      subtitle = start.toLocaleString('uz-UZ', { month: 'long', year: 'numeric' });
    }

    const excelBuffer = await generateExcelReport(expenses, title, subtitle);
    const filename = `${subtitle.replace(/[\s/\\:*?"<>|]+/g, '_')}_hisobot.xlsx`;

    await ctx.replyWithDocument(Input.fromBuffer(excelBuffer, filename));
  } catch (err) {
    console.error('Excel yuborishda xatolik:', err);
    // Fallback: veb-havola orqali yuklab olish
    const downloadUrl = `${WEB_URL}/api/report/excel?period=${period}`;
    await ctx.reply(
      '⚠️ Excel faylini to\'g\'ridan-to\'g\'ri Telegram orqali yuborib bo\'lmadi.\n\n' +
        '📥 Quyidagi havoladan yuklab oling:\n' +
        `🔗 ${downloadUrl}`
    );
  }
}

// Oddiy matnli xabarlarni qayta ishlash
bot.on('text', async (ctx) => {
  await saveUser(ctx);
  const text = ctx.message.text.trim();

  if (text.startsWith('/')) return;

  // Custom davr kutilayotgan holat
  const session = userSessions.get(ctx.from.id);
  if (session && session.state === 'waiting_for_date_range') {
    const range = parseDateRange(text);
    if (!range) {
      await ctx.reply(
        "❌ Noto'g'ri sana formati. Iltimos, quyidagicha kiriting:\n" +
          'Masalan: `1-15` yoki `01.07-15.07`\n\n' +
          'Bekor qilish uchun /cancel deb yozing.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    userSessions.delete(ctx.from.id);
    const { start, end } = range;

    try {
      const loadingMsg = await ctx.reply('⏳ Hisobot tayyorlanmoqda...');

      const reportText = await customReport(start, end);
      await ctx.reply(reportText);

      const expenses = await prisma.expense.findMany({
        where: { createdAt: { gte: start, lte: end } },
        orderBy: { createdAt: 'asc' },
      });

      const excelBuffer = await generateExcelReport(
        expenses,
        'Maxsus Xarajatlar Hisoboti',
        `${formatDate(start)} - ${formatDate(end)}`
      );

      const filename = `${formatDate(start)}_${formatDate(end)}_hisobot.xlsx`;
      await ctx.replyWithDocument(Input.fromBuffer(excelBuffer, filename));
    } catch (err) {
      console.error('Custom report error:', err);
      const downloadUrl = `${WEB_URL}/api/report/excel?start=${start.toISOString()}&end=${end.toISOString()}`;
      await ctx.reply(
        "⚠️ Excel faylini Telegram orqali yuborib bo'lmadi.\n\n" +
          '📥 Brauzer orqali yuklab oling:\n' +
          `🔗 ${downloadUrl}`
      );
    }
    return;
  }

  // Xarajat qo'shish
  let parsed = null;

  if (text.startsWith('+')) {
    parsed = parseExpense(text);
  } else if (/kategoriya\s*:/i.test(text) || /mahsulot\s*:/i.test(text)) {
    parsed = parseExpenseMultiline(text);
  }

  if (!parsed) return;

  if (parsed.quantity <= 0 || parsed.price <= 0) {
    await ctx.reply("❌ Miqdor va narx musbat son bo'lishi kerak.");
    return;
  }

  try {
    const from = ctx.from;
    const addedBy = from.username
      ? `@${from.username}`
      : [from.first_name, from.last_name].filter(Boolean).join(' ');

    await prisma.expense.create({
      data: {
        product: parsed.product,
        quantity: parsed.quantity,
        price: parsed.price,
        note: parsed.note,
        addedBy,
        addedById: BigInt(from.id),
      },
    });

    // Bugungi jami
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date();
    dayEnd.setHours(23, 59, 59, 999);

    const todayTotal = await prisma.expense.aggregate({
      _sum: { price: true },
      where: { createdAt: { gte: dayStart, lte: dayEnd } },
    });

    const total = todayTotal._sum.price || 0;
    await ctx.reply(`✅ Saqlandi.\n\nBugungi jami xarajat:\n${formatSum(total)} so'm`);
  } catch (err) {
    console.error('Xarajat saqlashda xatolik:', err);
    await ctx.reply("❌ Saqlashda xatolik yuz berdi. Qaytadan urinib ko'ring.");
  }
});

bot.catch((err, ctx) => {
  console.error(`Botda xatolik (update ${ctx.updateType}):`, err);
});

async function main() {
  await bot.launch();
  initScheduler(bot);
  console.log('✅ Bot ishga tushdi.');
}

main().catch((err) => {
  console.error('Botni ishga tushirishda xatolik:', err);
  process.exit(1);
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
