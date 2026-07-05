const cron = require('node-cron');
const prisma = require('./db');
const { dailyReport, weeklyReport, monthlyReport } = require('./report');

/**
 * Barcha DB foydalanuvchilariga matnli hisobot yuboradi.
 */
async function broadcastReport(bot, messageText) {
  let chatIds = [];
  try {
    const dbUsers = await prisma.user.findMany({ select: { id: true } });
    chatIds = dbUsers.map((u) => u.id.toString());
  } catch (dbErr) {
    console.error('Userlarni olishda xatolik:', dbErr);
  }

  // Admin ham bo'lsa qo'shamiz (agar bazada yo'q bo'lsa)
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
      await bot.telegram.sendMessage(chatId, messageText);
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
      const dailyText = await dailyReport(now);
      await broadcastReport(bot, `📅 Kunlik avtomatik hisobot:\n\n${dailyText}`);
      console.log('✅ Kunlik hisobotlar yuborildi.');

      // --- 2. HAFTALIK HISOBOT (Yakshanba kuni) ---
      if (now.getDay() === 0) {
        console.log('🗓 Haftalik hisobot yuborilmoqda...');
        const weeklyText = await weeklyReport();
        await broadcastReport(bot, `🗓 Haftalik avtomatik hisobot:\n\n${weeklyText}`);
        console.log('✅ Haftalik hisobotlar yuborildi.');
      }

      // --- 3. OYLIK HISOBOT (oyning oxirgi kunida) ---
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      const isLastDayOfMonth = tomorrow.getDate() === 1;

      if (isLastDayOfMonth) {
        console.log('📆 Oylik hisobot yuborilmoqda...');
        const monthlyText = await monthlyReport();
        await broadcastReport(bot, `📆 Oylik avtomatik hisobot:\n\n${monthlyText}`);
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
