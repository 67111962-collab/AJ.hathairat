// คลัง Emoji
const emojiPool = ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋'];

// ตัวแปรสถานะเกม
let level = 1;
let score = 0;
let timeRemaining = 30;
let timerId = null;
let isPlaying = false;

let gridSize = 3;
let numDifferences = 1;
let differencesIndices = []; 
let foundIndices = []; 

// คลาสของ Grid โดยเขียนแบบเต็ม (ห้ามต่อ String ตามข้อกำหนด)
const gridClasses = {
    3: ['grid-cols-3'],
    4: ['grid-cols-4'],
    5: ['grid-cols-5'],
    6: ['grid-cols-6']
};

// สุ่ม Emoji ที่ไม่ซ้ำกับตัวที่กำหนด (ถ้ามี)
function getRandomEmoji(excludeEmoji = null) {
    let emoji;
    do {
        emoji = emojiPool[Math.floor(Math.random() * emojiPool.length)];
    } while (emoji === excludeEmoji);
    return emoji;
}

// ฟังก์ชันเริ่มเกมใหม่
function startGame() {
    score = 0;
    foundIndices = [];
    
    // ปรับระดับความยากตาม Level
    gridSize = Math.min(3 + Math.floor((level - 1) / 2), 6); // สูงสุด 6x6
    numDifferences = Math.min(1 + Math.floor((level - 1) / 1.5), 6); // จุดต่างสูงสุด 6 จุด
    timeRemaining = Math.max(10, 30 - Math.floor((level - 1) * 2)); // เวลาลดลงเรื่อยๆ ต่ำสุด 10 วิ

    // อัปเดต UI
    document.getElementById('level-display').textContent = level;
    document.getElementById('score-display').textContent = score;
    document.getElementById('target-display').textContent = numDifferences;
    document.getElementById('time-display').textContent = timeRemaining;
    
    const statusMessage = document.getElementById('status-message');
    statusMessage.textContent = "ลุยเลย! ค้นหาจุดต่างให้เจอ";
    statusMessage.className = "text-lg text-indigo-600 dark:text-indigo-400 font-bold";

    generateBoards();

    isPlaying = true;
    clearInterval(timerId);
    timerId = setInterval(updateTime, 1000);
}

// สร้างกระดานซ้ายและขวา
function generateBoards() {
    const boardLeft = document.getElementById('board-left');
    const boardRight = document.getElementById('board-right');

    boardLeft.innerHTML = '';
    boardRight.innerHTML = '';
    
    boardLeft.className = "grid gap-2 w-full bg-slate-300 dark:bg-slate-700 p-2 rounded-xl shadow-inner";
    boardRight.className = "grid gap-2 w-full bg-slate-300 dark:bg-slate-700 p-2 rounded-xl shadow-inner";
    boardLeft.classList.add(...gridClasses[gridSize]);
    boardRight.classList.add(...gridClasses[gridSize]);

    const totalCells = gridSize * gridSize;
    let baseArray = [];
    
    // สร้างข้อมูลพื้นฐาน
    for (let i = 0; i < totalCells; i++) {
        baseArray.push(getRandomEmoji());
    }

    // สุ่มตำแหน่งจุดต่าง
    differencesIndices = [];
    while(differencesIndices.length < numDifferences) {
        let r = Math.floor(Math.random() * totalCells);
        if(differencesIndices.indexOf(r) === -1) differencesIndices.push(r);
    }

    // วาดกระดาน
    for (let i = 0; i < totalCells; i++) {
        const isDiff = differencesIndices.includes(i);
        const leftEmoji = baseArray[i];
        const rightEmoji = isDiff ? getRandomEmoji(baseArray[i]) : baseArray[i];

        boardLeft.appendChild(createCell(i, leftEmoji, 'left'));
        boardRight.appendChild(createCell(i, rightEmoji, 'right'));
    }
}

