// Raqamni "120 000" ko'rinishida formatlash
function formatSum(n) {
  const rounded = Math.round(n);
  return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// Vaqtni HH:MM ko'rinishida qaytarish
function formatTime(date) {
  return date.toTimeString().slice(0, 5);
}

// Sanani DD.MM.YYYY ko'rinishida qaytarish
function formatDate(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}.${m}.${y}`;
}

const KUNLAR = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];

function dayName(date) {
  return KUNLAR[date.getDay()];
}

// Berilgan davr turi bo'yicha (kunlik/haftalik/oylik) boshlanish va tugash sanasini qaytaradi
function getRange(period) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (period === 'haftalik') {
    // Haftaning dushanbasidan boshlab
    const day = now.getDay(); // 0=Yak,1=Dush...
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    start.setDate(now.getDate() + diffToMonday);
    start.setHours(0, 0, 0, 0);
  } else if (period === 'oylik') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else {
    // kunlik (default)
    start.setHours(0, 0, 0, 0);
  }

  return { start, end };
}

module.exports = { formatSum, formatTime, formatDate, dayName, getRange };
