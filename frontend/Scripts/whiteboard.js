const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let isDrawing = false;
let currentTool = 'pen';
let currentColor = '#202124';
window.currentColor = currentColor; // Expose for hand tracking
const STROKE_WIDTH = 3;
let lastX = 0;
let lastY = 0;
let startX = 0;
let startY = 0;
let savedState;
let isEraser = false;

function resizeCanvas() {
    const container = canvas.parentElement;
    if (!container || container.clientWidth === 0) return;

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    tempCtx.drawImage(canvas, 0, 0);

    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    if (tempCanvas.width > 0 && tempCanvas.height > 0) {
        ctx.drawImage(tempCanvas, 0, 0);
    }

    savedState = ctx.getImageData(0, 0, canvas.width, canvas.height);
}

window.addEventListener('resize', resizeCanvas);
setTimeout(resizeCanvas, 100);

const toolButtons = document.querySelectorAll('.control-btn, .icon-button');
toolButtons.forEach(button => {
    button.addEventListener('click', () => {
        const tool = button.getAttribute('data-tool');
        if (!tool) return;

        if (tool === 'clear') {
            clearCanvas();
            return;
        }

        if (tool === 'save') {
            saveCanvas();
            return;
        }

        if (tool === 'hand') {
            // Hand tracking is handled by handtracking.js
            // Don't interfere with its click handler
            return;
        }

        if (tool === 'eraser') {
            isEraser = true;
            currentTool = 'pen';
        } else {
            isEraser = false;
            currentTool = tool;
        }

        document.querySelectorAll('.control-btn').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
    });
});

// Color picker functionality
const colorInput = document.getElementById('colorInput');
const colorPreview = document.getElementById('colorPreview');
if (colorInput && colorPreview) {
    colorInput.addEventListener('input', (e) => {
        currentColor = e.target.value;
        window.currentColor = currentColor; // Update global for hand tracking
        colorPreview.style.backgroundColor = currentColor;
    });
}

// Drawing functions
function startDrawing(e) {
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    [lastX, lastY] = [x, y];
    [startX, startY] = [x, y];

    // Save the current canvas state when starting to draw
    if (currentTool !== 'pen') {
        savedState = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }
}

function draw(e) {
    if (!isDrawing) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isEraser) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = 20;
    } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = currentColor;
        ctx.lineWidth = STROKE_WIDTH;
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (currentTool) {
        case 'pen':
            ctx.beginPath();
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(x, y);
            ctx.stroke();
            
            // Broadcast pen stroke
            if (typeof broadcastDraw === 'function') {
                broadcastDraw({
                    tool: 'pen',
                    fromX: lastX,
                    fromY: lastY,
                    toX: x,
                    toY: y,
                    color: currentColor,
                    lineWidth: STROKE_WIDTH,
                    isEraser: isEraser
                });
            }
            
            [lastX, lastY] = [x, y];
            break;

        case 'line':
            ctx.putImageData(savedState, 0, 0);
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(x, y);
            ctx.stroke();
            break;

        case 'rectangle':
            ctx.putImageData(savedState, 0, 0);
            const width = x - startX;
            const height = y - startY;
            ctx.beginPath();
            ctx.strokeRect(startX, startY, width, height);
            break;

        case 'circle':
            ctx.putImageData(savedState, 0, 0);
            const radius = Math.sqrt(
                Math.pow(x - startX, 2) +
                Math.pow(y - startY, 2)
            );
            ctx.beginPath();
            ctx.arc(startX, startY, radius, 0, Math.PI * 2);
            ctx.stroke();
            break;
    }
}

function stopDrawing() {
    if (!isDrawing) return;
    isDrawing = false;

    // Save the final state after drawing is complete
    savedState = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Send full canvas state after drawing completes (for shapes)
    if (currentTool !== 'pen' && typeof sendCanvasState === 'function') {
        sendCanvasState();
    }
}

function clearCanvas() {
    if (confirm('Clear the entire whiteboard?')) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        savedState = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Broadcast clear action
        if (typeof broadcastClear === 'function') {
            broadcastClear();
        }
    }
}

function saveCanvas() {
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().slice(0, 10);
    link.download = `nexis-whiteboard-${timestamp}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mouseleave', stopDrawing);

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousedown', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    canvas.dispatchEvent(mouseEvent);
});

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    canvas.dispatchEvent(mouseEvent);
});

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    const mouseEvent = new MouseEvent('mouseup', {});
    canvas.dispatchEvent(mouseEvent);
});
