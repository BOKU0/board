// Socket.ioでサーバーに接続
const socket = io();

// Canvasの初期設定
const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');

// ★ボタン要素を取得
const penButton = document.getElementById('pen-button');
const eraserButton = document.getElementById('eraser-button');

let isDrawing = false;
let currentTool = 'pen';
let lastX = 0;
let lastY = 0;

// ★クライアント側でも描画履歴を保持する配列
let history = [];

// ★Canvasサイズをウィンドウに合わせる関数
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // ★リサイズ後、保持している履歴からキャンバスを再描画する
    redrawAllHistory();
}

// ★履歴を再描画する関数 (リサイズ時とロード時に使う)
function redrawAllHistory() {
    ctx.clearRect(0, 0, canvas.width, canvas.height); // キャンバスを一度クリア
    history.forEach(lineData => {
        drawLine(lineData); // 履歴の線を一本ずつ描画
    });
}

// 初期ロード時とリサイズ時に実行
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
        currentLineSettings.color = 'black'; 
        currentLineSettings.lineWidth = 5;
        // ★アクティブなボタンのスタイルを切り替え
        penButton.classList.add('active');
        eraserButton.classList.remove('active');
    } else if (tool === 'eraser') {
        currentLineSettings.isErasing = true;
        currentLineSettings.color = 'white'; // (実際はglobalCompositeOperationで消す)
        currentLineSettings.lineWidth = 20; 
        // ★アクティブなボタンのスタイルを切り替え
        penButton.classList.remove('active');
        eraserButton.classList.add('active');
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
// ★ passive: false を指定して、描画中の画面スクロールを防ぐ
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    startDrawing(touch.clientX, touch.clientY);
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    draw(touch.clientX, touch.clientY);
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
    // ★自分の描画もローカル履歴に追加
    history.push(lineData);
    
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

    // 消しゴムの場合は 'destination-out', ペンの場合は 'source-over'
    ctx.globalCompositeOperation = data.settings.isErasing ? 'destination-out' : 'source-over';

    ctx.moveTo(data.x0, data.y0);
    ctx.lineTo(data.x1, data.y1);
    ctx.stroke();

    // ★必ず 'source-over' に戻す
    ctx.globalCompositeOperation = 'source-over'; 
}

// --- Socket.io 受信イベント ---

// サーバーから誰かが描いたデータを受信したら、描画する
socket.on('draw_line', (data) => {
    drawLine(data);
    // ★他の人の描画もローカル履歴に追加
    history.push(data);
});

// 接続時、サーバーに保存されていた履歴を受信したら、すべて描画する
socket.on('load_history', (serverHistory) => {
    console.log('Loading history...');
    // ★サーバーの履歴でローカル履歴を上書き
    history = serverHistory; 
    // ★履歴をすべて再描画
    redrawAllHistory();
});
