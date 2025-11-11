// Socket.ioでサーバーに接続
const socket = io();

// Canvasの初期設定
const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');

let isDrawing = false;
let currentTool = 'pen';
let lastX = 0;
let lastY = 0;

// Canvasサイズをウィンドウに合わせる
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas(); // 初期サイズ設定

// ツールの設定
let currentLineSettings = {
    color: 'black',
    lineWidth: 5,
    isErasing: false
};

// ツール切り替え関数
function setTool(tool) {
    currentTool = tool;
    if (tool === 'pen') {
        currentLineSettings.isErasing = false;
        currentLineSettings.color = 'black'; // ペンの色
        currentLineSettings.lineWidth = 5;
    } else if (tool === 'eraser') {
        currentLineSettings.isErasing = true;
        currentLineSettings.color = 'white'; // 背景色と同じにする
        currentLineSettings.lineWidth = 20; // ★消しゴムのサイズを20pxに設定
    }
}
setTool('pen'); // 初期ツールはペン

// --- 描画イベント ---

// マウスイベント (PC)
canvas.addEventListener('mousedown', (e) => startDrawing(e.offsetX, e.offsetY));
canvas.addEventListener('mousemove', (e) => draw(e.offsetX, e.offsetY));
canvas.addEventListener('mouseup', () => stopDrawing());
canvas.addEventListener('mouseout', () => stopDrawing());

// タッチイベント (スマホ)
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    startDrawing(touch.clientX, touch.clientY);
});
canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    draw(touch.clientX, touch.clientY);
});
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

    // 描画データを作成
    const lineData = {
        x0: lastX,
        y0: lastY,
        x1: x,
        y1: y,
        settings: currentLineSettings
    };

    // 自分のキャンバスに描画
    drawLine(lineData);

    // サーバーに描画データを送信
    socket.emit('draw_line', lineData);

    // 座標を更新
    [lastX, lastY] = [x, y];
}

// 実際の線を描く関数
function drawLine(data) {
    ctx.beginPath();
    // 線の設定を反映
    ctx.strokeStyle = data.settings.color;
    ctx.lineWidth = data.settings.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 消しゴムの場合は、Porter-Duffオペレーションを使う
    ctx.globalCompositeOperation = data.settings.isErasing ? 'destination-out' : 'source-over';

    ctx.moveTo(data.x0, data.y0);
    ctx.lineTo(data.x1, data.y1);
    ctx.stroke();

    // 描画が終わったら元に戻す
    ctx.globalCompositeOperation = 'source-over'; 
}

// --- Socket.io 受信イベント ---

// サーバーから誰かが描いたデータを受信したら、描画する
socket.on('draw_line', (data) => {
    drawLine(data);
});

// 接続時、サーバーに保存されていた履歴を受信したら、すべて描画する（永続化）
socket.on('load_history', (history) => {
    console.log('Loading history...');
    history.forEach(lineData => {
        drawLine(lineData);
    });
});
