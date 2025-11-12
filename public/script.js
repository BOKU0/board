// Socket.ioでサーバーに接続
const socket = io();

// Canvasの初期設定
const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');

const penButton = document.getElementById('pen-button');
const eraserButton = document.getElementById('eraser-button');

// ★★★ カメラ（ビューポート）の状態を管理するオブジェクト ★★★
let viewState = {
    x: 0,       // カメラのX座標 (ワールド座標のどこを見ているか)
    y: 0,       // カメラのY座標
    zoom: 1.0   // ズーム率 (1.0が標準)
};
// ★★★ ここまで ★★★

let isDrawing = false;
let isPanning = false; // パン操作中かどうか
let currentTool = 'pen';
let lastScreenX = 0;
let lastScreenY = 0;
let lastWorldX = 0;
let lastWorldY = 0;

let history = [];

// ★★★ キャンバスサイズをウィンドウに合わせる関数 (「窓」のサイズ調整) ★★★
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    // サイズが変わったら、カメラ設定を維持して再描画
    redrawAllHistory();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas(); // 初期サイズ設定
// ★★★ ここまで ★★★


// ★★★ 画面座標をワールド座標（ボード上の絶対座標）に変換する ★★★
function screenToWorld(screenX, screenY) {
    const worldX = (screenX / viewState.zoom) - (viewState.x / viewState.zoom);
    const worldY = (screenY / viewState.zoom) - (viewState.y / viewState.zoom);
    return { x: worldX, y: worldY };
}

// ★★★ 描画履歴をカメラの状態に合わせて再描画する ★★★
function redrawAllHistory() {
    ctx.clearRect(0, 0, canvas.width, canvas.height); 

    // カメラの位置とズーム率を適用
    ctx.save();
    ctx.translate(viewState.x, viewState.y);
    ctx.scale(viewState.zoom, viewState.zoom);

    history.forEach(lineData => {
        drawLine(lineData); 
    });
    
    ctx.restore();
}
// ★★★ ここまで ★★★


// ツールの設定
let currentLineSettings = {
    color: 'black',
    // ★★★ ワールド座標系での基準サイズに戻す ★★★
    lineWidth: 5, 
    isErasing: false
};

// ツール切り替え関数
function setTool(tool) {
    currentTool = tool;
    if (tool === 'pen') {
        currentLineSettings.isErasing = false;
        currentLineSettings.color = 'black'; 
        currentLineSettings.lineWidth = 5; // ペンサイズ
        penButton.classList.add('active');
        eraserButton.classList.remove('active');
    } else if (tool === 'eraser') {
        currentLineSettings.isErasing = true;
        currentLineSettings.color = 'white'; 
        currentLineSettings.lineWidth = 20; // 消しゴムサイズ
        penButton.classList.remove('active');
        eraserButton.classList.add('active');
    }
}
setTool('pen'); 


// --- 描画・パン・ズームイベント ---

// マウスイベント (PC)
canvas.addEventListener('mousedown', (e) => {
    // 中央ボタン（ホイールクリック）でパン操作
    if (e.button === 1 || e.shiftKey) { 
        isPanning = true;
        lastScreenX = e.clientX;
        lastScreenY = e.clientY;
        canvas.style.cursor = 'grab';
    } else {
        const { x, y } = screenToWorld(e.clientX, e.clientY);
        startDrawing(x, y);
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (isPanning) {
        // パン操作
        viewState.x += e.clientX - lastScreenX;
        viewState.y += e.clientY - lastScreenY;
        lastScreenX = e.clientX;
        lastScreenY = e.clientY;
        redrawAllHistory();
    } else {
        const { x, y } = screenToWorld(e.clientX, e.clientY);
        draw(x, y);
    }
});

canvas.addEventListener('mouseup', () => {
    if (isPanning) {
        isPanning = false;
        canvas.style.cursor = 'crosshair';
    }
    stopDrawing();
});
canvas.addEventListener('mouseout', () => {
    isPanning = false;
    canvas.style.cursor = 'crosshair';
    stopDrawing();
});

// マウスホイールイベントでズーム操作
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = 1.1; // ズームの倍率
    const delta = e.deltaY > 0 ? 1 / zoomFactor : zoomFactor;

    // ズーム中心をマウス位置に設定
    const mouseX = e.clientX;
    const mouseY = e.clientY;

    // 新しいズーム率を計算
    const newZoom = Math.min(Math.max(0.1, viewState.zoom * delta), 5.0); // 最小0.1倍、最大5.0倍
    const scaleChange = newZoom / viewState.zoom;

    // カメラ位置を調整して、マウス位置をズームの中心にする
    viewState.x = mouseX - (mouseX - viewState.x) * scaleChange;
    viewState.y = mouseY - (mouseY - viewState.y) * scaleChange;
    viewState.zoom = newZoom;

    redrawAllHistory();
});


