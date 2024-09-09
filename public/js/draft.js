const socket = io();
const patch = '14.17.1'
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

function startTimer() {
    socket.emit('startTimer', {
        draftId
    });
}

function getCurrSlot() {
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

async function loadChamps() {
    return new Promise((resolve, reject) => {
        fetch(`${baseUrl}/data/en_US/champion.json`)
            .then(response => response.json())
            .then(data => {
                champions = data.data;
                champions = Object.entries(champions).map(([key, value]) => ({
                    id: value.id,
                    key: value.key,
                }));
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
}

function preloadChampionImages() {
    Object.keys(champions).forEach(championKey => {
        const champion = champions[championKey];
        const championImage = new Image();
        const championIcon = new Image();
        if (champion.id === 'Fiddlesticks') { //LOL!
            championImage.src = `https://ddragon.leagueoflegends.com/cdn/img/champion/centered/FiddleSticks_0.jpg`;
            championIcon.src = `${baseUrl}/img/champion/Fiddlesticks.png`;
        } else {
            championImage.src = `https://ddragon.leagueoflegends.com/cdn/img/champion/centered/${champion.id}_0.jpg`;
            championIcon.src = `${baseUrl}/img/champion/${champion.id}.png`;
        }
        preloadedImages[champion.id] = championImage;
        preloadedIcons[champion.id] = championIcon;
    });
}

function mergeRoleData(roleData) {
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
            champ.roles = [];
        }
    });
}

const championGrid = document.getElementById('champion-grid');
let selectedChampion = null;

function displayChampions(champions) {
    championGrid.innerHTML = '';
    Object.keys(champions).forEach(championKey => {
        const champion = champions[championKey];
        const championIcon = document.createElement('img');
        championIcon.src = preloadedIcons[champion.id].src;
        championIcon.alt = champion.id;
        championIcon.classList.add('champion-icon');
        if (usedChamps.has(champion.id) || fearlessChamps.has(champion.id)) {
            championIcon.classList.add('used');
            championIcon.style.filter = 'grayscale(100%)';
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
                }
                selectedChampion = championIcon;
                confirmButton.disabled = false;
            });
        }
        championGrid.appendChild(championIcon);
    });
}

function filterChampions() {
    const searchTerm = searchInput.value.toLowerCase();
    const filteredChampions = Object.values(champions).filter(champion => {
        const matchesRole = selectedRole === '' || champion.roles.includes(selectedRole.toUpperCase());
        const matchesSearch = champion.id.toLowerCase().includes(searchTerm);
        return matchesRole && matchesSearch;
    });

    displayChampions(filteredChampions);
}

const roleIcons = document.querySelectorAll('.role-icon');
let selectedRole = '';
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

const searchInput = document.getElementById('searchInput');
searchInput.addEventListener('input', filterChampions);

