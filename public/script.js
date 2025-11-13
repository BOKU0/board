// Socket.ioでサーバーに接続
const socket = io();

const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');
const penButton = document.getElementById('pen-button');
const eraserButton = document.getElementById('eraser-button');

// **【追加】オフスクリーンキャンバス（描画レイヤー）の作成**
// 実際の描画内容を保持し、メインキャンバスに転送するための裏側のキャンバスです。
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


// **【変更】描画履歴をワールドキャンバスに一括再描画する関数**
// 主に初回ロード時や画面サイズ変更時に呼び出し、worldCanvas の内容を確定させます。
function renderHistoryToWorldCanvas() {
    // worldCanvas のサイズを設定
    worldCanvas.width = WORLD_WIDTH_REF;
    worldCanvas.height = WORLD_HEIGHT_REF;

    worldCtx.clearRect(0, 0, WORLD_WIDTH_REF, WORLD_HEIGHT_REF);
    worldCtx.save();
    
    // worldCtx はワールド座標そのものなので、translate/scale は不要
    // worldCtx.translate(0, 0);
    // worldCtx.scale(1, 1);

    history.forEach(lineData => {
        // worldCtx を使って描画
        drawLineOnContext(worldCtx, lineData); 
    });
    
    worldCtx.restore();
    // 描画後、メインキャンバスに転送
    redrawMainCanvas();
}


// **【追加】ワールドキャンバスの内容をメインキャンバスに転送する関数 (高速描画)**
// カメラの位置(x, y)とズーム(zoom)が変わった時のみ呼ばれます。
function redrawMainCanvas() {
    // メインキャンバスをクリア
    ctx.clearRect(0, 0, canvas.width, canvas.height); 

    // worldCanvas を viewState に基づいてメインキャンバスに描画（転送）
    ctx.drawImage(
        worldCanvas,
        0, 0, worldCanvas.width, worldCanvas.height, // worldCanvas の全体
        viewState.x, viewState.y, // メインキャンバスの描画開始位置
        worldCanvas.width * viewState.zoom, worldCanvas.height * viewState.zoom // ズーム後のサイズ
    );
}

// イベント座標をキャンバス基準に変換する関数
function getRelativeScreenCoordinates(e) {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const rect = canvas.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    const relativeY = clientY - rect.top;

    return { x: relativeX, y: relativeY };
}


// 画面座標をワールド座標に変換する
function screenToWorld(screenX, screenY) {
    // ここで viewState.x/y は、worldCanvas をメインキャンバスのどこに描画するかを示す値
    // worldX = ( (screenX - viewState.x) / viewState.zoom );
    // worldY = ( (screenY - viewState.y) / viewState.zoom );
    const worldX = (screenX - viewState.x) / viewState.zoom;
    const worldY = (screenY - viewState.y) / viewState.zoom;
    return { x: worldX, y: worldY };
}


// キャンバスサイズをウィンドウに合わせる関数
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // 画面全体にボードが収まる最小のズーム率を計算
    const requiredZoomX = window.innerWidth / WORLD_WIDTH_REF;
    const requiredZoomY = window.innerHeight / WORLD_HEIGHT_REF;
    const fitZoom = Math.min(requiredZoomX, requiredZoomY);
    
    ZOOM_MIN = fitZoom; 

    // 初回起動時（zoom: 1.0）またはズームアウトの下限を超えていた場合、ZOOM_MINに設定
    // **【微調整】初回起動時のみ fitZoom を適用し、それ以降はユーザー設定を維持するロジックに変更**
    if (viewState.zoom === 1.0) {
        viewState.zoom = fitZoom;
    }
    
    viewState.zoom = Math.min(viewState.zoom, ZOOM_MAX);
    viewState.zoom = Math.max(viewState.zoom, ZOOM_MIN);

    // 中央寄せの計算
    // viewState.x/y は worldCanvas の左上隅がメインキャンバス上のどこに位置するかを示す
    const marginX = (window.innerWidth - WORLD_WIDTH_REF * viewState.zoom) / 2;
    const marginY = (window.innerHeight - WORLD_HEIGHT_REF * viewState.zoom) / 2;
    
    viewState.x = marginX;
    viewState.y = marginY;

    // 【変更】全履歴再描画ではなく、worldCanvas の内容をメインキャンバスに転送
    redrawMainCanvas();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas(); 


// ツールの設定 (変更なし)
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

