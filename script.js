import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import {
  getFirestore,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  getDocs,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

// Ranking global: Firebase Firestore
const firebaseConfig = {
  apiKey: 'AIzaSyCKX6PE34ABjR67l78blEds5Qnoirm3VoY',
  authDomain: 'corefall-clickadventure.firebaseapp.com',
  projectId: 'corefall-clickadventure',
  storageBucket: 'corefall-clickadventure.firebasestorage.app',
  messagingSenderId: '382922451325',
  appId: '1:382922451325:web:4e9e8efe719aefcf348414',
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const homeScreen = document.getElementById('home-screen');
const gameScreen = document.getElementById('game-screen');
const nameModal = document.getElementById('name-modal');
const rankingModal = document.getElementById('ranking-modal');
const nameInput = document.getElementById('name-input');
const playerNameDisplay = document.getElementById('player-name-display');

// Modo dev: só ativa com ?dev=1 na URL, esconde os controles de desenvolvedor dos jogadores comuns
if (new URLSearchParams(window.location.search).get('dev') === '1') {
  document.body.classList.add('dev-mode');
}

// Flores espalhadas aleatoriamente, sempre do mesmo tamanho, bem separadas (grid + jitter)
const FLOWER_GRID_COLS = 6;
const FLOWER_GRID_ROWS = 5;
const FLOWER_COUNT = 14;
const flowersLayer = document.getElementById('flowers-layer');

const flowerCells = [];
for (let row = 0; row < FLOWER_GRID_ROWS; row++) {
  for (let col = 0; col < FLOWER_GRID_COLS; col++) {
    flowerCells.push({ col, row });
  }
}
for (let i = flowerCells.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [flowerCells[i], flowerCells[j]] = [flowerCells[j], flowerCells[i]];
}

const cellWidthPct = 100 / FLOWER_GRID_COLS;
const cellHeightPct = 100 / FLOWER_GRID_ROWS;

flowerCells.slice(0, FLOWER_COUNT).forEach(({ col, row }) => {
  const flower = document.createElement('div');
  flower.className = 'flower-sprite';
  const jitterX = 20 + Math.random() * 60;
  const jitterY = 20 + Math.random() * 60;
  flower.style.left = `${col * cellWidthPct + (jitterX / 100) * cellWidthPct}%`;
  flower.style.top = `${row * cellHeightPct + (jitterY / 100) * cellHeightPct}%`;
  if (Math.random() < 0.5) {
    flower.style.transform = 'scaleX(-1)';
  }
  flowersLayer.appendChild(flower);
});

document.getElementById('btn-play').addEventListener('click', () => {
  nameInput.value = '';
  nameModal.classList.remove('hidden');
  nameInput.focus();
});

document.getElementById('btn-cancel-name').addEventListener('click', () => {
  nameModal.classList.add('hidden');
});

let playerName = localStorage.getItem('dc_playerName') || '';
let phaseStartTime = null;

// Perfis: ouro, inventário e estatísticas salvos por nome de jogador, neste aparelho
const DEFAULT_STATS = {
  sessionsStarted: 0,
  phasesCompleted: 0,
  totalClicks: 0,
  chestsOpened: { comum: 0, raro: 0, epico: 0 },
  totalGoldEarned: 0,
  itemsObtained: 0,
  bestTime: null,
};

function generateItemId() {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

let gold = 0;
let inventory = [];
let equippedId = null;
let stats = Object.assign({}, DEFAULT_STATS, { chestsOpened: Object.assign({}, DEFAULT_STATS.chestsOpened) });

function profileKey(name) {
  return `dc_profile_${name.trim().toLowerCase()}`;
}

function saveProfile() {
  if (!playerName) return;
  localStorage.setItem(profileKey(playerName), JSON.stringify({ gold, inventory, equippedId, stats }));
}

function loadProfile(name) {
  const saved = JSON.parse(localStorage.getItem(profileKey(name)) || 'null');

  if (saved) {
    gold = saved.gold || 0;
    inventory = saved.inventory || [];
    equippedId = saved.equippedId || null;
    stats = Object.assign({}, DEFAULT_STATS, saved.stats);
    stats.chestsOpened = Object.assign({}, DEFAULT_STATS.chestsOpened, stats.chestsOpened);
    return;
  }

  // Migração única: progresso salvo antes de existirem perfis vira o primeiro perfil deste nome
  if (!localStorage.getItem('dc_migrated') && localStorage.getItem('dc_gold') !== null) {
    gold = parseInt(localStorage.getItem('dc_gold'), 10) || 0;
    inventory = JSON.parse(localStorage.getItem('dc_inventory') || '[]');
    if (inventory.length && typeof inventory[0] === 'string') {
      inventory = inventory.map((itemName) => ({ id: generateItemId(), name: itemName }));
    }
    equippedId = localStorage.getItem('dc_equipped') || null;
    stats = Object.assign({}, DEFAULT_STATS, JSON.parse(localStorage.getItem('dc_stats') || '{}'));
    stats.chestsOpened = Object.assign({}, DEFAULT_STATS.chestsOpened, stats.chestsOpened);
    localStorage.setItem('dc_migrated', '1');
    saveProfile();
    return;
  }

  gold = 0;
  inventory = [];
  equippedId = null;
  stats = Object.assign({}, DEFAULT_STATS, { chestsOpened: Object.assign({}, DEFAULT_STATS.chestsOpened) });
}

if (playerName) {
  loadProfile(playerName);
}

const statsList = document.getElementById('stats-list');

function renderStats() {
  const rows = [
    ['Jogadas iniciadas', stats.sessionsStarted],
    ['Fases completadas', stats.phasesCompleted],
    ['Cliques totais', stats.totalClicks],
    ['Baús comuns abertos', stats.chestsOpened.comum],
    ['Baús raros abertos', stats.chestsOpened.raro],
    ['Baús épicos abertos', stats.chestsOpened.epico],
    ['Itens obtidos', stats.itemsObtained],
    ['Ouro total ganho', stats.totalGoldEarned],
    ['Ouro atual', gold],
    ['Meu melhor tempo', stats.bestTime ? formatTime(stats.bestTime) : '—'],
  ];

  statsList.innerHTML = '';
  rows.forEach(([label, value]) => {
    const row = document.createElement('div');
    row.className = 'stats-row';
    row.innerHTML = `<span>${label}</span><span>${value}</span>`;
    statsList.appendChild(row);
  });
}

document.getElementById('btn-stats').addEventListener('click', () => {
  renderStats();
  document.getElementById('stats-modal').classList.remove('hidden');
});

document.getElementById('btn-close-stats').addEventListener('click', () => {
  document.getElementById('stats-modal').classList.add('hidden');
});

document.getElementById('btn-confirm-name').addEventListener('click', () => {
  const name = nameInput.value.trim() || 'Aventureiro';
  playerName = name;
  localStorage.setItem('dc_playerName', name);
  playerNameDisplay.textContent = name;
  loadProfile(name);
  updateGoldDisplay();

  nameModal.classList.add('hidden');
  homeScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  document.body.classList.add('phase-active');
  phaseStartTime = Date.now();

  stats.sessionsStarted++;
  saveProfile();
});

const rankingList = document.getElementById('ranking-list');

function formatTime(ms) {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(1);
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

async function recordRankingEntry() {
  if (!phaseStartTime) return null;
  const elapsedMs = Date.now() - phaseStartTime;
  phaseStartTime = null;

  try {
    await addDoc(collection(db, 'rankings'), {
      name: playerName || 'Aventureiro',
      time: elapsedMs,
      createdAt: Date.now(),
    });
  } catch (err) {
    console.error('Não foi possível enviar o tempo pro ranking global:', err);
  }

  return elapsedMs;
}

async function renderRanking() {
  rankingList.innerHTML = '<p class="placeholder-text">Carregando...</p>';

  try {
    const rankingQuery = query(collection(db, 'rankings'), orderBy('time', 'asc'), limit(10));
    const snapshot = await getDocs(rankingQuery);

    if (snapshot.empty) {
      rankingList.innerHTML = '<p class="placeholder-text">Nenhum recorde ainda. Complete uma fase (10 barras) pra entrar no ranking!</p>';
      return;
    }

    rankingList.innerHTML = '';
    let position = 0;
    snapshot.forEach((doc) => {
      position++;
      const entry = doc.data();
      const row = document.createElement('div');
      row.className = 'ranking-item';
      row.innerHTML = `
        <span class="ranking-pos">${position}º</span>
        <span class="ranking-name">${entry.name}</span>
        <span class="ranking-time">${formatTime(entry.time)}</span>
      `;
      rankingList.appendChild(row);
    });
  } catch (err) {
    rankingList.innerHTML = '<p class="placeholder-text">Não foi possível carregar o ranking. Verifique sua conexão.</p>';
  }
}

document.getElementById('btn-ranking').addEventListener('click', () => {
  renderRanking();
  rankingModal.classList.remove('hidden');
});

document.getElementById('btn-close-ranking').addEventListener('click', () => {
  rankingModal.classList.add('hidden');
});

document.getElementById('btn-share').addEventListener('click', async () => {
  const shareData = {
    title: 'Corefall: A Click Adventure',
    text: 'Vem defender o Núcleo comigo em Corefall: A Click Adventure!',
    url: window.location.href,
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
    } catch (err) {
      // usuário cancelou o compartilhamento
    }
  } else {
    alert('Compartilhamento não suportado neste navegador.');
  }
});

// Núcleo: cliques e barra de progresso
const CLICKS_PER_BAR = 20;
const TOTAL_BARS = 10;
const BAR_COLOR_STOPS = [
  [46, 204, 113],   // verde    #2ecc71
  [241, 196, 15],   // amarelo  #f1c40f
  [230, 126, 34],   // laranja  #e67e22
  [231, 76, 60],    // vermelho #e74c3c
  [142, 68, 173],   // roxo     #8e44ad
];

let completedBars = 0;
let clicksInBar = 0;

const coreBtn = document.getElementById('core-btn');
const progressFill = document.getElementById('progress-fill');
const barCounter = document.getElementById('bar-counter');

// Baús: raridade, ouro e item por barra completa
const CHEST_ITEMS = {
  comum: ['Espada de Madeira', 'Arco Curto', 'Machadinha', 'Livro de Magia', 'Maça'],
  raro: ['Espada de Ferro', 'Arco Longo', 'Machado', 'Lança', 'Espada Cromática'],
  epico: ['Espada Cromática', 'Bolsa de Aprimoramento', 'Machado Elemental', 'Arco Flamejante', 'Nunchaku (Especial)', 'Armadura de Botão'],
};
const CHEST_LABELS = { comum: 'Baú Comum', raro: 'Baú Raro', epico: 'Baú Épico' };
const SELL_VALUES = { comum: 3, raro: 8, epico: 20 };
const CHEST_SPRITES = {
  comum: { closed: "sprites/Baú1 fechado.png", open: "sprites/Baú1.png" },
  raro: { closed: "sprites/baú incomum fechado.png", open: "sprites/baú incomum.png" },
  epico: { closed: "sprites/bbaú epico fechado.png", open: "sprites/baúepico.png" },
};

// Itens: categoria, raridade e stats (dano, velocidade, alcance, tipo de ataque)
const ITEM_DB = {
  'Espada de Madeira': { category: 'Espada', rarity: 'comum', damage: 5, speed: 1.0, range: 'curto', type: 'Corte' },
  'Arco Curto': { category: 'Arco', rarity: 'comum', damage: 4, speed: 1.2, range: 'longo', type: 'Perfurante' },
  'Machadinha': { category: 'Machado', rarity: 'comum', damage: 6, speed: 0.8, range: 'curto', type: 'Corte' },
  'Livro de Magia': { category: 'Magia', rarity: 'comum', damage: 5, speed: 1.0, range: 'médio', type: 'Mágico' },
  'Maça': { category: 'Maça', rarity: 'comum', damage: 7, speed: 0.7, range: 'curto', type: 'Impacto' },

  'Espada de Ferro': { category: 'Espada', rarity: 'raro', damage: 10, speed: 1.0, range: 'curto', type: 'Corte' },
  'Arco Longo': { category: 'Arco', rarity: 'raro', damage: 9, speed: 1.1, range: 'longo', type: 'Perfurante' },
  'Machado': { category: 'Machado', rarity: 'raro', damage: 12, speed: 0.75, range: 'curto', type: 'Corte' },
  'Lança': { category: 'Lança', rarity: 'raro', damage: 10, speed: 0.9, range: 'médio', type: 'Perfurante' },
  'Espada Cromática': { category: 'Espada', rarity: 'raro', damage: 16, speed: 1.0, range: 'curto', type: 'Corte Mágico' },

  'Bolsa de Aprimoramento': { category: 'Especial', rarity: 'epico', special: true },
  'Machado Elemental': { category: 'Machado', rarity: 'epico', damage: 18, speed: 0.75, range: 'curto', type: 'Corte Elemental' },
  'Arco Flamejante': { category: 'Arco', rarity: 'epico', damage: 16, speed: 1.1, range: 'longo', type: 'Perfurante Flamejante' },
  'Nunchaku (Especial)': { category: 'Nunchaku', rarity: 'epico', damage: 14, speed: 1.4, range: 'curto', type: 'Impacto Rápido' },
  'Armadura de Botão': { category: 'Especial', rarity: 'epico', special: true },
};

const goldCounter = document.getElementById('gold-counter');
const chestModal = document.getElementById('chest-modal');
const chestTitle = document.getElementById('chest-title');
const chestBtn = document.getElementById('chest-btn');
const chestReward = document.getElementById('chest-reward');
const chestGoldText = document.getElementById('chest-gold-text');
const chestItemIcon = document.getElementById('chest-item-icon');
const chestItemText = document.getElementById('chest-item-text');
const btnCloseChest = document.getElementById('btn-close-chest');

// Ícones de item: preencher aqui quando as texturas dos equipamentos existirem
const ITEM_ICONS = {
  'Espada de Madeira': 'sprites/woodsword.png',
};
const inventoryModal = document.getElementById('inventory-modal');
const inventoryList = document.getElementById('inventory-list');
const equippedDisplay = document.getElementById('equipped-display');

let pendingChest = null;

function updateGoldDisplay() {
  goldCounter.textContent = `Ouro: ${gold}`;
}
updateGoldDisplay();

function randomInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function rollChestRarity() {
  const roll = Math.random();
  if (roll < 0.05) return 'epico';
  if (roll < 0.20) return 'raro';
  return 'comum';
}

function openChest() {
  const rarity = rollChestRarity();
  let goldReward;
  let itemChance;

  if (rarity === 'epico') {
    goldReward = randomInt(20, 40);
    itemChance = 1;
  } else if (rarity === 'raro') {
    goldReward = randomInt(10, 20);
    itemChance = 0.75;
  } else {
    goldReward = randomInt(5, 10);
    itemChance = 0.5;
  }

  let itemName = null;
  if (Math.random() < itemChance) {
    const pool = CHEST_ITEMS[rarity];
    itemName = pool[randomInt(0, pool.length - 1)];
  }

  pendingChest = { rarity, goldReward, itemName };

  chestTitle.textContent = `${CHEST_LABELS[rarity]}!`;
  chestTitle.className = `chest-${rarity}`;
  chestBtn.classList.remove('opened');
  chestBtn.style.backgroundImage = `url('${CHEST_SPRITES[rarity].closed}')`;
  chestReward.classList.add('hidden');
  btnCloseChest.classList.add('hidden');
  chestModal.classList.remove('hidden');
}

chestBtn.addEventListener('click', () => {
  if (!pendingChest) return;

  const { rarity, goldReward, itemName } = pendingChest;

  gold += goldReward;
  updateGoldDisplay();

  chestBtn.style.backgroundImage = `url('${CHEST_SPRITES[rarity].open}')`;

  if (itemName) {
    inventory.push({ id: generateItemId(), name: itemName });
    stats.itemsObtained++;
  }

  stats.chestsOpened[rarity]++;
  stats.totalGoldEarned += goldReward;
  saveProfile();

  chestBtn.classList.add('opened');
  chestGoldText.textContent = `+${goldReward} ouro`;
  chestItemText.textContent = itemName ? `Item: ${itemName}` : 'Nenhum item desta vez';

  if (itemName && ITEM_ICONS[itemName]) {
    chestItemIcon.src = ITEM_ICONS[itemName];
    chestItemIcon.classList.remove('hidden');
  } else {
    chestItemIcon.classList.add('hidden');
  }

  chestReward.classList.remove('hidden');
  btnCloseChest.classList.remove('hidden');

  pendingChest = null;
});

btnCloseChest.addEventListener('click', () => {
  chestModal.classList.add('hidden');
});

// Inventário: equipar (só armas) e vender
function updateEquippedDisplay() {
  const equipped = inventory.find((item) => item.id === equippedId);
  equippedDisplay.textContent = `Arma equipada: ${equipped ? equipped.name : 'Nenhuma'}`;
}

function renderInventory() {
  inventoryList.innerHTML = '';

  if (inventory.length === 0) {
    inventoryList.innerHTML = '<p class="placeholder-text">Nenhum item ainda. Abra baús pra conseguir equipamentos.</p>';
    updateEquippedDisplay();
    return;
  }

  inventory.forEach((item) => {
    const db = ITEM_DB[item.name] || {};
    const isEquipped = item.id === equippedId;

    const row = document.createElement('div');
    row.className = `inventory-item${isEquipped ? ' equipped' : ''}`;

    if (ITEM_ICONS[item.name]) {
      const icon = document.createElement('img');
      icon.className = 'inventory-item-icon';
      icon.src = ITEM_ICONS[item.name];
      icon.alt = '';
      row.appendChild(icon);
    }

    const info = document.createElement('div');
    info.className = 'inventory-item-info';

    const nameEl = document.createElement('span');
    nameEl.className = 'inventory-item-name';
    nameEl.textContent = item.name;

    const statsEl = document.createElement('span');
    statsEl.className = 'inventory-item-stats';
    statsEl.textContent = db.special
      ? 'Item especial'
      : `${db.category} · Dano ${db.damage} · Vel ${db.speed} · Alcance ${db.range} · ${db.type}`;

    info.appendChild(nameEl);
    info.appendChild(statsEl);

    const actions = document.createElement('div');
    actions.className = 'inventory-item-actions';

    if (!db.special) {
      const equipBtn = document.createElement('button');
      equipBtn.className = `btn-small ${isEquipped ? 'unequip' : 'equip'}`;
      equipBtn.textContent = isEquipped ? 'Desequipar' : 'Equipar';
      equipBtn.addEventListener('click', () => {
        equippedId = isEquipped ? null : item.id;
        saveProfile();
        renderInventory();
      });
      actions.appendChild(equipBtn);
    }

    const sellBtn = document.createElement('button');
    sellBtn.className = 'btn-small sell';
    sellBtn.textContent = 'Vender';
    sellBtn.addEventListener('click', () => {
      if (item.id === equippedId) {
        equippedId = null;
      }
      inventory = inventory.filter((i) => i.id !== item.id);
      gold += SELL_VALUES[db.rarity] || 3;
      saveProfile();
      updateGoldDisplay();
      renderInventory();
    });
    actions.appendChild(sellBtn);

    row.appendChild(info);
    row.appendChild(actions);
    inventoryList.appendChild(row);
  });

  updateEquippedDisplay();
}

document.getElementById('btn-inventory').addEventListener('click', () => {
  renderInventory();
  inventoryModal.classList.remove('hidden');
});

document.getElementById('btn-close-inventory').addEventListener('click', () => {
  inventoryModal.classList.add('hidden');
});

function lerpBarColor(t) {
  const segments = BAR_COLOR_STOPS.length - 1;
  const segPos = Math.min(t, 1) * segments;
  const idx = Math.min(Math.floor(segPos), segments - 1);
  const localT = segPos - idx;

  const [r1, g1, b1] = BAR_COLOR_STOPS[idx];
  const [r2, g2, b2] = BAR_COLOR_STOPS[idx + 1];
  const r = Math.round(r1 + (r2 - r1) * localT);
  const g = Math.round(g1 + (g2 - g1) * localT);
  const b = Math.round(b1 + (b2 - b1) * localT);
  return `rgb(${r}, ${g}, ${b})`;
}

coreBtn.addEventListener('animationend', () => {
  coreBtn.classList.remove('pressed');
});

coreBtn.addEventListener('click', () => {
  if (completedBars >= TOTAL_BARS) return;

  coreBtn.classList.remove('pressed');
  void coreBtn.offsetWidth; // reinicia a animação mesmo em cliques rápidos
  coreBtn.classList.add('pressed');

  stats.totalClicks++;
  saveProfile();

  clicksInBar++;
  const progress = clicksInBar / CLICKS_PER_BAR;
  progressFill.style.height = `${progress * 100}%`;
  progressFill.style.background = lerpBarColor(progress);

  if (clicksInBar >= CLICKS_PER_BAR) {
    clicksInBar = 0;
    completedBars++;
    progressFill.style.height = '0%';
    progressFill.style.background = lerpBarColor(0);
    openChest();

    if (completedBars >= TOTAL_BARS) {
      recordRankingEntry().then((elapsedMs) => {
        if (elapsedMs !== null && (stats.bestTime === null || elapsedMs < stats.bestTime)) {
          stats.bestTime = elapsedMs;
          saveProfile();
        }
      });
      stats.phasesCompleted++;
      saveProfile();
      btnBackMenu.classList.remove('hidden');
    }
  }

  barCounter.textContent = completedBars >= TOTAL_BARS
    ? 'Todas as barras completas!'
    : `Barras completas: ${completedBars}/${TOTAL_BARS}`;
});

const btnBackMenu = document.getElementById('btn-back-menu');

btnBackMenu.addEventListener('click', () => {
  completedBars = 0;
  clicksInBar = 0;
  progressFill.style.height = '0%';
  progressFill.style.background = lerpBarColor(0);
  barCounter.textContent = `Barras completas: 0/${TOTAL_BARS}`;
  btnBackMenu.classList.add('hidden');

  gameScreen.classList.add('hidden');
  homeScreen.classList.remove('hidden');
  document.body.classList.remove('phase-active');
});
