const socket = io();
const patch = '14.17.1'
const baseUrl = `http://ddragon.leagueoflegends.com/cdn/${patch}`
let champions = null;
let currPick = 1;
let matchNumber = 3;
const preloadedImages = {};
const preloadedIcons = {};
let usedChamps = new Set();

function getCurrSlot(){
    if(currPick <= 6){
        return currPick % 2 === 1 ? `BB${Math.ceil(currPick/2)}` : `RB${Math.ceil(currPick/2)}`;
    } else if(currPick <= 12){
        switch(currPick){
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
    } else if(currPick <= 16){
        return currPick % 2 === 0 ? `BB${Math.ceil(currPick/2)-3}` : `RB${Math.ceil(currPick/2)-3}`;
    } else if(currPick <= 20) {
        switch(currPick){
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

function preloadChampionImages() {
    Object.keys(champions).forEach(championKey => {
        const champion = champions[championKey];
        const championImage = new Image();
        const championIcon = new Image();
        if(champion.id === 'Fiddlesticks') { //LOL!
            championImage.src = `https://ddragon.leagueoflegends.com/cdn/img/champion/centered/FiddleSticks_0.jpg`;
            championIcon.src = `${baseUrl}/img/champion/Fiddlesticks.png`;
        } else {
            championImage.src = `https://ddragon.leagueoflegends.com/cdn/img/champion/centered/${champion.id}_0.jpg`;
            championIcon.src = `${baseUrl}/img/champion/${champion.id}.png`;
        }
        preloadedImages[champion.id] = championImage;
        preloadedIcons[champion.id] = championIcon;
    });
    updateFearlessBanSlots();
}

fetch(`${baseUrl}/data/en_US/champion.json`)
	.then(response => response.json())
	.then(data => {
		champions = data.data;
        champions = Object.entries(champions).map(([key, value]) => ({
            id: value.id,
            key: value.key,
        }));
        preloadChampionImages();
		return fetch('/proxy/championrates');
	})
	.then(response => response.json())
	.then(data => {
		roleData = data;
		mergeRoleData(roleData.data);
		displayChampions(champions);
	})
	.catch(error => {
		console.error('Error fetching data:', error);
	});

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
        if(usedChamps.has(champion.id)){
            championIcon.classList.add('used');
            //grey out the icon
            championIcon.style.filter = 'grayscale(100%)';
        } else {
            championIcon.addEventListener('click', () => {
                const currSlot = getCurrSlot();
                if(currSlot === "done"){
                    return;
                }
                if(currSlot[1] === 'B'){ //ban
                    let banSlot = document.querySelector(`#blue-bans .ban-slot:nth-child(${currSlot[2]})`);
                    if(currSlot[0] === 'R'){ //red side ban
                        banSlot = document.querySelector(`#red-bans .ban-slot:nth-child(${6-currSlot[2]})`);
                    }
                    const banImage = banSlot.querySelector('img');
                    banImage.src = preloadedIcons[champion.id].src;
                } else { //pick
                    let pickSlot = document.querySelector(`#blue-picks .pick-slot:nth-child(${currSlot[2]})`);
                    if(currSlot[0] === 'R'){ //red side ban
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
    if (selectedChampion) {
        const championName = selectedChampion.alt;
        selectedChampion = null;
        confirmButton.disabled = true;
        usedChamps.add(championName);
        currPick++;
        filterChampions();
    }
});


function updateFearlessBanSlots() {
    const blueFearlessBanSlots = document.querySelectorAll('#blue-fearless-bans .fearless-ban-slot');
    const redFearlessBanSlots = document.querySelectorAll('#red-fearless-bans .fearless-ban-slot');
    const blueFearlessBansDiv = document.querySelector('#blue-fearless-bans');
    const redFearlessBansDiv = document.querySelector('#red-fearless-bans');

    switch(matchNumber) {
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

socket.on('draftUpdate', (data) => {
	console.log('Draft update:', data);
});