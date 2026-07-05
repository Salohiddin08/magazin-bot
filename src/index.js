require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const prisma = require('./db');
const { formatSum, getRange, formatDate } = require('./utils');
const { parseExpense, parseExpenseMultiline, parseDateRange } = require('./parser');
const { dailyReport, weeklyReport, monthlyReport, customReport } = require('./report');
const { initScheduler } = require('./scheduler');

// ---- Web server (single process) ----
const path = require('path');
const express = require('express');
const stats = require('./web/stats');

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

// Yangi xarajat qo'shish (veb)
webApp.post('/api/expenses', async (req, res) => {
  try {
    const { product, quantity, price, note, addedBy } = req.body;
    if (!product || typeof product !== 'string' || !product.trim())
      return res.status(400).json({ ok: false, error: "Mahsulot nomi kiritilmagan." });
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

// Xarajatni o'chirish (veb)
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

// Callback query timeout xatolarini yumshatish
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
        ) return;
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
 * Kunlik ro'yxatni har bir yozuv uchun "O'chirish" tugmasi bilan yuboradi.
 * Har bir yozuv alohida xabar sifatida yuboriladi → o'chirish qulay.
 */
async function sendDailyListWithDeleteButtons(ctx) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const expenses = await prisma.expense.findMany({
    where: { createdAt: { gte: start, lte: end } },
    orderBy: { createdAt: 'asc' },
  });

  if (expenses.length === 0) {
    await ctx.reply("Bu kunda hali xarajat yo'q.");
    return;
  }

  const total = expenses.reduce((sum, e) => sum + e.price, 0);
  await ctx.reply(`📋 Bugungi xarajatlar ro'yxati:\n(Har birini o'chirish uchun ❌ tugmasini bosing)\n\nJami: ${formatSum(total)} so'm`);

  for (const e of expenses) {
    const timeStr = e.createdAt.toTimeString().slice(0, 5);
    const text =
      `🕐 ${timeStr}  |  ${e.product}\n` +
      `💰 ${formatSum(e.price)} so'm  •  Miqdor: ${e.quantity}` +
      (e.note ? `\n📝 ${e.note}` : '') +
      `\n👤 ${e.addedBy}`;

    await ctx.reply(text, Markup.inlineKeyboard([
      [Markup.button.callback(`❌ O'chirish`, `del_${e.id}`)],
    ]));
  }
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
    "2️⃣ Hisobotlar:\n" +
    "  • Bugungi, haftalik, oylik, yoki maxsus davr uchun.\n" +
    "  • Har kuni 23:59 da kunlik hisobot avtomatik yuboriladi.\n\n" +
    "3️⃣ Xarajatni o'chirish:\n" +
    "  • Bugungi ro'yxatda har bir yozuv yonida ❌ tugmasi bor.\n\n" +
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
    if (period === 'haftalik' || period === 'hafta') text = await weeklyReport();
    else if (period === 'oylik' || period === 'oy') text = await monthlyReport();
    else text = await dailyReport();

    await ctx.reply(text);
  } catch (err) {
    console.error('Hisobot xatosi:', err);
    await ctx.reply('❌ Hisobotni chiqarishda xatolik yuz berdi.');
  }
});

// /royxat — o'chirish tugmalari bilan bugungi ro'yxat
bot.command('royxat', async (ctx) => {
  await sendDailyListWithDeleteButtons(ctx);
});

// Hisobot tugmalari
bot.action('report_daily', async (ctx) => {
  await ctx.answerCbQuery();
  try {
    const text = await dailyReport();
    await ctx.reply(text, Markup.inlineKeyboard([
      [Markup.button.callback("🗑 Ro'yxat (o'chirish bilan)", 'show_delete_list')],
    ]));
  } catch (err) {
    console.error(err);
    await ctx.reply('❌ Xatolik yuz berdi.');
  }
});

bot.action('report_weekly', async (ctx) => {
  await ctx.answerCbQuery();
  try {
    const text = await weeklyReport();
    await ctx.reply(text);
  } catch (err) {
    console.error(err);
    await ctx.reply('❌ Xatolik yuz berdi.');
  }
});

bot.action('report_monthly', async (ctx) => {
  await ctx.answerCbQuery();
  try {
    const text = await monthlyReport();
    await ctx.reply(text);
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
    'Iltimos, hisobot davrini kiriting:\n' +
    '• `1-15` (joriy oyning 1-15 kunlari)\n' +
    '• `01.07-15.07`\n' +
    '• `01.07.2026-15.07.2026`\n\n' +
    'Bekor qilish: /cancel',
    { parse_mode: 'Markdown' }
  );
});

// O'chirish tugmalari bilan ro'yxat ko'rsatish
bot.action('show_delete_list', async (ctx) => {
  await ctx.answerCbQuery();
  await sendDailyListWithDeleteButtons(ctx);
});

// Xarajatni o'chirish: del_{id} formatidagi callback
bot.action(/^del_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const expenseId = parseInt(ctx.match[1], 10);

  try {
    const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
    if (!expense) {
      await ctx.editMessageText("⚠️ Bu yozuv allaqachon o'chirilgan.");
      return;
    }

    await prisma.expense.delete({ where: { id: expenseId } });

    // Xabarni yangilash — o'chirildi deb ko'rsatish
    await ctx.editMessageText(
      `✅ O'chirildi: ${expense.product} — ${formatSum(expense.price)} so'm`
    );
  } catch (err) {
    console.error("O'chirishda xatolik:", err);
    await ctx.answerCbQuery("❌ O'chirishda xatolik yuz berdi.", { show_alert: true });
  }
});

// Matnli xabarlarni qayta ishlash
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
        "❌ Noto'g'ri sana formati. Masalan: `1-15` yoki `01.07-15.07`\n\nBekor qilish: /cancel",
        { parse_mode: 'Markdown' }
      );
      return;
    }

    userSessions.delete(ctx.from.id);
    const { start, end } = range;

    try {
      await ctx.reply('⏳ Hisobot tayyorlanmoqda...');
      const reportText = await customReport(start, end);
      await ctx.reply(reportText);
    } catch (err) {
      console.error('Custom report error:', err);
      await ctx.reply('❌ Hisobotni chiqarishda xatolik yuz berdi.');
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

    const expense = await prisma.expense.create({
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

    // Saqlandi xabari + O'chirish tugmasi
    await ctx.reply(
      `✅ Saqlandi: ${parsed.product} — ${formatSum(parsed.price)} so'm\n\nBugungi jami: ${formatSum(total)} so'm`,
      Markup.inlineKeyboard([
        [Markup.button.callback(`❌ Bu yozuvni o'chirish`, `del_${expense.id}`)],
      ])
    );
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

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
