const { Input } = require('telegraf');
const cron = require('node-cron');
const prisma = require('./db');
const { generateExcelReport } = require('./excel');
const { dailyReport, weeklyReport, monthlyReport } = require('./report');
const { formatDate, getRange } = require('./utils');

const WEB_URL = process.env.WEB_URL || `http://localhost:${process.env.WEB_PORT || 3000}`;

/**
 * Barcha foydalanuvchilarga (DB dagi hammaga) xabar va fayl yuboradi.
 * Agar fayl yuborishda xatolik bo'lsa — veb-havola yuboradi.
 */
async function broadcastReport(bot, messageText, excelBuffer, filename, downloadUrl) {
  let chatIds = [];
  try {
    const dbUsers = await prisma.user.findMany({ select: { id: true } });
    chatIds = dbUsers.map((u) => u.id.toString());
  } catch (dbErr) {
    console.error('Userlarni olishda xatolik:', dbErr);
  }

  // Admin ham bo'lsa, qo'shib qo'yamiz (agar bazada yo'q bo'lsa)
  const adminChatId = process.env.ADMIN_CHAT_ID;
  if (adminChatId && !chatIds.includes(adminChatId)) {
    chatIds.push(adminChatId);
  }

  if (chatIds.length === 0) {
    console.warn('⚠️ Birorta ham chat ID topilmadi. Hisobotlar yuborilmaydi.');
    return;
  }

  for (const chatId of chatIds) {
    try {
      // Matnli hisobot
      await bot.telegram.sendMessage(chatId, messageText);

      // Excel fayl
      try {
        await bot.telegram.sendDocument(chatId, Input.fromBuffer(excelBuffer, filename));
      } catch (docErr) {
        console.error(`Excel yuborishda xatolik (${chatId}):`, docErr.message);
        // Fallback: yuklab olish havolasi
        await bot.telegram.sendMessage(
          chatId,
          `⚠️ Excel faylini Telegram orqali yuborib bo'lmadi.\n📥 Yuklab olish havolasi:\n🔗 ${downloadUrl}`
        );
      }
    } catch (sendErr) {
      console.error(`Xabarni ${chatId} ga yuborishda xatolik:`, sendErr.message);
    }
  }
}

function initScheduler(bot) {
  // Har kuni 23:59 da ishga tushadi
  cron.schedule('59 23 * * *', async () => {
    console.log('⏰ Avtomatik hisobotlarni tayyorlash boshlandi...');
    const now = new Date();

    try {
      // --- 1. KUNLIK HISOBOT (har kuni) ---
      const { start: dStart, end: dEnd } = getRange('kunlik');
      const dailyText = await dailyReport(now);
      const dailyExpenses = await prisma.expense.findMany({
        where: { createdAt: { gte: dStart, lte: dEnd } },
        orderBy: { createdAt: 'asc' },
      });

      const dailyExcel = await generateExcelReport(
        dailyExpenses,
        'Kunlik Xarajatlar Hisoboti',
        formatDate(now)
      );
      const dailyFilename = `${formatDate(now)}_kunlik_hisobot.xlsx`;
      const dailyUrl = `${WEB_URL}/api/report/excel?period=kunlik`;

      await broadcastReport(
        bot,
        `📅 Kunlik avtomatik hisobot:\n\n${dailyText}`,
        dailyExcel,
        dailyFilename,
        dailyUrl
      );
      console.log('✅ Kunlik hisobotlar yuborildi.');

      // --- 2. HAFTALIK HISOBOT (Yakshanba kuni) ---
      if (now.getDay() === 0) {
        console.log('🗓 Haftalik hisobot yuborilmoqda...');
        const { start: wStart, end: wEnd } = getRange('haftalik');
        const weeklyText = await weeklyReport();
        const weeklyExpenses = await prisma.expense.findMany({
          where: { createdAt: { gte: wStart, lte: wEnd } },
          orderBy: { createdAt: 'asc' },
        });

        const weeklyExcel = await generateExcelReport(
          weeklyExpenses,
          'Haftalik Xarajatlar Hisoboti',
          `${formatDate(wStart)} - ${formatDate(wEnd)}`
        );
        const weeklyFilename = `${formatDate(wStart)}_${formatDate(wEnd)}_haftalik_hisobot.xlsx`;
        const weeklyUrl = `${WEB_URL}/api/report/excel?period=haftalik`;

        await broadcastReport(
          bot,
          `🗓 Haftalik avtomatik hisobot:\n\n${weeklyText}`,
          weeklyExcel,
          weeklyFilename,
          weeklyUrl
        );
        console.log('✅ Haftalik hisobotlar yuborildi.');
      }

      // --- 3. OYLIK HISOBOT (oyning oxirgi kunida) ---
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      const isLastDayOfMonth = tomorrow.getDate() === 1;

      if (isLastDayOfMonth) {
        console.log('📆 Oylik hisobot yuborilmoqda...');
        const { start: mStart, end: mEnd } = getRange('oylik');
        const monthlyText = await monthlyReport();
        const monthlyExpenses = await prisma.expense.findMany({
          where: { createdAt: { gte: mStart, lte: mEnd } },
          orderBy: { createdAt: 'asc' },
        });

        const monthName = now.toLocaleString('uz-UZ', { month: 'long', year: 'numeric' });
        const monthlyExcel = await generateExcelReport(
          monthlyExpenses,
          'Oylik Xarajatlar Hisoboti',
          monthName
        );
        const monthlyFilename = `${monthName.replace(/\s+/g, '_')}_oylik_hisobot.xlsx`;
        const monthlyUrl = `${WEB_URL}/api/report/excel?period=oylik`;

        await broadcastReport(
          bot,
          `📆 Oylik avtomatik hisobot:\n\n${monthlyText}`,
          monthlyExcel,
          monthlyFilename,
          monthlyUrl
        );
        console.log('✅ Oylik hisobotlar yuborildi.');
      }

      // --- 4. ESKI XARAJATLARNI TOZALASH (60 kundan oshganlar) ---
      console.log("🧹 60 kundan eski xarajatlarni tozalash boshlandi...");
      const deleteLimit = new Date();
      deleteLimit.setDate(deleteLimit.getDate() - 60);
      const deleteResult = await prisma.expense.deleteMany({
        where: { createdAt: { lt: deleteLimit } },
      });
      console.log(`🧹 Tozalash yakunlandi: ${deleteResult.count} ta yozuv o'chirildi.`);

    } catch (error) {
      console.error('❌ Avtomatik hisobotlarni yuborishda xatolik:', error);
    }
  });

  console.log('🕒 Scheduler ishga tushirildi (har kuni 23:59 da).');
}

module.exports = { initScheduler };
