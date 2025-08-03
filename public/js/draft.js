const socket = io();
const patch = '15.15.1'
const baseUrl = `https://ddragon.leagueoflegends.com/cdn/${patch}`
let champions = null;
let currPick = 0;
let matchNumber = 1;
const preloadedImages = {};
const preloadedIcons = {};
let usedChamps = new Set();
let fearlessChamps = new Set();
let timerInterval = null;
let timeLeft = 30;
let side = null
let blueReady = false;
let redReady = false;
const championGrid = document.getElementById('champion-grid');
const searchInput = document.getElementById('searchInput');
const confirmButton = document.getElementById('confirmButton');
const switchSidesButton = document.getElementById('switchSidesButton');
const finishSeriesButton = document.getElementById('finishSeriesButton');
const roleIcons = document.querySelectorAll('.role-icon');
let selectedRole = '';
let selectedChampion = null;
let viewingPreviousDraft = false;
let isLocking = false;


function startTimer() {
	if(currPick > 0){
        socket.emit('startTimer', draftId);
    }
}


async function loadChamps() { //preload champion grid images
    try{
        return new Promise((resolve, reject) => {
            fetch(`${baseUrl}/data/en_US/champion.json`)
                .then(response => response.json())
                .then(data => {
                    champions = data.data;
                    champions['MonkeyKing'].id = 'Wukong'; //LOL!
                    champions = Object.entries(champions).map(([key, value]) => ({
                        id: value.id,
                        key: value.key,
                    }));
                    //sort chmapions by id
                    champions.sort((a, b) => a.id.localeCompare(b.id)); //TODO: maybe find faster way to do this
                    champions.unshift({id: 'none', key: 'none'});
                    return fetch('/proxy/championrates');
                })
                .then(response => response.json())
                .then(data => {
                    roleData = data;
                    mergeRoleData(roleData.data);
                    resolve();
                })
                .catch(error => {
                    console.error('Error fetching data:', error);
                    reject(error);
                });
        });
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

function preloadChampionImages() { //preload pick images
	Object.keys(champions).forEach(championKey => {
        if(championKey == 0){ //none placeholder icon
            const championImage = new Image();
            const championIcon = new Image();
            championImage.src = '/img/placeholder.png';
            championIcon.src = '/img/placeholder.png';
            preloadedImages['none'] = championImage;
            preloadedIcons['none'] = championIcon;
            return;
        }
		const champion = champions[championKey];
		const championImage = new Image();
		const championIcon = new Image();
		if (champion.id === 'Fiddlesticks') { //LOL!
			championImage.src = `https://ddragon.leagueoflegends.com/cdn/img/champion/centered/FiddleSticks_0.jpg`;
			championIcon.src = `${baseUrl}/img/champion/Fiddlesticks.png`;
		} else if(champion.id === 'Wukong'){
            championImage.src = `https://ddragon.leagueoflegends.com/cdn/img/champion/centered/MonkeyKing_0.jpg`;
            championIcon.src = `${baseUrl}/img/champion/MonkeyKing.png`;
        } else {
			championImage.src = `https://ddragon.leagueoflegends.com/cdn/img/champion/centered/${champion.id}_0.jpg`;
			championIcon.src = `${baseUrl}/img/champion/${champion.id}.png`;
		}
		preloadedImages[champion.id] = championImage;
		preloadedIcons[champion.id] = championIcon;
	});
}

function mergeRoleData(roleData) { //get role data for role filters
	Object.keys(champions).forEach(champ => {
		const key = champions[champ].key.toString();
		if (roleData[key]) {
			const roles = roleData[key];
			roleTest = Object.entries(roles).map(([role, data]) => ({
				role: role,
				playRate: data.playRate
			}))
			roleTest = roleTest.filter(role => role.playRate > 0);
			roleTest = roleTest.map(role => role.role);
			champions[champ].roles = roleTest;
		} else {
			champions[champ].roles = [];
		}
	});
}

function getCurrSlot() { //get current pick in draft
	if (currPick <= 6) {
		return currPick % 2 === 1 ? `BB${Math.ceil(currPick/2)}` : `RB${Math.ceil(currPick/2)}`;
	} else if (currPick <= 12) {
		switch (currPick) {
			case 7:
				return 'BP1';
			case 8:
				return 'RP1';
			case 9:
				return 'RP2';
			case 10:
				return 'BP2';
			case 11:
				return 'BP3';
			case 12:
				return 'RP3';
		}
	} else if (currPick <= 16) {
		return currPick % 2 === 0 ? `BB${Math.ceil(currPick/2)-3}` : `RB${Math.ceil(currPick/2)-3}`;
	} else if (currPick <= 20) {
		switch (currPick) {
			case 17:
				return 'RP4';
			case 18:
				return 'BP4';
			case 19:
				return 'BP5';
			case 20:
				return 'RP5';
		}
	} else {
		return "done";
	}
}

function displayChampions(champions) { //display champion grid
	championGrid.innerHTML = '';
	Object.keys(champions).forEach(championKey => {
		const champion = champions[championKey];
		const championIcon = document.createElement('img');
		championIcon.src = preloadedIcons[champion.id].src;
		championIcon.alt = champion.id;
		championIcon.classList.add('champion-icon');
        if(champion.id === 'none'){ //placeholder image for none pick
            championIcon.style.objectFit = 'cover';
            championIcon.style.objectPosition = 'center';
        }
		if (champion.id !== 'none' && (usedChamps.has(champion.id) || fearlessChamps.has(champion.id))) {
			championIcon.classList.add('used');
			championIcon.style.filter = 'grayscale(100%)';
            //remove event listener
            championIcon.removeEventListener('click', () => {});
		} else {
			championIcon.addEventListener('click', () => {
				const currSlot = getCurrSlot();
				if (currSlot === "done") {
					return;
				}
				if (currSlot[0] != side) {
					return;
				}
				if (currSlot[1] === 'B') { //ban
					let banSlot = document.querySelector(`#blue-bans .ban-slot:nth-child(${currSlot[2]})`);
					if (currSlot[0] === 'R') { //red side ban
						banSlot = document.querySelector(`#red-bans .ban-slot:nth-child(${6-currSlot[2]})`);
					}
					const banImage = banSlot.querySelector('img');
					banImage.src = preloadedIcons[champion.id].src;
				} else { //pick
					let pickSlot = document.querySelector(`#blue-picks .pick-slot:nth-child(${currSlot[2]})`);
					if (currSlot[0] === 'R') { //red side ban
						pickSlot = document.querySelector(`#red-picks .pick-slot:nth-child(${currSlot[2]})`);
					}
					const pickImage = pickSlot.querySelector('img');
					pickImage.src = preloadedImages[champion.id].src;
                    addChampionNameText(pickSlot, champion.id);
				}
                if (selectedChampion) {
                    selectedChampion.classList.remove('selected');
                }
                  // Add the 'selected' class to the clicked champion
                championIcon.classList.add('selected');
				selectedChampion = championIcon;
                socket.emit('hover', {draftId, side: side, champion: champion.id});
				confirmButton.disabled = false;
			});
		}
		championGrid.appendChild(championIcon);
	});
}

function filterChampions() { //filter champions based on search and role
	const searchTerm = searchInput.value.toLowerCase();
	const filteredChampions = Object.values(champions).filter(champion => {
		const matchesRole = selectedRole === '' || champion.roles.includes(selectedRole.toUpperCase());
		const matchesSearch = champion.id.toLowerCase().includes(searchTerm);
		return matchesRole && matchesSearch;
	});
	displayChampions(filteredChampions);
}

roleIcons.forEach(icon => {
	icon.addEventListener('click', () => {
		const role = icon.getAttribute('data-role');
		if (selectedRole === role) {
			selectedRole = '';
			icon.classList.remove('active');
		} else {
			selectedRole = role;
			roleIcons.forEach(icon => icon.classList.remove('active'));
			icon.classList.add('active');
		}
		filterChampions();
	});
});


searchInput.addEventListener('input', filterChampions);

confirmButton.addEventListener('click', () => { //lock in/ready button
    if(viewingPreviousDraft){
        return;
    }
	if (currPick === 0) {
		if (side === 'S') {
			return
		}
		if (side === 'B') {
			blueReady = true;
			confirmButton.textContent = 'Waiting for Red...';
			confirmButton.disabled = true;
			socket.emit('playerReady', {
				draftId,
				side: 'blue'
			});
		} else if (side === 'R') {
			redReady = true;
			confirmButton.textContent = 'Waiting for Blue...';
			confirmButton.disabled = true;
			socket.emit('playerReady', {
				draftId,
				side: 'red'
			});
		}
	} else {
		lockChamp();
	}
});

const tempElement = document.createElement('div');
document.body.appendChild(tempElement); // Append temporarily to get computed styles
function fetchOutlineTempElement(className) { //Returns the CSS outline string from a CSS className in draft.css
	//Dynamically fetching the CSS style for the hover and selection borders from draft.css
	//by instantiating a dummy div, assigning it a CSS style, then grabbing the border data as a 
	//string for use in colorBorder()
	tempElement.classList.value = ""; //clear all currently attached classes
	tempElement.classList.add(className);
	return getComputedStyle(tempElement).outline;
}

function colorBorder() { //shows who is picking currently
	document.body.appendChild(tempElement);
	let headerSelectOutline = fetchOutlineTempElement('header-select-outline');
	let headerDefaultOutline = fetchOutlineTempElement('header-default-outline');
	let pickChampOutline = fetchOutlineTempElement('pick-champ-outline');
	document.body.removeChild(tempElement);

    if(viewingPreviousDraft){
        return;
    }
    let currSlot = getCurrSlot();
    if (currSlot === "done") {
        return;
    }
    // Reset the border for all side headers and slots
    document.querySelectorAll('.side-header').forEach(header => {
        header.style.border = headerDefaultOutline;
    });
    document.querySelectorAll('.pick-slot, .ban-slot').forEach(slot => {
        slot.style.outline = 'none'; // Reset the border of all slots
    });

    if(currPick == 0){ // color border based on side
        if (side === 'B') {
            document.querySelector('#blue-side-header').style.border = headerSelectOutline;
            document.querySelector('#red-side-header').style.border = headerDefaultOutline;
        } else if (side === 'R') {
            document.querySelector('#red-side-header').style.border = headerSelectOutline;
            document.querySelector('#blue-side-header').style.border = headerDefaultOutline;
        }
        return;
    }
    // Apply a golden border to the current side's header
    if (currSlot[0] === 'B') {
        document.querySelector('#blue-side-header').style.border = headerSelectOutline;
        document.querySelector('#red-side-header').style.border = headerDefaultOutline;
    } else {
        document.querySelector('#red-side-header').style.border = headerSelectOutline;
        document.querySelector('#blue-side-header').style.border = headerDefaultOutline;
    }

    // Highlight the current pick/ban slot
    let pickOrBanSlot = null;
    if (currSlot[1] === 'B') { //ban
        pickOrBanSlot = document.querySelector(`#blue-bans .ban-slot:nth-child(${currSlot[2]})`);
        if (currSlot[0] === 'R') { //red side ban
            pickOrBanSlot = document.querySelector(`#red-bans .ban-slot:nth-child(${6-currSlot[2]})`);
        }
    } else { //pick
        pickOrBanSlot = document.querySelector(`#blue-picks .pick-slot:nth-child(${currSlot[2]})`);
        if (currSlot[0] === 'R') { //red side ban
            pickOrBanSlot = document.querySelector(`#red-picks .pick-slot:nth-child(${currSlot[2]})`);
        }
    }
    if (pickOrBanSlot) {
        pickOrBanSlot.style.outline = pickChampOutline; // Golden outline for the current pick or ban slot
    }
}


function displayTimer(show) {
    const timerContainer = document.querySelector('.timer-container');
    if (timerContainer) {
        timerContainer.style.display = show ? 'block' : 'none';
    }
}


function updateFearlessBanSlots() { //controls fearless bans
	const blueFearlessBanSlots = document.querySelectorAll('#blue-fearless-bans .fearless-ban-slot');
	const redFearlessBanSlots = document.querySelectorAll('#red-fearless-bans .fearless-ban-slot');
	const blueFearlessBansDiv = document.querySelector('#blue-fearless-bans');
	const redFearlessBansDiv = document.querySelector('#red-fearless-bans');

	switch (matchNumber) {
		case 1:
			fearlessBansPerSide = 0;
			break;
		case 2:
			fearlessBansPerSide = 5;
			break;
		case 3:
			fearlessBansPerSide = 10;
			break;
		case 4:
			fearlessBansPerSide = 15;
			break;
		case 5:
			fearlessBansPerSide = 20;
			break;
		default:
			fearlessBansPerSide = 0;
			break;
	}
	blueFearlessBanSlots.forEach((slot, index) => {
		slot.style.display = index < fearlessBansPerSide ? 'flex' : 'none';
	});

	redFearlessBanSlots.forEach((slot, index) => {
		slot.style.display = index < fearlessBansPerSide ? 'flex' : 'none';
	});
	// blueFearlessBansDiv.style.marginLeft = '0px';
	// redFearlessBansDiv.style.marginRight = `-4px`;
}

function lockChamp() { //lock in champ
    if(isLocking){
        return;
    }
    isLocking = true;
	const currSlot = getCurrSlot();
	if (currSlot[0] != side) {
        isLocking = false;
		return;
	}
	if (selectedChampion) {
		const championName = selectedChampion.alt;
		confirmButton.disabled = true;
		usedChamps.add(championName);
		socket.emit('pickSelection', {
            draftId,
			pick: championName
		});
        selectedChampion = null;
	} else {
		socket.emit('pickSelection', {
			draftId,
			pick: "none"
		});
        confirmButton.disabled = true;
	}
    searchInput.value = '';
    selectedRole = '';
    roleIcons.forEach(icon => icon.classList.remove('active'));
    filterChampions();
	if (currPick <= 19) {
		colorBorder();
		startTimer();
	} else {
		confirmButton.textContent = 'Ready Next Game';
		confirmButton.disabled = false
		currPick = 0
		endDraft();
	}
    setTimeout(() => {
        isLocking = false;
    }, 100);
}

function startDraft() {
	currPick = 1;
	document.querySelectorAll('.ban-slot img').forEach(img => img.src = '/img/placeholder.png');
	document.querySelectorAll('.pick-slot img').forEach(img => img.src = '/img/placeholder.png');
    document.querySelectorAll('.champion-name').forEach(label => label.textContent = '');
	confirmButton.textContent = 'Lock In';
	switchSidesButton.style.display = 'none';
    finishSeriesButton.style.display = 'none';
	displayChampions(champions);
	colorBorder();
	startTimer();
}

function fearlessBan(champions) {
	let fearlessBanSlot = 0
	blueCounter = 1;
	redCounter = 1;
	champions.forEach((pick, index) => {
        if(pick == 'placeholder'){ //TODO remove this later, currently here for backward compatibility
            pick = 'none'
        }
		fearlessBanSlot = (index + 1) % 10;
		let banSlot = null;
		let banImage = null;
		switch (fearlessBanSlot) {
			case 1:
			case 4:
			case 5:
			case 8:
			case 9:
				banSlot = document.querySelector(`#blue-fearless-bans .fearless-ban-slot:nth-child(${blueCounter})`);
				banImage = banSlot.querySelector('img');
				banImage.src = preloadedIcons[pick].src;
				blueCounter++;
				break;
			case 2:
			case 3:
			case 6:
			case 7:
			case 0:
				banSlot = document.querySelector(`#red-fearless-bans .fearless-ban-slot:nth-child(${redCounter})`);
				banImage = banSlot.querySelector('img');
				banImage.src = preloadedIcons[pick].src;
				redCounter++;
				break;
			default:
				break;
		}
	});
}

function hover(pick){
    const slot = getCurrSlot(currPick);
    if (slot[1] === 'B') {
        const banSlot = document.querySelector(`#${slot[0] === 'B' ? 'blue' : 'red'}-bans .ban-slot:nth-child(${slot[0] === 'B' ? slot[2] : 6-slot[2]})`);
        const banImage = banSlot.querySelector('img');
        banImage.src = preloadedIcons[pick].src;
    } else {
        const pickSlot = document.querySelector(`#${slot[0] === 'B' ? 'blue' : 'red'}-picks .pick-slot:nth-child(${slot[2]})`);
        const pickImage = pickSlot.querySelector('img');
        pickImage.src = preloadedImages[pick].src;
        addChampionNameText(pickSlot, pick);
    }
}

function addChampionNameText(pickSlot, pick){
    const championName = pickSlot.querySelector('.champion-name');
    championName.textContent = pick;
}

function newPick(picks) {
	picks.forEach((pick, index) => {
        if(pick == 'placeholder'){ //TODO remove this later, currently here for backward compatibility
            pick = 'none'
        }
        if(pick == 'MonkeyKing'){
            pick = 'Wukong'; //LOL!
        }
		currPick = index + 1;
		const slot = getCurrSlot(currPick);
		if (slot[1] === 'B') {
			const banSlot = document.querySelector(`#${slot[0] === 'B' ? 'blue' : 'red'}-bans .ban-slot:nth-child(${slot[0] === 'B' ? slot[2] : 6-slot[2]})`);
			const banImage = banSlot.querySelector('img');
			banImage.src = preloadedIcons[pick].src;
		} else {
			const pickSlot = document.querySelector(`#${slot[0] === 'B' ? 'blue' : 'red'}-picks .pick-slot:nth-child(${slot[2]})`);
			const pickImage = pickSlot.querySelector('img');
			pickImage.src = preloadedImages[pick].src;
            //text that shows champion name
            addChampionNameText(pickSlot, pick);
		}
		usedChamps.add(pick);
		currPick++;
	});
	if (draftStarted && picks.length == 0) {
		currPick = 1;
	}
	colorBorder();
	filterChampions();
}

function updateSide(sideSwapped, blueName, redName, initialLoad = false) {
	if (sideSelect === 'blue') {
		side = 'B'
	} else if (sideSelect === 'red') {
		side = 'R'
	} else {
		side = 'S'
	}
	document.getElementById('blue-team-name').textContent = blueName;
	document.getElementById('red-team-name').textContent = redName;
	if (!sideSwapped) {
		if (!initialLoad)
            if(side !== 'S'){
                if(side === 'B')
                    alert('You are now on Blue Side');
                else if(side === 'R')
                    alert('You are now on Red Side');
            } else
                alert(`Sides Swapped`);
		return
	}
	if (side === 'B') {
		side = 'R';
		if (!initialLoad)
			alert('You are now on Red Side');
	} else if (side === 'R') {
		side = 'B';
		if (!initialLoad)
			alert('You are now on Blue Side');
	}
	document.getElementById('blue-team-name').textContent = blueName;
	document.getElementById('red-team-name').textContent = redName;
}


function endDraft() {
	socket.emit("endDraft", draftId);
}

socket.on('startDraft', (data) => { //starts draft
	picks = data.picks;
	draftStarted = data.started;
	blueReady = data.blueReady;
	redReady = data.redReady;
	fearlessChamps = new Set(data.fearlessBans);
	matchNumber = data.matchNumber;
	usedChamps = new Set();
	updateFearlessBanSlots();
    displayTimer(data.timerEnabled);
	fearlessBan(data.fearlessBans);
	startDraft();
});

socket.on('timerUpdate', (data) => { //updates timer
	const { timeLeft } = data;
	const timerElement = document.getElementById('timer');
	timerElement.textContent = timeLeft >= 0 ? timeLeft : 0;
});

socket.on('draftState', (data) => { //updates screen when page loaded with draft state
	if (data.finished) {
        viewingPreviousDraft = true;
		socket.emit('showDraft', draftId, 1)
		return;
	}
	blueReady = data.blueReady;
	redReady = data.redReady;
	draftStarted = data.started;
	picks = data.picks;
	fearlessChamps = new Set(data.fearlessBans);
	matchNumber = data.matchNumber;
	sideSwapped = data.sideSwapped;
    displayTimer(data.timerEnabled);
	updateSide(sideSwapped, data.blueTeamName, data.redTeamName, true);
	updateFearlessBanSlots();
	fearlessBan(data.fearlessBans);
	newPick(picks);
	if (picks.length === 20) {
		currPick = 0;
		if (side !== 'S') {
			switchSidesButton.style.display = 'block';
			switchSidesButton.onclick = function() {
				socket.emit('switchSides', draftId);
			};
            finishSeriesButton.style.display = 'block';
			finishSeriesButton.onclick = function() {
				viewingPreviousDraft = true;
                socket.emit('endSeries', draftId)
                finishSeriesButton.style.display = 'none';
                switchSidesButton.style.display = 'none';
			};
		}
	}
	if (blueReady && redReady) {
		confirmButton.textContent = 'Lock In';
		confirmButton.disabled = true;
	} else {
		if (blueReady && side === 'B') {
			confirmButton.textContent = 'Waiting for Red...';
			confirmButton.disabled = true;
		} else if (redReady && side === 'R') {
			confirmButton.textContent = 'Waiting for Blue...';
			confirmButton.disabled = true;
		}
	}
	if (side === 'S') {
		confirmButton.style.display = 'none';
		switchSidesButton.style.display = 'none';
        finishSeriesButton.style.display = 'none';
	}
});

socket.on('lockChamp', () => { //locks in champ
	lockChamp();
});

socket.on('hover', (champion) => { //hovering over champ
    hover(champion);
});

socket.on('pickUpdate', (picks) => { //new pick was locked
	newPick(picks);
});

socket.on('showNextGameButton', (data) => { //draft ended
	if (data.finished) {
        viewingPreviousDraft = true;
		confirmButton.textContent = 'View Previous Games';
		confirmButton.style.display = 'block';
		confirmButton.disabled = false;
		confirmButton.onclick = function() {
			location.reload();
		};
        switchSidesButton.style.display = 'none';
        finishSeriesButton.style.display = 'none';
		return;
	}
	currPick = 0;
	confirmButton.textContent = 'Ready Next Game';
	confirmButton.disabled = false;
	if (side !== 'S') {
		switchSidesButton.style.display = 'block';
		switchSidesButton.onclick = function() {
			socket.emit('switchSides', draftId);
		};
        finishSeriesButton.style.display = 'block';
        finishSeriesButton.onclick = function() {
            viewingPreviousDraft = true;
            socket.emit('endSeries', draftId)
            finishSeriesButton.style.display = 'none';
            switchSidesButton.style.display = 'none';
        };
	}
	blueReady = data.blueReady;
	redReady = data.redReady;
	draftStarted = data.started;
});

socket.on('switchSidesResponse', (data) => { //sides swapped
	blueReady = data.blueReady;
	redReady = data.redReady;
	confirmButton.textContent = 'Ready Next Game';
	confirmButton.disabled = false;
	updateSide(data.sideSwapped, data.blueTeamName, data.redTeamName);
});

socket.on('draftNotAvailable', () => {
    alert('Draft not available please make a new one.');
    window.location.href = '/';
});

socket.on('showDraftResponse', (data) => {
	if (!data) {
		alert("No more games to show!")
		matchNumber--;
		return;
	}
	picks = data.picks
	fearlessBans = data.fearlessBans
	matchNumber = data.matchNumber
	blueTeamName = data.blueTeamName
	redTeamName = data.redTeamName
	document.getElementById('blue-team-name').textContent = blueTeamName;
	document.getElementById('red-team-name').textContent = redTeamName;
	draftStarted = false;
	updateFearlessBanSlots();
	fearlessBan(data.fearlessBans);
	newPick(picks);
	confirmButton.style.display = 'block';
	confirmButton.textContent = 'Show Next Game';
	confirmButton.disabled = false;
	confirmButton.onclick = function() {
		matchNumber++;
		socket.emit('showDraft', draftId, matchNumber);
	}
});

document.addEventListener('DOMContentLoaded', async () => {
	await loadChamps();
	preloadChampionImages();
	displayChampions(champions);
	socket.emit('joinDraft', draftId);
	socket.emit('getData', draftId);
	if (side === 'S') {
		confirmButton.style.display = 'none';
		switchSidesButton.style.display = 'none';
	}
});
