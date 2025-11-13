// Socket.ioでサーバーに接続
const socket = io();

const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');
const penButton = document.getElementById('pen-button');
const eraserButton = document.getElementById('eraser-button');

const worldCanvas = document.createElement('canvas');
const worldCtx = worldCanvas.getContext('2d');

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

// (変更なし) 描画履歴をワールドキャンバスに一括再描画する関数
function renderHistoryToWorldCanvas() {
    worldCanvas.width = WORLD_WIDTH_REF;
    worldCanvas.height = WORLD_HEIGHT_REF;
    worldCtx.clearRect(0, 0, WORLD_WIDTH_REF, WORLD_HEIGHT_REF);
    worldCtx.save();
    history.forEach(lineData => {
        drawLineOnContext(worldCtx, lineData); 
    });
    worldCtx.restore();
    redrawMainCanvas();
}

// (変更なし) ワールドキャンバスの内容をメインキャンバスに転送する関数 (高速描画)
function redrawMainCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height); 
    ctx.drawImage(
        worldCanvas,
        0, 0, worldCanvas.width, worldCanvas.height, 
        viewState.x, viewState.y, 
        worldCanvas.width * viewState.zoom, worldCanvas.height * viewState.zoom
    );
}

// (変更なし) イベント座標をキャンバス基準に変換する関数
function getRelativeScreenCoordinates(e) {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const rect = canvas.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    const relativeY = clientY - rect.top;
    return { x: relativeX, y: relativeY };
}


// (変更なし) 画面座標をワールド座標に変換する
function screenToWorld(screenX, screenY) {
    const worldX = (screenX - viewState.x) / viewState.zoom;
    const worldY = (screenY - viewState.y) / viewState.zoom;
    return { x: worldX, y: worldY };
}


// (変更なし) キャンバスサイズをウィンドウに合わせる関数
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    const requiredZoomX = window.innerWidth / WORLD_WIDTH_REF;
    const requiredZoomY = window.innerHeight / WORLD_HEIGHT_REF;
    const fitZoom = Math.min(requiredZoomX, requiredZoomY);
    
    ZOOM_MIN = fitZoom; 

    if (viewState.zoom === 1.0) {
        viewState.zoom = fitZoom;
    }
    
    viewState.zoom = Math.min(viewState.zoom, ZOOM_MAX);
    viewState.zoom = Math.max(viewState.zoom, ZOOM_MIN);

    const marginX = (window.innerWidth - WORLD_WIDTH_REF * viewState.zoom) / 2;
    const marginY = (window.innerHeight - WORLD_HEIGHT_REF * viewState.zoom) / 2;
    
    viewState.x = marginX;
    viewState.y = marginY;

    redrawMainCanvas();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas(); 


// (変更なし) ツールの設定
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

// (変更なし) PCイベント mousedown
canvas.addEventListener('mousedown', (e) => {
    const { x: screenX, y: screenY } = getRelativeScreenCoordinates(e);

    if (e.button === 0) {
        isPanning = false;
        const { x, y } = screenToWorld(screenX, screenY);
        startDrawing(x, y);
    } 
    else if (e.button === 1 || e.shiftKey) {
        stopDrawing();
        isPanning = true;
        lastScreenX = screenX; 
        lastScreenY = screenY;
        canvas.style.cursor = 'grab';
    }
});

// (変更なし) PCイベント mousemove
canvas.addEventListener('mousemove', (e) => {
    const { x: screenX, y: screenY } = getRelativeScreenCoordinates(e);

    if (isPanning) {
        viewState.x += screenX - lastScreenX;
        viewState.y += screenY - lastScreenY;
        lastScreenX = screenX;
        lastScreenY = screenY;
        redrawMainCanvas();
    } else {
        const { x, y } = screenToWorld(screenX, screenY);
        draw(x, y);
    }
});

