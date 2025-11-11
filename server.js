const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
// Socket.ioを初期化
const io = new Server(server); 

// ★★★ 描画データを保存する配列 ★★★
// サーバーのメモリ上に保存する (サーバーが再起動するとリセットされるよ)
const history = [];

// publicフォルダを静的ファイルとして配信
app.use(express.static(path.join(__dirname, 'public'))); 

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // 接続時に、保存されている全描画データを新規ユーザーに送信
    socket.emit('load_history', history);

    // ユーザーが描画を始めた時のイベント
    socket.on('draw_line', (data) => {
        // 描画データを履歴に追加
        history.push(data);

        // 自分以外の全クライアントに描画データをブロードキャスト（共有）
        socket.broadcast.emit('draw_line', data);
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
