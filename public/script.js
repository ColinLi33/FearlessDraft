const socket = io();
const patch = '14.17.1'
const baseUrl = `http://ddragon.leagueoflegends.com/cdn/${patch}`
let champions = null;
let currentPick = 1;
let matchNumber = 3;
const preloadedImages = {};

function preloadChampionImages() {
    Object.keys(champions).forEach(championKey => {
        const champion = champions[championKey];
        const championImage = new Image();
        if(champion.id === 'Fiddlesticks') { //LOL!
            championImage.src = `https://ddragon.leagueoflegends.com/cdn/img/champion/centered/FiddleSticks_0.jpg`;
        } else {
            championImage.src = `https://ddragon.leagueoflegends.com/cdn/img/champion/centered/${champion.id}_0.jpg`;
        }
        preloadedImages[champion.id] = championImage;
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
		championIcon.src = `${baseUrl}/img/champion/${champion.id}.png`;
		championIcon.alt = champion.id;
		championIcon.classList.add('champion-icon');
		championIcon.addEventListener('click', () => {
            const pickSlot = document.querySelector(`#blue-picks .pick-slot:nth-child(${currentPick})`);
            const pickImage = pickSlot.querySelector('img');
			if (selectedChampion === championIcon) {
                pickImage.src = '/img/placeholder.png';
                selectedChampion = null;
                confirmButton.disabled = true;
			} else {
                pickImage.src = preloadedImages[champion.id].src;
                selectedChampion = championIcon;
                confirmButton.disabled = false;
            }
		});
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
        const champion = Object.values(champions).find(champ => champ.id === championName);
        handleDraftSelection(champion);
		selectedChampion.classList.remove('selected');
		selectedChampion = null;
		confirmButton.disabled = true;
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

function handleDraftSelection(champion) {
	socket.emit('draftSelection', champion);
    const pickSlot = document.querySelector(`#blue-picks .pick-slot:nth-child(${currentPick})`);
    const championImage = document.createElement('img');
    championImage.src = `https://ddragon.leagueoflegends.com/cdn/img/champion/centered/${champion.id}_0.jpg`;
    pickSlot.innerHTML = '';
    pickSlot.appendChild(championImage);
    currentPick++;
}


socket.on('draftUpdate', (data) => {
	console.log('Draft update:', data);
});