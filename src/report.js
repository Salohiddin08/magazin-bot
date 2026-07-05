const prisma = require('./db');
const { formatSum, formatTime, formatDate, dayName, getRange } = require('./utils');

// Kunlik hisobot: shu kunning barcha xarajatlari ro'yxati + jami
async function dailyReport(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  const expenses = await prisma.expense.findMany({
    where: { createdAt: { gte: start, lte: end } },
    orderBy: { createdAt: 'asc' },
  });

  const total = expenses.reduce((sum, e) => sum + e.price, 0);

  let text = `📅 Kunlik hisobot (${formatDate(start)})\n\n`;

  if (expenses.length === 0) {
    text += 'Bu kunda xarajat qayd etilmagan.\n';
  } else {
    text += 'Xarajatlar:\n';
    for (const e of expenses) {
      text += `${formatTime(e.createdAt)}  ${e.product} — ${formatSum(e.price)}\n`;
    }
  }

  text += `\nJami xarajat:\n${formatSum(total)} so'm`;

  return text;
}

// Haftalik hisobot: har kun bo'yicha jami + umumiy jami
async function weeklyReport() {
  const { start, end } = getRange('haftalik');

  const expenses = await prisma.expense.findMany({
    where: { createdAt: { gte: start, lte: end } },
    orderBy: { createdAt: 'asc' },
  });

  // Kunlar bo'yicha guruhlash
  const days = {};
  for (const e of expenses) {
    const key = formatDate(e.createdAt);
    if (!days[key]) days[key] = { date: e.createdAt, total: 0 };
    days[key].total += e.price;
  }

  let text = `🗓 Haftalik hisobot (${formatDate(start)} — ${formatDate(end)})\n\n`;

  const totalWeek = expenses.reduce((sum, e) => sum + e.price, 0);

  if (Object.keys(days).length === 0) {
    text += 'Bu haftada xarajat qayd etilmagan.\n';
  } else {
    for (const key of Object.keys(days).sort((a, b) => days[a].date - days[b].date)) {
      const d = days[key];
      text += `${dayName(d.date)} (${key}): ${formatSum(d.total)} so'm\n`;
    }
  }

  text += `\nJami xarajat (hafta):\n${formatSum(totalWeek)} so'm`;

  return text;
}

// Oylik hisobot: kunlar kesimida statistika + eng katta xarajat
async function monthlyReport() {
  const { start, end } = getRange('oylik');

  const expenses = await prisma.expense.findMany({
    where: { createdAt: { gte: start, lte: end } },
    orderBy: { createdAt: 'asc' },
  });

  const days = {};
  for (const e of expenses) {
    const key = formatDate(e.createdAt);
    if (!days[key]) days[key] = { date: e.createdAt, total: 0 };
    days[key].total += e.price;
  }

  const totalMonth = expenses.reduce((sum, e) => sum + e.price, 0);

  let biggest = null;
  for (const e of expenses) {
    if (!biggest || e.price > biggest.price) biggest = e;
  }

  const monthName = start.toLocaleString('uz-UZ', { month: 'long' });
  let text = `📆 Oylik hisobot (${monthName})\n\n`;

  if (Object.keys(days).length === 0) {
    text += 'Bu oyda xarajat qayd etilmagan.\n';
  } else {
    for (const key of Object.keys(days).sort((a, b) => days[a].date - days[b].date)) {
      const d = days[key];
      text += `${formatDate(d.date)}: ${formatSum(d.total)} so'm\n`;
    }
    text += `\nEng katta xarajat:\n${biggest.product} — ${formatSum(biggest.price)} so'm (${formatDate(biggest.createdAt)})\n`;
  }

  text += `\nUmumiy jami xarajat:\n${formatSum(totalMonth)} so'm`;

  return text;
}

// Maxsus davr uchun hisobot
async function customReport(start, end) {
  const expenses = await prisma.expense.findMany({
    where: { createdAt: { gte: start, lte: end } },
    orderBy: { createdAt: 'asc' },
  });

  const days = {};
  for (const e of expenses) {
    const key = formatDate(e.createdAt);
    if (!days[key]) days[key] = { date: e.createdAt, total: 0 };
    days[key].total += e.price;
  }

  const totalRange = expenses.reduce((sum, e) => sum + e.price, 0);

  let text = `🗓 Hisobot (${formatDate(start)} — ${formatDate(end)})\n\n`;

  if (expenses.length === 0) {
    text += 'Ushbu davrda xarajat qayd etilmagan.\n';
  } else {
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 1) {
      text += 'Xarajatlar:\n';
      for (const e of expenses) {
        text += `${formatTime(e.createdAt)}  ${e.product} — ${formatSum(e.price)}\n`;
      }
    } else {
      text += 'Kunlar bo\'yicha:\n';
      for (const key of Object.keys(days).sort((a, b) => days[a].date - days[b].date)) {
        const d = days[key];
        text += `${formatDate(d.date)}: ${formatSum(d.total)} so'm\n`;
      }
    }
  }

  text += `\nJami xarajat:\n${formatSum(totalRange)} so'm`;

  return text;
}

module.exports = { dailyReport, weeklyReport, monthlyReport, customReport };

