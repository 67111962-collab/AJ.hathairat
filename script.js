const amountOne = document.getElementById('amount-one');
const amountTwo = document.getElementById('amount-two');
const currencyOne = document.getElementById('currency-one');
const currencyTwo = document.getElementById('currency-two');
const lastUpdateText = document.getElementById('last-update');
const clearBtn = document.getElementById('clear-btn');
const historyList = document.getElementById('history-list');
const clearHistoryBtn = document.getElementById('clear-history-btn');

let rates = {}; 
let historyData = [];

async function fetchExchangeRates() {
    try {
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        const data = await res.json();
        rates = data.rates;
        
        const now = new Date();
        lastUpdateText.innerText = `ข้อมูลอัปเดตล่าสุด: ${now.toLocaleString('th-TH')}`;
        
        calculate(1); 
    } catch (error) {
        lastUpdateText.innerText = 'ไม่สามารถดึงข้อมูลได้ โปรดตรวจสอบอินเทอร์เน็ต';
    }
}

function calculate(source) {
    const curr1 = currencyOne.value;
    const curr2 = currencyTwo.value;
    
    if (!rates[curr1] || !rates[curr2]) return;

    const rate = rates[curr2] / rates[curr1];

    if (source === 1) { 
        const val1 = parseFloat(amountOne.value);
        if (!isNaN(val1)) {
            amountTwo.value = (val1 * rate).toFixed(2);
        } else {
            amountTwo.value = '';
        }
    } else if (source === 2) { 
        const val2 = parseFloat(amountTwo.value);
        if (!isNaN(val2)) {
            amountOne.value = (val2 / rate).toFixed(2);
        } else {
            amountOne.value = '';
        }
    }
}


function saveHistory() {
    const val1 = parseFloat(amountOne.value);
    const val2 = parseFloat(amountTwo.value);
    if (isNaN(val1) || isNaN(val2) || val1 === 0) return;

    
    const record = `${val1.toFixed(2)} ${currencyOne.value} -> ${val2.toFixed(2)} ${currencyTwo.value}`;

    historyData.unshift(record); 
    if (historyData.length > 10) historyData.pop();

    renderHistory();
}


function renderHistory() {
    historyList.innerHTML = '';
    historyData.forEach(item => {
        const li = document.createElement('li');
        li.innerText = item;
        historyList.appendChild(li);
    });
}


clearBtn.addEventListener('click', () => {
    amountOne.value = '';
    amountTwo.value = '';
});


clearHistoryBtn.addEventListener('click', () => {
    historyData = [];
    renderHistory();
});


amountOne.addEventListener('input', () => calculate(1));
amountTwo.addEventListener('input', () => calculate(2));

currencyOne.addEventListener('change', () => calculate(1));
currencyTwo.addEventListener('change', () => calculate(1));


amountOne.addEventListener('change', saveHistory);
amountTwo.addEventListener('change', saveHistory);


fetchExchangeRates();
