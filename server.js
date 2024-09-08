const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const fetch = require('node-fetch');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static('public'));

app.get('/proxy/championrates', async (req, res) => { //TODO: cache later
	try {
		const response = await fetch('https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/championrates.json');
		const data = await response.json();
		res.json(data);
	} catch (error) {
		console.error('Error fetching data:', error);
		res.status(500).json({
			error: 'Failed to fetch data'
		});
	}
});

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