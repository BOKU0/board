const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { MongoClient } = require('mongodb'); // ★★★ MongoDBクライアントを追加 ★★★

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// MongoDB接続設定
const MONGO_URI = process.env.MONGO_URI; // Renderの環境変数から取得
const DB_NAME = 'whiteboardDB';
const COLLECTION_NAME = 'drawings';

let history = []; // 描画データを保存する配列
let collection;   // MongoDBのコレクションオブジェクト

// ★★★ MongoDBに接続し、履歴を読み込む関数 ★★★
async function connectToMongoAndLoadHistory() {
    if (!MONGO_URI) {
        console.error("MONGO_URI is not set. Cannot persist data.");
        return;
    }
    
    try {
        // クライアントを作成し、接続を試みる
        const client = new MongoClient(MONGO_URI);
        await client.connect();
        console.log("Connected successfully to MongoDB server.");
        
        const db = client.db(DB_NAME);
        collection = db.collection(COLLECTION_NAME);

        // データベースから全履歴を読み込む
        history = await collection.find({}).toArray();
        console.log(`History loaded from MongoDB. Total lines: ${history.length}`);
    } catch (err) {
        console.error("MongoDB connection or history loading failed:", err);
    }
}

// 接続と履歴の読み込みをサーバー起動前に行う
connectToMongoAndLoadHistory().then(() => {
    // publicフォルダを静的ファイルとして配信
    app.use(express.static(path.join(__dirname, 'public'))); 

    io.on('connection', (socket) => {
        console.log('A user connected:', socket.id);

        // 接続時に、ロード済みの全描画データを新規ユーザーに送信
        socket.emit('load_history', history);

        // ユーザーが描画を始めた時のイベント
        socket.on('draw_line', async (data) => {
            // 1. メモリ上の履歴に追加
            history.push(data);

            // 2. 自分以外の全クライアントにブロードキャスト
            socket.broadcast.emit('draw_line', data);

            // 3. ★★★ MongoDBに描画データを保存 ★★★
            if (collection) {
                try {
                    // IDを自動で振るため、_idフィールドは含めない
                    await collection.insertOne(data);
                } catch (e) {
                    console.error("Failed to save line to MongoDB:", e);
                }
            }
        });

        // ユーザーが切断した時のイベント
        socket.on('disconnect', () => {
            console.log('User disconnected:', socket.id);
        });
    });

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
    });
});
