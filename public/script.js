/* まぁ、*/
const socket = io();

const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');
const penButton = document.getElementById('pen-button');
const eraserButton = document.getElementById('eraser-button');

const worldCanvas = document.createElement('canvas');
const worldCtx = worldCanvas.getContext('2d');

const WORLD_WIDTH_REF = 2500; 
const WORLD_HEIGHT_REF = 2000;
let ZOOM_MIN = 0.2; 
const ZOOM_MAX = 5.0; 

let viewState = {
    x: 0,
    y: 0,
    zoom: 1.0
};

let isDrawing = false;
let isPanning = false; 
let currentTool = 'pen';
let lastScreenX = 0; 
let lastScreenY = 0;
let lastWorldX = 0; 
let lastWorldY = 0;
let history = [];

function initWorldCanvas() {
    worldCanvas.width = WORLD_WIDTH_REF;
    worldCanvas.height = WORLD_HEIGHT_REF;
    worldCtx.fillStyle = 'white';
    worldCtx.fillRect(0, 0, WORLD_WIDTH_REF, WORLD_HEIGHT_REF);
}

function renderHistoryToWorldCanvas() {
    initWorldCanvas();
    
    worldCtx.save();
    history.forEach(lineData => {
        drawLineOnContext(worldCtx, lineData); 
    });
    worldCtx.restore();
    redrawMainCanvas();
}

function redrawMainCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height); 
    ctx.drawImage(
        worldCanvas,
        0, 0, worldCanvas.width, worldCanvas.height, 
        viewState.x, viewState.y, 
        worldCanvas.width * viewState.zoom, worldCanvas.height * viewState.zoom
    );
}

function clampPan() {
    const margin = 50;

    const worldViewWidth = WORLD_WIDTH_REF * viewState.zoom;
    const worldViewHeight = WORLD_HEIGHT_REF * viewState.zoom;

    const minX = margin - worldViewWidth;
    const maxX = canvas.width - margin;
    const minY = margin - worldViewHeight;
    const maxY = canvas.height - margin;

    if (worldViewWidth < canvas.width - (margin * 2)) {
        viewState.x = (canvas.width - worldViewWidth) / 2;
    } else {
        viewState.x = Math.max(minX, Math.min(viewState.x, maxX));
    }

    if (worldViewHeight < canvas.height - (margin * 2)) {
        viewState.y = (canvas.height - worldViewHeight) / 2;
    } else {
        viewState.y = Math.max(minY, Math.min(viewState.y, maxY));
    }
}


function getRelativeScreenCoordinates(e) {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const rect = canvas.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    const relativeY = clientY - rect.top;
    return { x: relativeX, y: relativeY };
}


function screenToWorld(screenX, screenY) {
    const worldX = (screenX - viewState.x) / viewState.zoom;
    const worldY = (screenY - viewState.y) / viewState.zoom;
    return { x: worldX, y: worldY };
}


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

    clampPan(); 
    redrawMainCanvas();
}

initWorldCanvas(); 
window.addEventListener('resize', resizeCanvas);
resizeCanvas(); 

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

canvas.addEventListener('mousemove', (e) => {
    const { x: screenX, y: screenY } = getRelativeScreenCoordinates(e);
    if (isPanning) {
        viewState.x += screenX - lastScreenX;
        viewState.y += screenY - lastScreenY;
        lastScreenX = screenX;
        lastScreenY = screenY;
        
        clampPan(); 
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

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = 1.1; 
    const delta = e.deltaY > 0 ? 1 / zoomFactor : zoomFactor;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const newZoom = Math.min(Math.max(ZOOM_MIN, viewState.zoom * delta), ZOOM_MAX);
    const scaleChange = newZoom / viewState.zoom;
    viewState.x = centerX - (centerX - viewState.x) * scaleChange;
    viewState.y = centerY - (centerY - viewState.y) * scaleChange;
    viewState.zoom = newZoom;
    
    clampPan(); 
    redrawMainCanvas();
});


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

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const { x: screenX, y: screenY } = getRelativeScreenCoordinates(e);
    if (isDrawing && e.touches.length === 1) {
        const { x, y } = screenToWorld(screenX, screenY);
        draw(x, y); 
    } else if (isPanning && e.touches.length >= 2 && lastTouches) {
        const dx = e.touches[0].clientX - lastTouches[0].clientX;
        const dy = e.touches[0].clientY - lastTouches[0].clientY;
        viewState.x += dx;
        viewState.y += dy;
        
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        const lastDist = Math.hypot(lastTouches[0].clientX - lastTouches[1].clientX, lastTouches[0].clientY - lastTouches[1].clientY);
        if (lastDist > 0) {
            const scaleChange = dist / lastDist;
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;
            const newZoom = Math.min(Math.max(ZOOM_MIN, viewState.zoom * scaleChange), ZOOM_MAX);
            const finalScaleChange = newZoom / viewState.zoom;
            viewState.x = centerX - (centerX - viewState.x) * finalScaleChange;
            viewState.y = centerY - (centerY - viewState.y) * finalScaleChange;
            viewState.zoom = newZoom;
        }
        lastTouches = e.touches;
        
        clampPan(); 
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
    drawLineOnContext(worldCtx, lineData);
    redrawMainCanvas();
    history.push(lineData);
    socket.emit('draw_line', lineData);
    [lastWorldX, lastWorldY] = [x, y];
}

function drawLineOnContext(targetCtx, data) {
    targetCtx.beginPath();
    targetCtx.strokeStyle = data.settings.color;
    targetCtx.lineWidth = data.settings.lineWidth; 
    targetCtx.lineCap = 'round';
    targetCtx.lineJoin = 'round';
    
    targetCtx.globalCompositeOperation = 'source-over';

    targetCtx.moveTo(data.x0, data.y0);
    targetCtx.lineTo(data.x1, data.y1);
    targetCtx.stroke();
}


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
