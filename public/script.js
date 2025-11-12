// Socket.ioでサーバーに接続
const socket = io();

// Canvasの初期設定
const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');
const canvasContainer = document.getElementById('canvas-container'); 

// ★★★ ボードサイズを巨大な固定値にする ★★★
const BOARD_WIDTH = 4000;
const BOARD_HEIGHT = 4000;

// Canvasサイズを固定値に設定
canvas.width = BOARD_WIDTH;
canvas.height = BOARD_HEIGHT;

const penButton = document.getElementById('pen-button');
const eraserButton = document.getElementById('eraser-button');

let isDrawing = false;
let currentTool = 'pen';
let lastX = 0;
let lastY = 0;

let history = [];

// 履歴を再描画する関数
function redrawAllHistory() {
    ctx.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT); 
    history.forEach(lineData => {
        drawLine(lineData); 
    });
}

// ツールの設定
let currentLineSettings = {
    color: 'black',
    // ★★★ 修正後の線幅（ペン100px、消しゴム400px） ★★★
    lineWidth: 100, 
    isErasing: false
};

// ツール切り替え関数
function setTool(tool) {
    currentTool = tool;
    if (tool === 'pen') {
        currentLineSettings.isErasing = false;
        currentLineSettings.color = 'black'; 
        currentLineSettings.lineWidth = 100; // ペンサイズ
        penButton.classList.add('active');
        eraserButton.classList.remove('active');
    } else if (tool === 'eraser') {
        currentLineSettings.isErasing = true;
        currentLineSettings.color = 'white'; 
        currentLineSettings.lineWidth = 400; // 消しゴムサイズ
        penButton.classList.remove('active');
        eraserButton.classList.add('active');
    }
}
setTool('pen'); 

// ★★★ 描画座標を画面座標から固定キャンバス座標へ変換する関数 ★★★
function getCanvasCoordinates(e) {
    // 縮小され、中央寄せされたCanvas要素のサイズと位置を取得
    const rect = canvas.getBoundingClientRect();
    
    // スケール後の座標から、4000pxキャンバス上の絶対座標を逆算
    const x = (e.clientX - rect.left) / (rect.width / canvas.width);
    const y = (e.clientY - rect.top) / (rect.height / canvas.height);
    
    return { x, y };
}


// --- 描画イベント ---

// イベントリスナーを画面全体を覆うコンテナに付ける
canvasContainer.addEventListener('mousedown', (e) => {
    const { x, y } = getCanvasCoordinates(e);
    startDrawing(x, y);
});
canvasContainer.addEventListener('mousemove', (e) => {
    const { x, y } = getCanvasCoordinates(e);
    draw(x, y);
});
canvasContainer.addEventListener('mouseup', () => stopDrawing());
canvasContainer.addEventListener('mouseout', () => stopDrawing());

// タッチイベント (スマホ)
canvasContainer.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const { x, y } = getCanvasCoordinates(e.touches[0]);
    startDrawing(x, y);
}, { passive: false });
canvasContainer.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const { x, y } = getCanvasCoordinates(e.touches[0]);
    draw(x, y);
}, { passive: false });
canvasContainer.addEventListener('touchend', () => stopDrawing());


function startDrawing(x, y) {
    if (x < 0 || x > BOARD_WIDTH || y < 0 || y > BOARD_HEIGHT) return;
    
    isDrawing = true;
    [lastX, lastY] = [x, y];
}

function stopDrawing() {
    isDrawing = false;
}

function draw(x, y) {
    if (!isDrawing) return;

    // 描画がキャンバス外に出ないようにクランプ
    x = Math.max(0, Math.min(x, BOARD_WIDTH));
    y = Math.max(0, Math.min(y, BOARD_HEIGHT));

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

// 実際の線を描く関数
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

// --- Socket.io 受信イベント ---
socket.on('draw_line', (data) => {
    drawLine(data);
    history.push(data);
});

socket.on('load_history', (serverHistory) => {
    console.log('Loading history...');
    history = serverHistory; 
    redrawAllHistory(); 
});