// タッチイベント (スマホ)
let lastTouches = null; // 最後のタッチ情報
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (e.touches.length === 1) {
        // 1本指は描画
        const { x, y } = screenToWorld(e.touches[0].clientX, e.touches[0].clientY);
        startDrawing(x, y);
    } else if (e.touches.length === 2) {
        // 2本指はパン/ズーム
        isPanning = true;
        lastTouches = e.touches;
    }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (isDrawing && e.touches.length === 1) {
        // 描画
        const { x, y } = screenToWorld(e.touches[0].clientX, e.touches[0].clientY);
        draw(x, y);
    } else if (isPanning && e.touches.length === 2 && lastTouches) {
        // 2本指でのパンとズーム
        
        // --- パン（移動） ---
        const dx = e.touches[0].clientX - lastTouches[0].clientX;
        const dy = e.touches[0].clientY - lastTouches[0].clientY;
        viewState.x += dx;
        viewState.y += dy;

        // --- ズーム（ピンチ） ---
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        const lastDist = Math.hypot(lastTouches[0].clientX - lastTouches[1].clientX, lastTouches[0].clientY - lastTouches[1].clientY);
        
        if (lastDist > 0) {
            const scaleChange = dist / lastDist;
            
            // ズーム中心を2点の中央に設定
            const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            
            const newZoom = Math.min(Math.max(0.1, viewState.zoom * scaleChange), 5.0);
            const finalScaleChange = newZoom / viewState.zoom;

            viewState.x = centerX - (centerX - viewState.x) * finalScaleChange;
            viewState.y = centerY - (centerY - viewState.y) * finalScaleChange;
            viewState.zoom = newZoom;
        }

        lastTouches = e.touches;
        redrawAllHistory();
    }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    if (e.touches.length === 0) {
        stopDrawing();
        isPanning = false;
        lastTouches = null;
    } else if (e.touches.length === 1) {
        isPanning = false;
        lastTouches = e.touches;
    }
});


function startDrawing(x, y) {
    isDrawing = true;
    [lastWorldX, lastWorldY] = [x, y];
}

function stopDrawing() {
    isDrawing = false;
}

function draw(x, y) {
    if (!isDrawing) return;

    const lineData = {
        x0: lastWorldX,
        y0: lastWorldY,
        x1: x,
        y1: y,
        settings: currentLineSettings
    };

    drawLine(lineData);
    history.push(lineData);
    
    socket.emit('draw_line', lineData);

    [lastWorldX, lastWorldY] = [x, y];
}

// 実際の線を描く関数 (描画コンテキストの状態に依存する)
function drawLine(data) {
    // drawLine関数は、ctxに既に適用されている変換（translate/scale）に依存して描画する
    ctx.beginPath();
    ctx.strokeStyle = data.settings.color;
    
    // ★線の太さをズーム率で割ることで、見た目の太さを一定にする
    ctx.lineWidth = data.settings.lineWidth / viewState.zoom; 
    
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
    history.push(data);
    // 受信時は描画履歴を再描画することで画面に反映
    redrawAllHistory(); 
});

socket.on('load_history', (serverHistory) => {
    console.log('Loading history...');
    history = serverHistory; 
    redrawAllHistory(); 
});