// สร้างปุ่ม Emoji แต่ละช่อง
function createCell(index, emoji, side) {
    const btn = document.createElement('button');
    btn.id = `cell-${side}-${index}`;
    btn.textContent = emoji;
    btn.setAttribute('aria-label', `ตารางที่ ${index + 1}`);
    
    // ใส่ CSS classes
    btn.className = 'w-full aspect-square text-3xl sm:text-4xl bg-white dark:bg-slate-800 rounded-lg shadow hover:bg-slate-100 dark:hover:bg-slate-600 focus:outline-none focus:ring-4 focus:ring-indigo-400 forced-colors:outline transition-colors motion-safe:duration-200 flex items-center justify-center cursor-pointer';
    
    btn.onclick = () => handleCellClick(index);
    return btn;
}

// จัดการเมื่อผู้เล่นคลิกที่ Emoji
function handleCellClick(index) {
    if (!isPlaying) return;

    if (differencesIndices.includes(index) && !foundIndices.includes(index)) {
        // กรณี: กดถูก (เจอจุดต่าง)
        foundIndices.push(index);
        score++;
        document.getElementById('score-display').textContent = score;

        const leftBtn = document.getElementById(`cell-left-${index}`);
        const rightBtn = document.getElementById(`cell-right-${index}`);
        const successClasses = ['bg-green-300', 'dark:bg-green-700', 'hover:bg-green-400', 'dark:hover:bg-green-600'];
        
        leftBtn.classList.remove('bg-white', 'dark:bg-slate-800', 'hover:bg-slate-100', 'dark:hover:bg-slate-600');
        rightBtn.classList.remove('bg-white', 'dark:bg-slate-800', 'hover:bg-slate-100', 'dark:hover:bg-slate-600');
        
        leftBtn.classList.add(...successClasses);
        rightBtn.classList.add(...successClasses);

        if (score >= numDifferences) {
            endGame(true);
        }
    } else if (!differencesIndices.includes(index)) {
        // กรณี: กดผิด (กระพริบสีแดง)
        const clickedLeft = document.getElementById(`cell-left-${index}`);
        const clickedRight = document.getElementById(`cell-right-${index}`);
        
        clickedLeft.classList.add('bg-red-300', 'dark:bg-red-700');
        clickedRight.classList.add('bg-red-300', 'dark:bg-red-700');
        
        setTimeout(() => {
            clickedLeft.classList.remove('bg-red-300', 'dark:bg-red-700');
            clickedRight.classList.remove('bg-red-300', 'dark:bg-red-700');
        }, 300);
    }
}

// นับเวลาถอยหลัง
function updateTime() {
    if (!isPlaying) return;
    timeRemaining--;
    document.getElementById('time-display').textContent = timeRemaining;

    if (timeRemaining <= 0) {
        endGame(false);
    }
}

// เพิ่ม Level
function increaseLevel() {
    level++;
    startGame();
}

// จบเกม (ชนะหรือแพ้)
function endGame(isWin) {
    isPlaying = false;
    clearInterval(timerId);
    
    const statusMessage = document.getElementById('status-message');

    if (isWin) {
        statusMessage.textContent = "🎉 ยอดเยี่ยม! คุณชนะแล้ว กด 'เพิ่ม Level' เลย!";
        statusMessage.className = "text-xl text-green-600 dark:text-green-400 font-bold";
    } else {
        statusMessage.textContent = "💀 หมดเวลา! คุณแพ้ กด 'เริ่มเกมใหม่' เพื่อลองอีกครั้ง";
        statusMessage.className = "text-xl text-red-600 dark:text-red-400 font-bold";
        
        // เฉลยจุดที่ยังหาไม่เจอ (ขอบสีแดง)
        differencesIndices.forEach(index => {
            if(!foundIndices.includes(index)) {
                document.getElementById(`cell-left-${index}`).classList.add('border-4', 'border-red-500');
                document.getElementById(`cell-right-${index}`).classList.add('border-4', 'border-red-500');
            }
        });
    }
}

// เมื่อโหลดหน้าเว็บเสร็จ ให้สร้างกระดานเปล่าเตรียมไว้
document.addEventListener('DOMContentLoaded', () => {
    generateBoards();
});