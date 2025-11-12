// Socket.ioでサーバーに接続
const socket = io();

// Canvasの初期設定
const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');

// ★★★ ボードサイズを巨大な固定値にする（この座標系で描画する） ★★★
const BOARD_WIDTH = 4000;
const BOARD_HEIGHT = 4000;

// ★Canvasサイズを固定値に設定
canvas.width = BOARD_WIDTH;
canvas.height = BOARD_HEIGHT;

const penButton = document.getElementById('pen-button');
const eraserButton = document.getElementById('eraser-button');

let isDrawing = false;
let currentTool = 'pen';
let lastX = 0;
let lastY = 0;

// クライアント側でも描画履歴を保持する配列
let history = [];

// ★★★ resizeCanvas関連のコードは完全に削除済み ★★★

// 履歴を再描画する関数 (リサイズ時とロード時に使う)
function redrawAllHistory() {
    // 巨大な固定キャンバス全体をクリア
    ctx.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT); 
    history.forEach(lineData => {
        drawLine(lineData); 
    });
}

// ツールの設定 (変更なし)
let currentLineSettings = {
    color: 'black',
    lineWidth: 5,
    isErasing: false
};

// ツール切り替え関数 (変更なし)
function setTool(tool) {
    currentTool = tool;
    if (tool === 'pen') {
        currentLineSettings.isErasing = false;
        currentLineSettings.color = 'black'; 
        currentLineSettings.lineWidth = 5;
        penButton.classList.add('active');
        eraserButton.classList.remove('active');
    } else if (tool === 'eraser') {
        currentLineSettings.isErasing = true;
        currentLineSettings.color = 'white'; 
        currentLineSettings.lineWidth = 20; 
        penButton.classList.remove('active');
        eraserButton.classList.add('active');
    }
}
setTool('pen'); 

// --- 描画イベント ---

// ★マウス/タッチの座標は、ブラウザでの表示座標ではなく、固定キャンバス上の座標に変換する必要がある
function getCanvasCoordinates(e) {
    // CanvasのHTML要素が、親要素でスケールされているので、そのスケールを考慮して座標を逆算する
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / (rect.width / canvas.width);
    const y = (e.clientY - rect.top) / (rect.height / canvas.height);
    return { x, y };
}


// マウスイベント (PC)
canvas.addEventListener('mousedown', (e) => {
    const { x, y } = getCanvasCoordinates(e);
    startDrawing(x, y);
});
canvas.addEventListener('mousemove', (e) => {
    const { x, y } = getCanvasCoordinates(e);
    draw(x, y);
});
canvas.addEventListener('mouseup', () => stopDrawing());
canvas.addEventListener('mouseout', () => stopDrawing());

// タッチイベント (スマホ)
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const { x, y } = getCanvasCoordinates(e.touches[0]);
    startDrawing(x, y);
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const { x, y } = getCanvasCoordinates(e.touches[0]);
    draw(x, y);
}, { passive: false });
canvas.addEventListener('touchend', () => stopDrawing());

function startDrawing(x, y) {
    isDrawing = true;
    [lastX, lastY] = [x, y];
}

function stopDrawing() {
    isDrawing = false;
}

function draw(x, y) {
    if (!isDrawing) return;

    const lineData = {
        x0: lastX,
        y0: lastY,
        x1: x,
        y1: y,
        settings: currentLineSettings
    };

    drawLine(lineData);
    history.push(lineData);
    
    socket.emit('draw_line', lineData);

    [lastX, lastY] = [x, y];
}

// 実際の線を描く関数 (変更なし)
function drawLine(data) {
    ctx.beginPath();
    ctx.strokeStyle = data.settings.color;
    ctx.lineWidth = data.settings.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.globalCompositeOperation = data.settings.isErasing ? 'destination-out' : 'source-over';

    ctx.moveTo(data.x0, data.y0);
    ctx.lineTo(data.x1, data.y1);
    ctx.stroke();

    ctx.globalCompositeOperation = 'source-over'; 
}

// --- Socket.io 受信イベント (変更なし) ---
socket.on('draw_line', (data) => {
    drawLine(data);
    history.push(data);
});

socket.on('load_history', (serverHistory) => {
    console.log('Loading history...');
    history = serverHistory; 
    redrawAllHistory(); 
});