const confirmButton = document.getElementById('confirmButton');
confirmButton.addEventListener('click', () => {
    if (currPick === 0) {
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

function colorBorder() {
    let currSlot = getCurrSlot();
    if (currSlot === "done") {
        return;
    }
    if (currSlot[0] === 'B') { //make border of blue-side-header gold
        document.querySelector('#blue-side-header').style.border = '2px solid rgb(236, 209, 59)';
        document.querySelector('#red-side-header').style.border = '2px solid black';
    } else {
        document.querySelector('#red-side-header').style.border = '2px solid rgb(236, 209, 59)';
        document.querySelector('#blue-side-header').style.border = '2px solid black';
    }
}


function updateFearlessBanSlots() {
    const blueFearlessBanSlots = document.querySelectorAll('#blue-fearless-bans .fearless-ban-slot');
    const redFearlessBanSlots = document.querySelectorAll('#red-fearless-bans .fearless-ban-slot');
    const blueFearlessBansDiv = document.querySelector('#blue-fearless-bans');
    const redFearlessBansDiv = document.querySelector('#red-fearless-bans');

    switch (matchNumber) {
        case 1:
            fearlessBansPerSide = 0;
            leftMargin = 0;
            rightMargin = 0;
            break;
        case 2:
            fearlessBansPerSide = 5;
            leftMargin = -90;
            rightMargin = -96;
            break;
        case 3:
            fearlessBansPerSide = 10;
            leftMargin = 60;
            rightMargin = 54;
            break;
        case 4:
            fearlessBansPerSide = 15;
            leftMargin = 210;
            rightMargin = 204;
            break;
        case 5:
            fearlessBansPerSide = 0;
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
    blueFearlessBansDiv.style.marginLeft = `${leftMargin}px`;
    redFearlessBansDiv.style.marginRight = `${rightMargin}px`;
}

function lockChamp() {
    const currSlot = getCurrSlot();
    if (currSlot[0] != side) {
        return;
    }
    if (selectedChampion) {
        const championName = selectedChampion.alt;
        selectedChampion = null;
        confirmButton.disabled = true;
        usedChamps.add(championName);
        socket.emit('pickSelection', {
            draftId,
            pick: championName
        });
    } else {
        socket.emit('pickSelection', {
            draftId,
            pick: "placeholder"
        });
    }
    currPick++;
    if (currPick <= 20) {
        colorBorder();
        filterChampions();
        startTimer();
    } else {
        confirmButton.textContent = 'Ready Next Game';
        confirmButton.disabled = false
        currPick = 0
        endDraft();
    }
}

function startDraft() {
    currPick = 1;
    document.querySelectorAll('.ban-slot img').forEach(img => img.src = '/img/placeholder.png');
    document.querySelectorAll('.pick-slot img').forEach(img => img.src = '/img/placeholder.png');
    confirmButton.textContent = 'Lock In';
    confirmButton.disabled = false;
    filterChampions();
    colorBorder();
    startTimer();
}

function fearlessBan(champions) {
    let fearlessBanSlot = 0
    blueCounter = 1;
    redCounter = 1;
    champions.forEach((pick, index) => {
        if (pick == 'placeholder') {
            fearlessBanSlot++;
            return;
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

function newPick(picks) {
    picks.forEach((pick, index) => {
        if (pick == 'placeholder') {
            currPick++;
            colorBorder();
            return; //TODO: is this ok
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
        }
        usedChamps.add(pick);
        currPick++;
    });
    colorBorder();
    displayChampions(champions);
}

function endDraft() {
    socket.emit("endDraft", draftId);
}

socket.on('playerReady', (data) => {
    blueReady = data.blueReady;
    redReady = data.redReady;
    draftStarted = data.started;
    if (!draftStarted && blueReady && redReady) {
        startDraft();
    }
});

socket.on('draftEnded', (data) => {
    currPick = 0;
    fearlessChamps = new Set(data.fearlessBans);
    blueReady = data.blueReady;
    redReady = data.redReady;
    draftStarted = data.started;
    matchNumber = data.matchNumber;
    picks = data.picks;
    usedChamps = new Set();
    confirmButton.textContent = 'Ready Next Game';
    confirmButton.disabled = false;
    updateFearlessBanSlots();
    fearlessBan(data.fearlessBans);
});

socket.on('draftState', (data) => {
    blueReady = data.blueReady;
    redReady = data.redReady;
    draftStarted = data.started;
    picks = data.picks;
    fearlessChamps = new Set(data.fearlessBans);
    matchNumber = data.matchNumber;
    if (draftStarted) {
        newPick(picks);
        updateFearlessBanSlots();
        fearlessBan(data.fearlessBans);
        return;
    }
    if (blueReady && redReady) {
        //this never happens i ithkn maybe delete
        alert("AHHHHHH")
        startDraft();
    } else if (blueReady && side === 'B') {
        confirmButton.textContent = 'Waiting for Red...';
        confirmButton.disabled = true;
    } else if (redReady && side === 'R') {
        confirmButton.textContent = 'Waiting for Blue...';
        confirmButton.disabled = true;
    }
});

socket.on('timerUpdate', (data) => {
    const {
        timeLeft
    } = data;
    const timerElement = document.getElementById('timer');
    timerElement.textContent = timeLeft >= 0 ? timeLeft : 0;
});

socket.on('lockChamp', () => {
    lockChamp();
});

socket.on('pickUpdate', (picks) => {
    newPick(picks);
});

document.addEventListener('DOMContentLoaded', async () => {
    await loadChamps();
    preloadChampionImages();
    filterChampions();
    socket.emit('joinDraft', draftId);
    socket.emit('getData', draftId);
    updateFearlessBanSlots();
    if (sideSelect === 'blue') {
        side = 'B'
    } else if (sideSelect === 'red') {
        side = 'R'
    } else if (sideSelect === 'spectator') {
        side = 'S'
    }
});