// Socket.ioでサーバーに接続
const socket = io();

const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');
const penButton = document.getElementById('pen-button');
const eraserButton = document.getElementById('eraser-button');

// ボード基準サイズとズーム制限の定義
const WORLD_WIDTH_REF = 2000;
const WORLD_HEIGHT_REF = 1500;
let ZOOM_MIN = 0.2; 
const ZOOM_MAX = 5.0; 

let viewState = {
    x: 0,       // カメラのX座標
    y: 0,       // カメラのY座標
    zoom: 1.0   // ズーム率
};

let isDrawing = false;
let isPanning = false; 
let currentTool = 'pen';
let lastScreenX = 0; 
let lastScreenY = 0;
let lastWorldX = 0; 
let lastWorldY = 0;
let history = [];

// イベント座標をキャンバス基準に変換する関数
function getRelativeScreenCoordinates(e) {
    // イベントがタッチかマウスかを判別し、クライアント座標を取得
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    // キャンバスの絶対的な画面上の位置を取得
    const rect = canvas.getBoundingClientRect();

    // キャンバス左上を基準とした相対座標を計算
    const relativeX = clientX - rect.left;
    const relativeY = clientY - rect.top;

    return { x: relativeX, y: relativeY };
}


// 画面座標をワールド座標に変換する
function screenToWorld(screenX, screenY) {
    // screenX/Yは既にキャンバス左上を基準としている
    const worldX = (screenX / viewState.zoom) - (viewState.x / viewState.zoom);
    const worldY = (screenY / viewState.zoom) - (viewState.y / viewState.zoom);
    return { x: worldX, y: worldY };
}


// 描画履歴をカメラの状態に合わせて再描画する
function redrawAllHistory() {
    ctx.clearRect(0, 0, canvas.width, canvas.height); 
    ctx.save();
    ctx.translate(viewState.x, viewState.y);
    ctx.scale(viewState.zoom, viewState.zoom);

    history.forEach(lineData => {
        drawLine(lineData); 
    });
    
    ctx.restore();
}


// キャンバスサイズをウィンドウに合わせる関数
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // 画面全体にボードが収まる最小のズーム率を計算
    const requiredZoomX = window.innerWidth / WORLD_WIDTH_REF;
    const requiredZoomY = window.innerHeight / WORLD_HEIGHT_REF;
    const fitZoom = Math.min(requiredZoomX, requiredZoomY);
    
    // ズームアウトの下限を、画面にピッタリ合うサイズに設定
    ZOOM_MIN = fitZoom; 

    // 初回起動時、またはズームアウトの下限を超えていた場合、ZOOM_MINに設定する
    if (viewState.zoom < fitZoom || viewState.zoom === 1.0) {
        viewState.zoom = fitZoom;
    }
    
    // ズーム制限を適用
    viewState.zoom = Math.min(viewState.zoom, ZOOM_MAX);
    viewState.zoom = Math.max(viewState.zoom, ZOOM_MIN);

    // 中央寄せの計算
    const marginX = (window.innerWidth - WORLD_WIDTH_REF * viewState.zoom) / 2;
    const marginY = (window.innerHeight - WORLD_HEIGHT_REF * viewState.zoom) / 2;
    
    viewState.x = marginX;
    viewState.y = marginY;

    redrawAllHistory();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas(); 


// ツールの設定
let currentLineSettings = {
    color: 'black',
    lineWidth: 5, 
    isErasing: false
};
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


// --- 描画・パン・ズームイベント ---

// PCイベント
canvas.addEventListener('mousedown', (e) => {
    // 描画開始時にキャンバス相対座標を取得
    const { x: screenX, y: screenY } = getRelativeScreenCoordinates(e);

    if (e.button === 0) { // 左クリックは描画開始
        const { x, y } = screenToWorld(screenX, screenY);
        startDrawing(x, y);
    } 
    // Shiftキーか中央ボタンでパン操作（移動）
    else if (e.button === 1 || e.shiftKey) { 
        isPanning = true;
        // パン開始座標はキャンバス相対座標を使用
        lastScreenX = screenX; 
        lastScreenY = screenY;
        canvas.style.cursor = 'grab';
    }
});

