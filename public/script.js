const socket = io();
const patch = '14.17.1'
const baseUrl = `http://ddragon.leagueoflegends.com/cdn/${patch}`
let champions = null;

fetch(`${baseUrl}/data/en_US/champion.json`)
    .then(response => response.json())
    .then(data => {
        champions = data.data
        displayChampions(champions);
    })
    .catch(error => {
        console.error('Error fetching champion data:', error);
});

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
            if (selectedChampion) {
                selectedChampion.classList.remove('selected');
            }
            selectedChampion = championIcon;
            selectedChampion.classList.add('selected');
            confirmButton.disabled = false;
        });
        championGrid.appendChild(championIcon);
    });
}




function filterChampions() {
    const searchTerm = searchInput.value.toLowerCase();
    const filteredChampions = Object.values(champions).filter(champion => {
        const matchesRole = selectedRole === '' || champion.roles[0] == selectedRole;
        const matchesSearch = champion.name.toLowerCase().includes(searchTerm);
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
        const champion = champions.find(champ => champ.name === championName);
        handleDraftSelection(champion);
        selectedChampion.classList.remove('selected');
        selectedChampion = null;
        confirmButton.disabled = true;
    }
});

function handleDraftSelection(champion) {
    socket.emit('draftSelection', champion);
}


socket.on('draftUpdate', (data) => {
    console.log('Draft update:', data);
});