// PCイベント (変更なし: 描画・パン操作のロジック)
canvas.addEventListener('mousedown', (e) => {
    const { x: screenX, y: screenY } = getRelativeScreenCoordinates(e);

    if (e.button === 0) { // 左クリックは描画開始
        // 【追加】描画開始時はパン操作を解除
        isPanning = false;
        const { x, y } = screenToWorld(screenX, screenY);
        startDrawing(x, y);
    } 
    else if (e.button === 1 || e.shiftKey) { // Shiftキーか中央ボタンでパン操作（移動）
        // 【追加】パン開始時は描画を解除
        stopDrawing();
        isPanning = true;
        lastScreenX = screenX; 
        lastScreenY = screenY;
        canvas.style.cursor = 'grab';
    }
});

canvas.addEventListener('mousemove', (e) => {
    const { x: screenX, y: screenY } = getRelativeScreenCoordinates(e);

    if (isPanning) {
        // パン操作
        viewState.x += screenX - lastScreenX;
        viewState.y += screenY - lastScreenY;
        lastScreenX = screenX;
        lastScreenY = screenY;
        // 【変更】全履歴再描画ではなく、メインキャンバスを再描画（高速）
        redrawMainCanvas();
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

// マウスホイールイベントでズーム操作 (変更なし: ズームロジック)
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = 1.1; 
    const delta = e.deltaY > 0 ? 1 / zoomFactor : zoomFactor;

    const mouseX = e.clientX;
    const mouseY = e.clientY;

    const newZoom = Math.min(Math.max(ZOOM_MIN, viewState.zoom * delta), ZOOM_MAX);
    const scaleChange = newZoom / viewState.zoom;

    viewState.x = mouseX - (mouseX - viewState.x) * scaleChange;
    viewState.y = mouseY - (mouseY - viewState.y) * scaleChange;
    viewState.zoom = newZoom;

    // 【変更】全履歴再描画ではなく、メインキャンバスを再描画（高速）
    redrawMainCanvas();
});


// タッチイベント (スマホ) (変更なし: タッチイベントロジック)
let lastTouches = null; 
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const { x: screenX, y: screenY } = getRelativeScreenCoordinates(e);

    if (e.touches.length === 1) {
        isPanning = false; // 1本指は描画を優先
        const { x, y } = screenToWorld(screenX, screenY);
        startDrawing(x, y);
    } else if (e.touches.length >= 2) {
        stopDrawing(); // 2本指以上は描画を中断しパン/ズームを優先
        isPanning = true;
        lastTouches = e.touches;
    }
}, { passive: false });

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
            
            const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            
            const newZoom = Math.min(Math.max(ZOOM_MIN, viewState.zoom * scaleChange), ZOOM_MAX);
            const finalScaleChange = newZoom / viewState.zoom;

            viewState.x = centerX - (centerX - viewState.x) * finalScaleChange;
            viewState.y = centerY - (centerY - viewState.y) * finalScaleChange;
            viewState.zoom = newZoom;
        }

        lastTouches = e.touches;
        // 【変更】全履歴再描画ではなく、メインキャンバスを再描画（高速）
        redrawMainCanvas();
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

    // 【変更】描画は worldCtx に行う
    drawLineOnContext(worldCtx, lineData);
    // 【追加】描画した線はメインキャンバスにも反映（worldCanvas を転送）
    redrawMainCanvas();
    
    history.push(lineData);
    
    socket.emit('draw_line', lineData);

    [lastWorldX, lastWorldY] = [x, y];
}

// **【追加】任意のコンテキストに線を描く共通関数**
function drawLineOnContext(targetCtx, data) {
    targetCtx.beginPath();
    targetCtx.strokeStyle = data.settings.color;
    // 線の太さはワールド座標で固定（ズーム補正なし）
    targetCtx.lineWidth = data.settings.lineWidth; 
    
    targetCtx.lineCap = 'round';
    targetCtx.lineJoin = 'round';

    targetCtx.globalCompositeOperation = data.settings.isErasing ? 'destination-out' : 'source-over';

    targetCtx.moveTo(data.x0, data.y0);
    targetCtx.lineTo(data.x1, data.y1);
    targetCtx.stroke();

    targetCtx.globalCompositeOperation = 'source-over'; 
}


// --- Socket.io 受信イベント ---
socket.on('draw_line', (data) => {
    // 【変更】受信した線は worldCtx に直接描き込み、メインキャンバスに反映するだけ
    drawLineOnContext(worldCtx, data);
    redrawMainCanvas(); 
    history.push(data);
});

socket.on('load_history', (serverHistory) => {
    console.log('Loading history...');
    history = serverHistory; 
    // 【変更】全履歴を worldCanvas に再描画（初回処理）
    renderHistoryToWorldCanvas(); 
});