canvas.addEventListener('mousemove', (e) => {
    // 移動時にもキャンバス相対座標を取得
    const { x: screenX, y: screenY } = getRelativeScreenCoordinates(e);

    if (isPanning) {
        // パン操作
        viewState.x += screenX - lastScreenX;
        viewState.y += screenY - lastScreenY;
        lastScreenX = screenX;
        lastScreenY = screenY;
        redrawAllHistory();
    } else {
        const { x, y } = screenToWorld(screenX, screenY);
        draw(x, y);
    }
});

canvas.addEventListener('mouseup', () => {
    if (isPanning) { isPanning = false; canvas.style.cursor = 'crosshair'; }
    stopDrawing();
});
canvas.addEventListener('mouseout', () => {
    if (isPanning) { isPanning = false; canvas.style.cursor = 'crosshair'; }
    stopDrawing();
});

// マウスホイールイベントでズーム操作
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = 1.1; 
    const delta = e.deltaY > 0 ? 1 / zoomFactor : zoomFactor;

    const mouseX = e.clientX;
    const mouseY = e.clientY;

    // ズーム制限を適用
    const newZoom = Math.min(Math.max(ZOOM_MIN, viewState.zoom * delta), ZOOM_MAX);
    const scaleChange = newZoom / viewState.zoom;

    viewState.x = mouseX - (mouseX - viewState.x) * scaleChange;
    viewState.y = mouseY - (mouseY - viewState.y) * scaleChange;
    viewState.zoom = newZoom;

    redrawAllHistory();
});


// タッチイベント (スマホ)
let lastTouches = null; 
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    // タッチ開始時にもキャンバス相対座標を取得
    const { x: screenX, y: screenY } = getRelativeScreenCoordinates(e);

    if (e.touches.length === 1) {
        const { x, y } = screenToWorld(screenX, screenY);
        startDrawing(x, y);
    } else if (e.touches.length === 2) {
        isPanning = true;
        lastTouches = e.touches;
    }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    // タッチ移動時にもキャンバス相対座標を取得 (1本指の描画用)
    const { x: screenX, y: screenY } = getRelativeScreenCoordinates(e);

    if (isDrawing && e.touches.length === 1) {
        const { x, y } = screenToWorld(screenX, screenY);
        draw(x, y); 
    } else if (isPanning && e.touches.length >= 2 && lastTouches) {
        
        // --- パン（移動） ---
        // 2点タッチでのパン/ズームは生のclient座標の差分で計算する
        const dx = e.touches[0].clientX - lastTouches[0].clientX;
        const dy = e.touches[0].clientY - lastTouches[0].clientY;
        viewState.x += dx;
        viewState.y += dy;

        // --- ズーム（ピンチ） ---
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        const lastDist = Math.hypot(lastTouches[0].clientX - lastTouches[1].clientX, lastTouches[0].clientY - lastTouches[1].clientY);
        
        if (lastDist > 0) {
            const scaleChange = dist / lastDist;
            
            const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            
            // ズーム制限を適用
            const newZoom = Math.min(Math.max(ZOOM_MIN, viewState.zoom * scaleChange), ZOOM_MAX);
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

// 実際の線を描く関数 (線の太さをワールド座標で固定)
function drawLine(data) {
    ctx.beginPath();
    ctx.strokeStyle = data.settings.color;
    
    // 線の太さのズーム補正を削除。線幅はワールド座標で固定される。
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
    history.push(data);
    redrawAllHistory(); 
});

socket.on('load_history', (serverHistory) => {
    console.log('Loading history...');
    history = serverHistory; 
    redrawAllHistory(); 
});