// (変更なし) PCイベント mouseup / mouseout
canvas.addEventListener('mouseup', () => {
    if (isPanning) { isPanning = false; canvas.style.cursor = 'crosshair'; }
    stopDrawing();
});
canvas.addEventListener('mouseout', () => {
    if (isPanning) { isPanning = false; canvas.style.cursor = 'crosshair'; }
    stopDrawing();
});

// **【変更点】マウスホイールイベントでズーム操作**
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = 1.1; 
    const delta = e.deltaY > 0 ? 1 / zoomFactor : zoomFactor;

    // 変更点: マウスカーソル(e.clientX)ではなく、ビューポート（画面）の中央を基準にする
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    const newZoom = Math.min(Math.max(ZOOM_MIN, viewState.zoom * delta), ZOOM_MAX);
    const scaleChange = newZoom / viewState.zoom;

    // 基準点を (centerX, centerY) に変更
    viewState.x = centerX - (centerX - viewState.x) * scaleChange;
    viewState.y = centerY - (centerY - viewState.y) * scaleChange;
    viewState.zoom = newZoom;

    redrawMainCanvas();
});


// (変更なし) タッチイベント touchstart
let lastTouches = null; 
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const { x: screenX, y: screenY } = getRelativeScreenCoordinates(e);

    if (e.touches.length === 1) {
        isPanning = false;
        const { x, y } = screenToWorld(screenX, screenY);
        startDrawing(x, y);
    } else if (e.touches.length >= 2) {
        stopDrawing();
        isPanning = true;
        lastTouches = e.touches;
    }
}, { passive: false });

// **【変更点】タッチイベント touchmove (ピンチズーム)**
canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const { x: screenX, y: screenY } = getRelativeScreenCoordinates(e);

    if (isDrawing && e.touches.length === 1) {
        const { x, y } = screenToWorld(screenX, screenY);
        draw(x, y); 
    } else if (isPanning && e.touches.length >= 2 && lastTouches) {
        
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
            
            // 変更点: 2本指の中心ではなく、PCと同様にビューポート（画面）の中央を基準にする
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;
            
            const newZoom = Math.min(Math.max(ZOOM_MIN, viewState.zoom * scaleChange), ZOOM_MAX);
            const finalScaleChange = newZoom / viewState.zoom;

            viewState.x = centerX - (centerX - viewState.x) * finalScaleChange;
            viewState.y = centerY - (centerY - viewState.y) * finalScaleChange;
            viewState.zoom = newZoom;
        }

        lastTouches = e.touches;
        redrawMainCanvas();
    }
}, { passive: false });

// (変更なし) タッチイベント touchend
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


// (変更なし) 描画関数 (start, stop, draw)
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

    drawLineOnContext(worldCtx, lineData);
    redrawMainCanvas();
    history.push(lineData);
    socket.emit('draw_line', lineData);
    [lastWorldX, lastWorldY] = [x, y];
}

// (変更なし) 共通描画関数
function drawLineOnContext(targetCtx, data) {
    targetCtx.beginPath();
    targetCtx.strokeStyle = data.settings.color;
    targetCtx.lineWidth = data.settings.lineWidth; 
    targetCtx.lineCap = 'round';
    targetCtx.lineJoin = 'round';
    targetCtx.globalCompositeOperation = data.settings.isErasing ? 'destination-out' : 'source-over';
    targetCtx.moveTo(data.x0, data.y0);
    targetCtx.lineTo(data.x1, data.y1);
    targetCtx.stroke();
    targetCtx.globalCompositeOperation = 'source-over'; 
}


// (変更なし) Socket.io 受信イベント
socket.on('draw_line', (data) => {
    drawLineOnContext(worldCtx, data);
    redrawMainCanvas(); 
    history.push(data);
});

socket.on('load_history', (serverHistory) => {
    console.log('Loading history...');
    history = serverHistory; 
    renderHistoryToWorldCanvas(); 
});
