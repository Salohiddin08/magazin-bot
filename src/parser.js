// "+ Non 20 120000" yoki "+Non 20 120000, izoh: ertalabki" kabi matnlarni tahlil qiladi
// Format: + <mahsulot nomi> <miqdor> <narx> [izoh]
function parseExpense(text) {
  let body = text.trim();
  if (!body.startsWith('+')) return null;
  body = body.slice(1).trim();

  if (!body) return null;

  const parts = body.split(/\s+/);
  if (parts.length < 3) return null;

  // Oxirgi ikkita raqamli qism - miqdor va narx
  const price = Number(parts[parts.length - 1].replace(/,/g, ''));
  const quantity = Number(parts[parts.length - 2].replace(/,/g, ''));

  if (Number.isNaN(price) || Number.isNaN(quantity)) return null;

  const product = parts.slice(0, parts.length - 2).join(' ');
  if (!product) return null;

  return { product, quantity, price, note: null };
}

// Ko'p qatorli format:
// Kategoriya: Non
// Miqdor: 20
// Narx: 120000
// Izoh: ixtiyoriy
function parseExpenseMultiline(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const data = {};

  for (const line of lines) {
    const [rawKey, ...rest] = line.split(':');
    if (!rest.length) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(':').trim();

    if (key === 'kategoriya' || key === 'mahsulot') data.product = value;
    if (key === 'miqdor') data.quantity = Number(value.replace(/,/g, ''));
    if (key === 'narx') data.price = Number(value.replace(/,/g, ''));
    if (key === 'izoh') data.note = value;
  }

  if (!data.product || Number.isNaN(data.quantity) || Number.isNaN(data.price)) {
    return null;
  }

  return {
    product: data.product,
    quantity: data.quantity,
    price: data.price,
    note: data.note || null,
  };
}

function parseDateRange(text) {
  text = text.trim().toLowerCase();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed

  // Format 1: DD.MM.YYYY-DD.MM.YYYY
  const format1 = /^(\d{1,2})\.(\d{1,2})\.(\d{4})[\s\-]+(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
  let match = text.match(format1);
  if (match) {
    const start = new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]), 0, 0, 0, 0);
    const end = new Date(parseInt(match[6]), parseInt(match[5]) - 1, parseInt(match[4]), 23, 59, 59, 999);
    return { start, end };
  }

  // Format 2: DD.MM-DD.MM (implies current year)
  const format2 = /^(\d{1,2})\.(\d{1,2})[\s\-]+(\d{1,2})\.(\d{1,2})$/;
  match = text.match(format2);
  if (match) {
    const start = new Date(currentYear, parseInt(match[2]) - 1, parseInt(match[1]), 0, 0, 0, 0);
    const end = new Date(currentYear, parseInt(match[4]) - 1, parseInt(match[3]), 23, 59, 59, 999);
    return { start, end };
  }

  // Format 3: DD dan DD gacha OR DD-DD (implies current month and year)
  const format3 = /^(\d{1,2})\s+dan\s+(\d{1,2})\s+gacha$/;
  const format4 = /^(\d{1,2})[\s\-]+(\d{1,2})$/;
  match = text.match(format3) || text.match(format4);
  if (match) {
    const start = new Date(currentYear, currentMonth, parseInt(match[1]), 0, 0, 0, 0);
    const end = new Date(currentYear, currentMonth, parseInt(match[2]), 23, 59, 59, 999);
    return { start, end };
  }

  // Single date: DD (implies today/current month)
  const format5 = /^(\d{1,2})$/;
  match = text.match(format5);
  if (match) {
    const day = parseInt(match[1]);
    const start = new Date(currentYear, currentMonth, day, 0, 0, 0, 0);
    const end = new Date(currentYear, currentMonth, day, 23, 59, 59, 999);
    return { start, end };
  }

  // Single date: DD.MM (implies current year)
  const format6 = /^(\d{1,2})\.(\d{1,2})$/;
  match = text.match(format6);
  if (match) {
    const start = new Date(currentYear, parseInt(match[2]) - 1, parseInt(match[1]), 0, 0, 0, 0);
    const end = new Date(currentYear, parseInt(match[2]) - 1, parseInt(match[1]), 23, 59, 59, 999);
    return { start, end };
  }

  return null;
}

module.exports = { parseExpense, parseExpenseMultiline, parseDateRange };

