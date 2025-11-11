// server.js
const fs = require('fs');
const path = require('path');
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });

const STORAGE_FILE = path.join(__dirname, 'strokes_store.json');

// Load persisted strokes (if any)
let strokes = [];
try {
  if (fs.existsSync(STORAGE_FILE)) {
    const raw = fs.readFileSync(STORAGE_FILE, 'utf8');
    strokes = JSON.parse(raw) || [];
  }
} catch (e) {
  console.error('Failed to load storage:', e);
  strokes = [];
}

function persist() {
  try {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(strokes), 'utf8');
  } catch (e) {
    console.error('Failed to persist:', e);
  }
}

// Utility: generate unique ids
const { randomUUID } = require('crypto');

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  // send full current strokes to newly connected client
  socket.on('init', () => {
    socket.emit('init', strokes);
  });

  // A client submits a stroke (pen drawing)
  // stroke = { path: [{x,y},...], color, width, tool:'pen', ownerSessionId }
  socket.on('stroke', (stroke) => {
    try {
      const id = randomUUID();
      const saved = Object.assign({ id, createdAt: Date.now() }, stroke);
      strokes.push(saved);
      persist();
      // broadcast to all other clients including sender (so everyone's consistent)
      io.emit('stroke', saved);
    } catch (e) {
      console.error(e);
    }
  });

  // Erase request: { x, y, radius, sessionId }
  // Only remove strokes that belong to that sessionId and intersect with radius
  socket.on('erase', (data) => {
    try {
      const { x, y, radius, sessionId } = data;
      if (!sessionId) return;
      const removedIds = [];
      // simple hit test: check if any point in stroke.path within radius
      strokes = strokes.filter(stroke => {
        if (stroke.ownerSessionId !== sessionId) {
          return true; // keep strokes not owned by requester
        }
        const hit = stroke.path.some(p => {
          const dx = p.x - x;
          const dy = p.y - y;
          return dx*dx + dy*dy <= radius*radius;
        });
        if (hit) {
          removedIds.push(stroke.id);
          return false; // remove
        }
        return true; // keep if no hit
      });
      if (removedIds.length > 0) {
        persist();
        io.emit('remove', removedIds); // broadcast removed stroke ids
      }
    } catch (e) {
      console.error(e);
    }
  });

  socket.on('clearAllButKeep', () => {
    // not used, but placeholder if needed
  });

  socket.on('disconnect', () => {
    // nothing special
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
