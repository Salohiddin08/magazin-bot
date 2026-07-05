const prisma = require('../db');
const { formatDate, dayName, getRange } = require('../utils');

// Kunlik: shu kunning xarajatlari ro'yxati + jami
async function getDaily(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  const expenses = await prisma.expense.findMany({
    where: { createdAt: { gte: start, lte: end } },
    orderBy: { createdAt: 'desc' },
  });

  const total = expenses.reduce((sum, e) => sum + e.price, 0);

  return {
    period: 'kunlik',
    rangeLabel: formatDate(start),
    total,
    expenses: expenses.map(serialize),
  };
}

// Haftalik: kunlar bo'yicha jamlar
async function getWeekly() {
  const { start, end } = getRange('haftalik');

  const expenses = await prisma.expense.findMany({
    where: { createdAt: { gte: start, lte: end } },
    orderBy: { createdAt: 'asc' },
  });

  const daysMap = {};
  for (const e of expenses) {
    const key = formatDate(e.createdAt);
    if (!daysMap[key]) daysMap[key] = { date: e.createdAt, label: key, dayName: dayName(e.createdAt), total: 0 };
    daysMap[key].total += e.price;
  }

  const days = Object.values(daysMap).sort((a, b) => a.date - b.date);
  const total = expenses.reduce((sum, e) => sum + e.price, 0);

  return {
    period: 'haftalik',
    rangeLabel: `${formatDate(start)} — ${formatDate(end)}`,
    total,
    days,
    expenses: expenses.map(serialize).reverse(),
  };
}

// Oylik: kunlar bo'yicha jamlar + eng katta xarajat
async function getMonthly() {
  const { start, end } = getRange('oylik');

  const expenses = await prisma.expense.findMany({
    where: { createdAt: { gte: start, lte: end } },
    orderBy: { createdAt: 'asc' },
  });

  const daysMap = {};
  for (const e of expenses) {
    const key = formatDate(e.createdAt);
    if (!daysMap[key]) daysMap[key] = { date: e.createdAt, label: key, total: 0 };
    daysMap[key].total += e.price;
  }

  const days = Object.values(daysMap).sort((a, b) => a.date - b.date);
  const total = expenses.reduce((sum, e) => sum + e.price, 0);

  let biggest = null;
  for (const e of expenses) {
    if (!biggest || e.price > biggest.price) biggest = e;
  }

  return {
    period: 'oylik',
    rangeLabel: start.toLocaleString('uz-UZ', { month: 'long', year: 'numeric' }),
    total,
    days,
    biggest: biggest ? serialize(biggest) : null,
    expenses: expenses.map(serialize).reverse(),
  };
}

function serialize(e) {
  return {
    id: e.id,
    product: e.product,
    quantity: e.quantity,
    price: e.price,
    note: e.note,
    addedBy: e.addedBy,
    createdAt: e.createdAt,
  };
}

module.exports = { getDaily, getWeekly, getMonthly };
