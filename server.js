const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const fetch = require('node-fetch');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('A user connected');


    socket.on('draftSelection', (data) => {
        console.log('Draft selection:', data);
        io.emit('draftUpdate', data);
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});

const port = process.env.PORT || 3333;
server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});