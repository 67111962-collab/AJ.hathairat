let transactions = [];
let currentId = 1;

// อ้างอิง DOM Elements
const form = document.getElementById('transaction-form');
const listEl = document.getElementById('transaction-list');
const searchInput = document.getElementById('search');
const clearBtn = document.getElementById('clear-btn');
const totalIncEl = document.getElementById('total-inc');
const totalExpEl = document.getElementById('total-exp');
const balanceEl = document.getElementById('net-balance');

// เพิ่มรายการใหม่
form.addEventListener('submit', function (e) {
  e.preventDefault();

  const type = document.getElementById('type').value;
  const title = document.getElementById('title').value;
  const amount = parseFloat(document.getElementById('amount').value);
  const category = document.getElementById('category').value;

  const transaction = {
    id: currentId++,
    type: type,
    title: title,
    category: category,
    amount: amount
  };

  transactions.push(transaction);
  updateUI();
  form.reset();
});

// โจทย์ที่ 2: กรองข้อมูลแบบ Real-time
searchInput.addEventListener('input', function() {
  updateUI();
});

// โจทย์ที่ 5: ปุ่มล้างประวัติทั้งหมด
clearBtn.addEventListener('click', function() {
  if (confirm('คุณต้องการล้างข้อมูลทั้งหมดใช่หรือไม่?')) {
    transactions = [];
    currentId = 1;
    updateUI();
  }
});

// อัปเดตหน้าจอ (ตารางและยอดรวม)
function updateUI() {
  const searchTerm = searchInput.value.toLowerCase();
  
  // กรองข้อมูลตามชื่อรายการ
  const filteredTransactions = transactions.filter(t => 
    t.title.toLowerCase().includes(searchTerm)
  );

  renderTable(filteredTransactions);
  updateSummary();
}

// โจทย์ที่ 3: แสดงประวัติลงในตาราง
function renderTable(data) {
  listEl.innerHTML = '';

  data.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.id}</td>
      <td>${item.type}</td>
      <td>${item.title}</td>
      <td>${item.category}</td>
      <td>฿${item.amount.toLocaleString(undefined, {minimumFractionDigits: 1})}</td>
    `;
    listEl.appendChild(tr);
  });
}

// โจทย์ที่ 4: คำนวณและสรุปรายงานการเงิน
function updateSummary() {
  let income = 0;
  let expense = 0;

  transactions.forEach(t => {
    if (t.type === 'รายรับ') income += t.amount;
    else if (t.type === 'รายจ่าย') expense += t.amount;
  });

  const balance = income - expense;

  totalIncEl.textContent = `฿${income.toLocaleString(undefined, {minimumFractionDigits: 1, maximumFractionDigits: 2})}`;
  totalExpEl.textContent = `฿${expense.toLocaleString(undefined, {minimumFractionDigits: 1, maximumFractionDigits: 2})}`;
  balanceEl.textContent = `฿${balance.toLocaleString(undefined, {minimumFractionDigits: 1, maximumFractionDigits: 2})}`;
}