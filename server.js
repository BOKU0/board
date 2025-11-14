const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { MongoClient } = require('mongodb'); 

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = 'whiteboardDB';
const COLLECTION_NAME = 'drawings';

let history = [];
let collection;

async function connectToMongoAndLoadHistory() {
    if (!MONGO_URI) {
        console.error("MONGO_URI is not set. Cannot persist data.");
        return;
    }
    
    try {
        const client = new MongoClient(MONGO_URI);
        await client.connect();
        console.log("Connected successfully to MongoDB server.");
        
        const db = client.db(DB_NAME);
        collection = db.collection(COLLECTION_NAME);

        history = await collection.find({}).toArray();
        console.log(`History loaded from MongoDB. Total lines: ${history.length}`);
    } catch (err) {
        console.error("MongoDB connection or history loading failed:", err);
    }
}

connectToMongoAndLoadHistory().then(() => {
    app.use(express.static(path.join(__dirname, 'public'))); 

    io.on('connection', (socket) => {
        console.log('A user connected:', socket.id);

        socket.emit('load_history', history);

        socket.on('draw_line', async (data) => {
            history.push(data);

            socket.broadcast.emit('draw_line', data);

            if (collection) {
                try {
                    await collection.insertOne(data);
                } catch (e) {
                    console.error("Failed to save line to MongoDB:", e);
                }
            }
        });

        socket.on('disconnect', () => {
            console.log('User disconnected:', socket.id);
        });
    });

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
    });
});
