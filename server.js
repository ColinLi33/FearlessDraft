const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const fetch = require('node-fetch');
const uuid = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const domain = 'localhost:3333';

const currStates = {};

app.set('view engine', 'ejs');
app.use(express.static('public'));

app.get('/', (req, res) => {   
    res.render('index');
});

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

app.get('/draft/:draftId/:side', (req, res) => {
    const draftId = req.params.draftId;
    const side = req.params.side;
    
    // Pass the draftId and side to the draft page
    res.render('draft', { draftId, side });
});


app.post('/create-draft', (req, res) => {
    const draftId = uuid.v4();
    const blueLink = `${domain}/draft/${draftId}/blue`;
    const redLink = `${domain}/draft/${draftId}/red`;
    const spectatorLink = `${domain}/draft/${draftId}/spectator`;
    currStates[draftId] = {
        blueReady: false,
        redReady: false,
        picks: [],
        timer: null,
        started: false
    };
    res.json({ blueLink, redLink, spectatorLink });
});

  
  io.on('connection', (socket) => {
    socket.on('joinDraft', (draftId) => {
        try {
            socket.join(draftId);
        } catch (error) {
            console.error('Error joining draft:', error);
        }
    });
  
    socket.on('playerReady', (data) => {
        const { draftId, side } = data;
        if (!currStates[draftId]) {
            currStates[draftId] = {
                blueReady: false,
                redReady: false,
                picks: [],
                timer: null,
                started: false
            };
        }
        if (side === 'blue') {
            currStates[draftId].blueReady = true;
        } else if (side === 'red') {
            currStates[draftId].redReady = true;
        }
        io.to(draftId).emit('playerReady', currStates[draftId]);
    });

    socket.on('startTimer', (data) => {
        const { draftId } = data;
        currStates[draftId].started = true;
        if(currStates[draftId].timer){
            clearInterval(currStates[draftId].timer);
            currStates[draftId].timer = null
        }
        let timeLeft = 30;
        currStates[draftId].timer = setInterval(() => {
            timeLeft--;
            io.to(draftId).emit('timerUpdate', { timeLeft });
            if (timeLeft <= -3) {
                clearInterval(currStates[draftId].timer);
                currStates[draftId].timer = null;
                io.to(draftId).emit('lockChamp');
            }
        }, 1000);
    });
  
    socket.on('getData', (draftId) => {
        if(!currStates[draftId]){
            socket.emit('draftState', { blueReady: false, redReady: false, picks: [], started: false });
            return;
        }
        data = { blueReady: currStates[draftId].blueReady, redReady: currStates[draftId].redReady, picks: currStates[draftId].picks, started: currStates[draftId].started };
        socket.emit('draftState', data);
    });
  
    socket.on('pickSelection', (data) => {
        const { draftId, pick } = data;
        if (currStates[draftId]) {
            currStates[draftId].picks.push(pick);
            io.to(draftId).emit('pickUpdate', currStates[draftId].picks);
        }
    });
  });

const port = process.env.PORT || 3333;
server.listen(port, () => {
	console.log(`Server is running on port ${port}`);
});