const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const fetch = require('node-fetch');
const uuid = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const domain = 'https://www.fearlessdraft.net';
// const domain = 'http://localhost:3333';

const currStates = {};

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());

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
    const blueTeamName = currStates[draftId]?.blueTeamName || 'Blue';
    const redTeamName = currStates[draftId]?.redTeamName || 'Red';

    res.render('draft', {
        draftId,
        side,
        blueTeamName,
        redTeamName
    });
});


app.post('/create-draft', (req, res) => {
    const blueTeamName = req.body.blueTeamName;
    const redTeamName = req.body.redTeamName;

    const draftId = uuid.v4();
    const blueLink = `${domain}/draft/${draftId}/blue`;
    const redLink = `${domain}/draft/${draftId}/red`;
    const spectatorLink = `${domain}/draft/${draftId}/spectator`;
    currStates[draftId] = {
        blueTeamName: blueTeamName,
        redTeamName: redTeamName,
        blueReady: false,
        redReady: false,
        picks: [],
        fearlessBans: [],
        timer: null,
        started: false,
        matchNumber: 1,
        sideSwapped: false
    };
    res.json({
        blueLink,
        redLink,
        spectatorLink
    });
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
        const {draftId, side} = data;
        if (side === 'blue') {
            currStates[draftId].blueReady = true;
        } else if (side === 'red') {
            currStates[draftId].redReady = true;
        }
        if(currStates[draftId].blueReady && currStates[draftId].redReady) {
            if (!currStates[draftId].fearlessBans) {
                currStates[draftId].fearlessBans = []
            }
            currStates[draftId].fearlessBans = currStates[draftId].fearlessBans.concat(currStates[draftId].picks.slice(6, 12)).concat(currStates[draftId].picks.slice(16, 20));
            currStates[draftId].picks = []
            currStates[draftId].started = true;
            io.to(draftId).emit('startDraft', currStates[draftId]);
        } 
    });

    socket.on('startTimer', (data) => {
        const draftId = data;
        currStates[draftId].started = true;
        if (currStates[draftId].timer) {
            clearInterval(currStates[draftId].timer);
            currStates[draftId].timer = null
        }
        let timeLeft = 30;
        currStates[draftId].timer = setInterval(() => {
            timeLeft--;
            io.to(draftId).emit('timerUpdate', {
                timeLeft
            });
            if (timeLeft <= -3) {
                clearInterval(currStates[draftId].timer);
                currStates[draftId].timer = null;
                io.to(draftId).emit('lockChamp');
            }
        }, 1000);
    });


    socket.on('getData', (draftId) => { //sends the state to people who open page
        if (!currStates[draftId]) { //not sure if this is needed
            socket.emit('draftState', {
                blueReady: false,
                redReady: false,
                picks: [],
                fearlessBans: [],
                timer: null,
                started: false,
                matchNumber: 1,
                sideSwapped: false,
                blueTeamName: 'Blue',
                redTeamName: 'Red'
            });
            return;
        }
        //data = everything except timer
        data = {
            blueReady: currStates[draftId].blueReady,
            redReady: currStates[draftId].redReady,
            picks: currStates[draftId].picks,
            started: currStates[draftId].started,
            fearlessBans: currStates[draftId].fearlessBans,
            matchNumber: currStates[draftId].matchNumber,
            sideSwapped: currStates[draftId].sideSwapped,
            blueTeamName: currStates[draftId].blueTeamName,
            redTeamName: currStates[draftId].redTeamName
        };
        socket.emit('draftState', data);
    });

    socket.on('pickSelection', (data) => { //new pick made
        const {draftId,pick} = data;
        if (currStates[draftId]) {
            currStates[draftId].picks.push(pick);
            io.to(draftId).emit('pickUpdate', currStates[draftId].picks);
        }
    });

    socket.on('endDraft', (draftId) => { //ends draft
        if (currStates[draftId].timer) {
            clearInterval(currStates[draftId].timer);
            currStates[draftId].timer = null;
        }
        currStates[draftId].blueReady = false;
        currStates[draftId].redReady = false;
        currStates[draftId].started = false;
        currStates[draftId].matchNumber++;
        io.to(draftId).emit('showNextGameButton', currStates[draftId]);
    });

    socket.on('switchSides', (draftId) => { //switches sides 
        if (currStates[draftId]) {
            currStates[draftId].sideSwapped = !currStates[draftId].sideSwapped;
            currStates[draftId].blueReady = false;
            currStates[draftId].redReady = false;
            if(currStates[draftId].blueTeamName === 'Blue' || currStates[draftId].redTeamName === 'Red') {
                io.to(draftId).emit('switchSidesResponse', currStates[draftId]);
                return;
            }
            const temp = currStates[draftId].blueTeamName;
            currStates[draftId].blueTeamName = currStates[draftId].redTeamName;
            currStates[draftId].redTeamName = temp;
            io.to(draftId).emit('switchSidesResponse', currStates[draftId]);
        }
    });
});

const port = process.env.PORT || 3333;
server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});