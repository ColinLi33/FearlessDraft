const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const fetch = require('node-fetch');
const uuid = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const domain = 'localhost:3333';
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


app.post('/create-draft', (req, res) => {
    const draftId = uuid.v4();
    const blueLink = `${domain}/draft/${draftId}/blue`;
    const redLink = `${domain}/draft/${draftId}/red`;
    const spectatorLink = `${domain}/draft/${draftId}/spectator`;
    res.json({ blueLink, redLink, spectatorLink });
});
  
  io.on('connection', (socket) => {
    console.log('A user connected');
  
    // Join a draft room based on the URL
    socket.on('joinDraft', (data) => {
      const { draftId, side } = data;
      socket.join(draftId);
      console.log(`User joined draft ${draftId} on ${side} side`);
      socket.to(draftId).emit('userJoined', { side });
    });
  
    // Handle draft selection within a draft room
    socket.on('draftSelection', (data) => {
      console.log('Draft selection:', data);
      io.to(data.draftId).emit('draftUpdate', data);
    });
  
    socket.on('disconnect', () => {
      console.log('A user disconnected');
    });
  });

const port = process.env.PORT || 3333;
server.listen(port, () => {
	console.log(`Server is running on port ${port}`);
});