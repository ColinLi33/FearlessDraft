const express = require('express');
const http = require('http');
require('dotenv').config();
const socketIO = require('socket.io');
const fetch = require('node-fetch');
const uuid = require('uuid');
var { nanoid } = require('nanoid');
const mongoose = require('mongoose');
const NodeCache = require('node-cache');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const cache = new NodeCache({ stdTTL: 86400 }); // Cache for 1 day
const domain = 'https://www.fearlessdraft.net';
// const domain = 'http://localhost:3333';

const currStates = {};

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());

app.get('/', (req, res) => {
	res.render('index');
});
const mongoUser = process.env.mongoUser;
const mongoPass = process.env.mongoPass;
const uri = `mongodb+srv://${mongoUser}:${mongoPass}@fearlessdraft.roz4r.mongodb.net/?retryWrites=true&w=majority&appName=FearlessDraft`;
const clientOptions = {
	serverApi: {
		version: '1',
		strict: true,
		deprecationErrors: true
	}
};
async function run() {
	try {
		// Create a Mongoose client with a MongoClientOptions object to set the Stable API version
		await mongoose.connect(uri, clientOptions);
		await mongoose.connection.db.admin().command({
			ping: 1
		});
		console.log("Connected To MongoDB");
	} catch (error) {
		// Ensures that the client will close when you finish/error
		console.error("Error connecting to MongoDB", error);
	}
}
run().catch(console.dir);

const draftSchema = new mongoose.Schema({
	draftId: String,
	picks: [String],
	fearlessBans: [String],
	matchNumber: Number,
	blueTeamName: String,
	redTeamName: String,
    date: {
        type: Date,
        default: Date.now
    }
});

const Draft = mongoose.model('Draft', draftSchema);
setInterval(checkFinishedDrafts, 5 * 1000 * 60); //check every 5 minutes to see if drafts are finished

async function saveDraft(draftId, picks, fearlessBans, matchNumber, blueTeamName, redTeamName) {
	try {
		if (mongoose.connection.readyState !== 1) {
			throw new Error("MongoDB connection is not established");
		}
		const draft = new Draft({
			draftId,
			picks,
			fearlessBans,
			matchNumber,
			blueTeamName,
			redTeamName,
            date: Date.now()
		});
		await draft.save();
		console.log('Draft saved successfully');
	} catch (error) {
		console.error('Error saving draft:', error);
	}
}

async function getDraft(draftId, matchNumber) {
	try {
		const draft = await Draft.findOne({
			draftId,
			matchNumber
		});
		return draft;
	} catch (error) {
		console.error('Error retrieving draft:', error);
		throw error;
	}
}

function isDraftFinished(draftId) {
	const inactivityDuration = 3 * 1000 * 60 * 60; // 3 hours
	const currentTime = Date.now();
	const lastActivity = currStates[draftId].lastActivity;

	return currentTime - lastActivity >= inactivityDuration;
}

function checkFinishedDrafts() {
	Object.keys(currStates).forEach((draftId) => {
		if (!currStates[draftId].finished && isDraftFinished(draftId)) {
			currStates[draftId].finished = true;
			console.log(`Draft ${draftId} is finished.`);
			delete currStates[draftId];
		}
	});
}

app.get('/proxy/championrates', async (req, res) => { //TODO: cache later
    const cacheKey = 'championrates';
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
        return res.json(cachedData);
    }
	try {
		const response = await fetch('https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/championrates.json');
		const data = await response.json();
        cache.set(cacheKey, data);
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

	// const draftId = uuid.v4();
    const draftId = nanoid(8);
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
		sideSwapped: false,
		finished: false,
		lastActivity: Date.now()
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
		const {
			draftId,
			side
		} = data;
		if (side === 'blue') {
			currStates[draftId].blueReady = true;
		} else if (side === 'red') {
			currStates[draftId].redReady = true;
		}
		currStates[draftId].lastActivity = Date.now();
		if (currStates[draftId].blueReady && currStates[draftId].redReady) {
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
		currStates[draftId].lastActivity = Date.now();
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
		if (!currStates[draftId] || currStates[draftId].finished) {
			socket.emit('draftState', {
				finished: true
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
    
    socket.on('hover', (data) => { //hovering over champ
        socket.to(data.draftId).emit('hover', data.champion);
    });

	socket.on('pickSelection', (data) => { //new pick made
		const {
			draftId,
			pick
		} = data;
		currStates[draftId].lastActivity = Date.now();
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
		saveDraft(draftId, currStates[draftId].picks, currStates[draftId].fearlessBans, currStates[draftId].matchNumber, currStates[draftId].blueTeamName, currStates[draftId].redTeamName);
		currStates[draftId].matchNumber++;
		currStates[draftId].lastActivity = Date.now();
		if (currStates[draftId].matchNumber >= 5) { //5 games total
			currStates[draftId].finished = true;
		}
		io.to(draftId).emit('showNextGameButton', currStates[draftId]);
	});
    

	socket.on('switchSides', (draftId) => { //switches sides 
		if (currStates[draftId]) {
			currStates[draftId].sideSwapped = !currStates[draftId].sideSwapped;
			currStates[draftId].blueReady = false;
			currStates[draftId].redReady = false;
			if (currStates[draftId].blueTeamName === 'Blue' || currStates[draftId].redTeamName === 'Red') {
				io.to(draftId).emit('switchSidesResponse', currStates[draftId]);
				return;
			}
			const temp = currStates[draftId].blueTeamName;
			currStates[draftId].blueTeamName = currStates[draftId].redTeamName;
			currStates[draftId].redTeamName = temp;
			io.to(draftId).emit('switchSidesResponse', currStates[draftId]);
		}
	});

    socket.on('endSeries', (draftId) => { //ends draft
		currStates[draftId].finished = true;
		io.to(draftId).emit('showNextGameButton', currStates[draftId]);
        delete currStates[draftId];
	});

	socket.on('showDraft', async (draftId, gameNum) => { //shows draft
		try {
			const draft = await getDraft(draftId, gameNum);
			if (draft) {
				draftData = {
					picks: draft.picks,
					fearlessBans: draft.fearlessBans,
					matchNumber: draft.matchNumber,
					blueTeamName: draft.blueTeamName,
					redTeamName: draft.redTeamName,
				}
				socket.emit('showDraftResponse', draftData);
			} else {
				socket.emit('showDraftResponse', null);
			}
		} catch (error) {
			console.error('Error showing draft:', error);
		}
	});
});

const port = process.env.PORT || 3333;
server.listen(port, () => {
	console.log(`Server is running on port ${port}`);
});