const state = { period: 'kunlik' };

const todayLabelEl = document.getElementById('todayLabel');
const todayTotalEl = document.getElementById('todayTotal');
const todayCountEl = document.getElementById('todayCount');
const rangeLabelEl = document.getElementById('rangeLabel');
const daysBlock = document.getElementById('daysBlock');
const daysList = document.getElementById('daysList');
const biggestBlock = document.getElementById('biggestBlock');
const ledgerBody = document.getElementById('ledgerBody');
const tabs = document.querySelectorAll('.tab');
const form = document.getElementById('expenseForm');
const formMsg = document.getElementById('formMsg');

function formatSum(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toTimeString().slice(0, 5);
}

function setHeaderDate() {
  const now = new Date();
  todayLabelEl.textContent = now.toLocaleDateString('uz-UZ', { day: '2-digit', month: 'long', year: 'numeric' });
}

async function fetchTodaySummary() {
  const res = await fetch('/api/report?period=kunlik');
  const json = await res.json();
  if (!json.ok) return;
  todayTotalEl.innerHTML = `${formatSum(json.data.total)} <span>so'm</span>`;
  todayCountEl.textContent = `${json.data.expenses.length} ta yozuv`;
}

async function loadReport(period) {
  ledgerBody.innerHTML = '<tr><td colspan="6" class="empty">Yuklanmoqda...</td></tr>';
  daysBlock.hidden = true;
  biggestBlock.hidden = true;

  const res = await fetch(`/api/report?period=${period}`);
  const json = await res.json();

  if (!json.ok) {
    ledgerBody.innerHTML = `<tr><td colspan="6" class="empty">${json.error || 'Xatolik yuz berdi.'}</td></tr>`;
    return;
  }

  const data = json.data;
  rangeLabelEl.textContent = `${data.rangeLabel}  ·  Jami: ${formatSum(data.total)} so'm`;

  if (period !== 'kunlik' && data.days && data.days.length) {
    daysBlock.hidden = false;
    daysList.innerHTML = data.days.map((d) => `
      <div class="day-row">
        <span>${d.dayName ? d.dayName + ' · ' : ''}${d.label}</span>
        <span class="day-total">${formatSum(d.total)} so'm</span>
      </div>
    `).join('');
  }

  if (period === 'oylik' && data.biggest) {
    biggestBlock.hidden = false;
    biggestBlock.innerHTML = `Eng katta xarajat: <b>${escapeHtml(data.biggest.product)}</b> — ${formatSum(data.biggest.price)} so'm`;
  }

  renderLedger(data.expenses);
}

function renderLedger(expenses) {
  if (!expenses.length) {
    ledgerBody.innerHTML = '<tr><td colspan="6" class="empty">Bu davrda xarajat qayd etilmagan.</td></tr>';
    return;
  }

  ledgerBody.innerHTML = expenses.map((e) => `
    <tr data-id="${e.id}">
      <td>${formatTime(e.createdAt)}</td>
      <td>${escapeHtml(e.product)}${e.note ? `<span class="note">${escapeHtml(e.note)}</span>` : ''}</td>
      <td>${e.quantity}</td>
      <td class="price-cell">${formatSum(e.price)}</td>
      <td>${escapeHtml(e.addedBy || '—')}</td>
      <td><button class="del-btn" title="O'chirish" data-id="${e.id}">✕</button></td>
    </tr>
  `).join('');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    state.period = tab.dataset.period;
    loadReport(state.period);
  });
});

ledgerBody.addEventListener('click', async (e) => {
  const btn = e.target.closest('.del-btn');
  if (!btn) return;
  const id = btn.dataset.id;
  if (!confirm("Ushbu yozuvni o'chirmoqchimisiz?")) return;

  const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
  const json = await res.json();
  if (json.ok) {
    loadReport(state.period);
    fetchTodaySummary();
  } else {
    alert(json.error || "O'chirishda xatolik yuz berdi.");
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  formMsg.textContent = '';
  formMsg.className = 'form-msg';

  const fd = new FormData(form);
  const payload = {
    product: fd.get('product'),
    quantity: fd.get('quantity'),
    price: fd.get('price'),
    note: fd.get('note'),
    addedBy: fd.get('addedBy'),
  };

  try {
    const res = await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();

    if (!json.ok) {
      formMsg.textContent = json.error || 'Xatolik yuz berdi.';
      formMsg.classList.add('err');
      return;
    }

    formMsg.textContent = '✅ Saqlandi.';
    formMsg.classList.add('ok');
    form.reset();

    fetchTodaySummary();
    if (state.period === 'kunlik') loadReport('kunlik');
  } catch (err) {
    formMsg.textContent = 'Server bilan bog\'lanishda xatolik.';
    formMsg.classList.add('err');
  }
});

setHeaderDate();
fetchTodaySummary();
loadReport(state.period);
