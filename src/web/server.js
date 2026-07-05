require('dotenv').config();
const path = require('path');
const express = require('express');
const prisma = require('../db');
const stats = require('./stats');

const app = express();
const PORT = process.env.WEB_PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Hisobot ma'lumotlarini olish: /api/report?period=kunlik|haftalik|oylik
app.get('/api/report', async (req, res) => {
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

// Yangi xarajat qo'shish
app.post('/api/expenses', async (req, res) => {
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

// Xarajatni o'chirish
app.delete('/api/expenses/:id', async (req, res) => {
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

app.listen(PORT, () => {
  console.log(`✅ Veb-sayt ishga tushdi: http://localhost:${PORT}`);
});
