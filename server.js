const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingInterval: 10000,
  pingTimeout: 20000
});

app.use(express.static(path.join(__dirname, 'public')));

const SUITS = ['fire', 'sun', 'moon', 'star'];
const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const TREX_CONTRACTS = ['no_tricks', 'no_sun', 'no_ladies', 'no_sultan', 'cascade'];

const DEFAULT_TERMINOLOGY = {
  platformName: 'مَجْلِس الأختام',
  modeTrex: 'المَمالِك',
  modeTarneeb: 'السِّيادة 61',
  trumpLabel: 'البيت الحاكم',
  suits: {
    fire: 'النّار',
    sun: 'الشّمس',
    moon: 'القَمَر',
    star: 'النَّجْم'
  },
  ranks: {
    11: 'فارِس',
    12: 'سَيّدة',
    13: 'سُلطان',
    14: 'القُطب'
  },
  contracts: {
    no_tricks: 'بدون أكلات',
    no_sun: 'بدون شمس',
    no_ladies: 'بدون سيّدات',
    no_sultan: 'بدون سلطان النّار',
    cascade: 'التَّسَلْسُل'
  }
};

const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[crypto.randomInt(0, chars.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: `${suit}_${rank}`, suit, rank });
    }
  }
  return deck;
}

function shufflePureRandom(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function dealHands() {
  const deck = shufflePureRandom(createDeck());
  return [
    deck.slice(0, 13),
    deck.slice(13, 26),
    deck.slice(26, 39),
    deck.slice(39, 52)
  ];
}

function cloneDefaultTerminology() {
  return JSON.parse(JSON.stringify(DEFAULT_TERMINOLOGY));
}

function sanitizeText(str, maxLen = 24) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLen);
}

function clearRoomTimers(room) {
  if (room.timer) {
    clearTimeout(room.timer);
    room.timer = null;
  }
}

function checkTrexMisdeal(hands, contract, terminology) {
  if (contract === 'cascade') {
    for (let seat = 0; seat < 4; seat++) {
      const hand = hands[seat];
      const twos = hand.filter((c) => c.rank === 2);
      if (twos.length === 3) {
        const twoSuits = new Set(twos.map((c) => c.suit));
        const missingSuit = SUITS.find((s) => !twoSuits.has(s));
        const hasThreeOfMissing = hand.some((c) => c.suit === missingSuit && c.rank === 3);
        if (hasThreeOfMissing) {
          return {
            seat,
            reason: `حمل ثلاث اثنينات و 3 ${terminology.suits[missingSuit]}`
          };
        }
      }
    }
  }

  if (contract === 'no_sultan') {
    for (let seat = 0; seat < 4; seat++) {
      const hand = hands[seat];
      const fireCards = hand.filter((c) => c.suit === 'fire');
      if (fireCards.length === 1 && fireCards[0].rank === 13) {
        return {
          seat,
          reason: `${terminology.ranks[13]} ${terminology.suits.fire} لوحده بدون أي ختم آخر من بيته`
        };
      }
    }
  }

  return null;
}

function checkTarneebMisdeal(hands) {
  for (let seat = 0; seat < 4; seat++) {
    const hasFace = hands[seat].some((c) => c.rank >= 11);
    if (!hasFace) {
      return {
        seat,
        reason: 'لا يملك أي صورة (فارس / سيدة / سلطان / قطب)'
      };
    }
  }
  return null;
}

function getLegalCards(room, seat) {
  const g = room.game;
  if (!g) return [];
  const hand = g.hands[seat] || [];

  if (g.mode === 'trex' && g.phase === 'trex_playing') {
    if (g.contract === 'cascade') {
      return hand
        .filter((card) => {
          const lane = g.cascadeBoard[card.suit];
          if (!lane) return card.rank === 11;
          return card.rank === lane.min - 1 || card.rank === lane.max + 1;
        })
        .map((c) => c.id);
    }

    if (g.currentTrick.length === 0) return hand.map((c) => c.id);
    const ledSuit = g.currentTrick[0].card.suit;
    const matching = hand.filter((c) => c.suit === ledSuit);
    return (matching.length > 0 ? matching : hand).map((c) => c.id);
  }

  if (g.mode === 'tarneeb' && g.phase === 'tarneeb_playing') {
    if (g.currentTrick.length === 0) return hand.map((c) => c.id);
    const ledSuit = g.currentTrick[0].card.suit;
    const matching = hand.filter((c) => c.suit === ledSuit);
    return (matching.length > 0 ? matching : hand).map((c) => c.id);
  }

  return [];
}

function buildClientState(room, viewerSeat) {
  const playersSummary = room.seats.map((p, idx) => ({
    seat: idx,
    team: idx % 2,
    name: p ? p.name : null,
    connected: p ? p.connected : false,
    isHost: p ? p.token === room.hostToken : false,
    cardCount: room.game && room.game.hands[idx] ? room.game.hands[idx].length : 0
  }));

  let gameView = null;
  if (room.game) {
    const g = room.game;
    const myHand = viewerSeat !== null && g.hands[viewerSeat] ? g.hands[viewerSeat] : [];
    const legalCards = viewerSeat !== null && g.turnSeat === viewerSeat ? getLegalCards(room, viewerSeat) : [];

    gameView = {
      mode: g.mode,
      phase: g.phase,
      scores: g.scores,
      roundNumber: g.roundNumber,
      turnSeat: g.turnSeat,
      dealerSeat: g.dealerSeat,
      myHand,
      legalCards,
      currentTrick: g.currentTrick,
      lastTrick: g.lastTrick,
      banner: g.banner,
      winnerTeam: g.winnerTeam,
      rulerSeat: g.rulerSeat,
      realmsCompleted: g.realmsCompleted,
      remainingContracts: g.remainingContracts,
      contract: g.contract,
      cascadeBoard: g.cascadeBoard,
      finishedOrder: g.finishedOrder,
      doubledCards: g.doubledCards,
      doublingPendingSeats: g.doublingPendingSeats,
      myEligibleDoubleCards:
        g.phase === 'trex_doubling' && viewerSeat !== null && g.doublingPendingSeats.includes(viewerSeat)
          ? myHand.filter((c) => (g.contract === 'no_ladies' ? c.rank === 12 : c.id === 'fire_13'))
          : [],
      eatenPenalties: g.eatenPenalties,
      highestBid: g.highestBid,
      highestBidder: g.highestBidder,
      passedSeats: g.passedSeats,
      trumpSuit: g.trumpSuit,
      tricksWon: g.tricksWon,
      lastRoundSummary: g.lastRoundSummary
    };
  }

  return {
    roomCode: room.code,
    status: room.status,
    mySeat: viewerSeat,
    isHost: viewerSeat !== null && room.seats[viewerSeat]?.token === room.hostToken,
    mode: room.mode,
    terminology: room.terminology,
    players: playersSummary,
    game: gameView
  };
}

function broadcastRoom(room) {
  for (let seat = 0; seat < 4; seat++) {
    const p = room.seats[seat];
    if (p && p.connected && p.socketId) {
      io.to(p.socketId).emit('room_state', buildClientState(room, seat));
    }
  }
}

function startTrexMatch(room) {
  clearRoomTimers(room);
  const hands = dealHands();
  let firstRuler = 0;
  for (let s = 0; s < 4; s++) {
    if (hands[s].some((c) => c.id === 'fire_7')) {
      firstRuler = s;
      break;
    }
  }

  room.status = 'playing';
  room.game = {
    mode: 'trex',
    phase: 'trex_choose_contract',
    scores: [0, 0],
    roundNumber: 1,
    hands,
    rulerSeat: firstRuler,
    turnSeat: firstRuler,
    dealerSeat: null,
    realmsCompleted: 0,
    remainingContracts: [...TREX_CONTRACTS],
    contract: null,
    currentTrick: [],
    lastTrick: null,
    cascadeBoard: { fire: null, sun: null, moon: null, star: null },
    finishedOrder: [],
    doubledCards: {},
    doublingPendingSeats: [],
    eatenPenalties: { tricks: [0, 0], sun: [0, 0], ladies: [0, 0], sultan: null },
    banner: {
      type: 'info',
      text: `حصل ${room.seats[firstRuler].name} على 7 ${room.terminology.suits.fire} ويبدأ أول مملكة!`
    },
    winnerTeam: null
  };
  broadcastRoom(room);
}

function dealNextTrexHand(room, sameRuler = false, bannerText = null) {
  const g = room.game;
  const hands = dealHands();
  g.hands = hands;
  g.contract = null;
  g.currentTrick = [];
  g.lastTrick = null;
  g.cascadeBoard = { fire: null, sun: null, moon: null, star: null };
  g.finishedOrder = [];
  g.doubledCards = {};
  g.doublingPendingSeats = [];
  g.eatenPenalties = { tricks: [0, 0], sun: [0, 0], ladies: [0, 0], sultan: null };

  if (!sameRuler) {
    if (g.remainingContracts.length === 0) {
      g.realmsCompleted += 1;
      if (g.realmsCompleted >= 4) {
        g.phase = 'match_over';
        g.turnSeat = null;
        g.winnerTeam = g.scores[0] >= g.scores[1] ? (g.scores[0] === g.scores[1] ? -1 : 0) : 1;
        g.banner = { type: 'win', text: 'انتهت الممالك الأربع!' };
        broadcastRoom(room);
        return;
      }
      g.rulerSeat = (g.rulerSeat + 1) % 4;
      g.remainingContracts = [...TREX_CONTRACTS];
    }
    g.roundNumber += 1;
  }

  g.phase = 'trex_choose_contract';
  g.turnSeat = g.rulerSeat;
  g.banner = bannerText
    ? { type: 'info', text: bannerText }
    : { type: 'info', text: `دور ${room.seats[g.rulerSeat].name} لاختيار الطلب` };
  broadcastRoom(room);
}

function handleTrexContractPick(room, seat, contract) {
  const g = room.game;
  if (!g || g.mode !== 'trex' || g.phase !== 'trex_choose_contract') return;
  if (seat !== g.rulerSeat) return;
  if (!g.remainingContracts.includes(contract)) return;

  const misdeal = checkTrexMisdeal(g.hands, contract, room.terminology);
  if (misdeal) {
    g.phase = 'misdeal_pause';
    g.contract = contract;
    g.turnSeat = null;
    g.banner = {
      type: 'warn',
      text: `لا تُلعب! (${room.seats[misdeal.seat].name}: ${misdeal.reason}) — إعادة توزيع ونفس صاحب المملكة يختار بحرية`
    };
    broadcastRoom(room);
    clearRoomTimers(room);
    room.timer = setTimeout(() => {
      dealNextTrexHand(
        room,
        true,
        `تمت إعادة التوزيع — ${room.seats[g.rulerSeat].name} يختار أي طلب من المتبقي له`
      );
    }, 2800);
    return;
  }

  g.contract = contract;
  g.remainingContracts = g.remainingContracts.filter((c) => c !== contract);

  if (contract === 'no_ladies' || contract === 'no_sultan') {
    const pending = [];
    for (let s = 0; s < 4; s++) {
      const hasTarget =
        contract === 'no_ladies'
          ? g.hands[s].some((c) => c.rank === 12)
          : g.hands[s].some((c) => c.id === 'fire_13');
      if (hasTarget) pending.push(s);
    }

    if (pending.length > 0) {
      g.phase = 'trex_doubling';
      g.doublingPendingSeats = pending;
      g.turnSeat = null;
      g.banner = {
        type: 'info',
        text: `طلب ${room.seats[g.rulerSeat].name}: ${room.terminology.contracts[contract]} — وقت المضاعفة (التدبيل)`
      };
      broadcastRoom(room);
      return;
    }
  }

  g.phase = 'trex_playing';
  g.turnSeat = g.rulerSeat;
  g.banner = {
    type: 'info',
    text: `طلب ${room.seats[g.rulerSeat].name}: ${room.terminology.contracts[contract]}`
  };
  broadcastRoom(room);
}

function handleTrexDoublingChoice(room, seat, doubledCardIds) {
  const g = room.game;
  if (!g || g.mode !== 'trex' || g.phase !== 'trex_doubling') return;
  if (!g.doublingPendingSeats.includes(seat)) return;

  const validIds = new Set(
    g.hands[seat]
      .filter((c) => (g.contract === 'no_ladies' ? c.rank === 12 : c.id === 'fire_13'))
      .map((c) => c.id)
  );

  if (Array.isArray(doubledCardIds)) {
    for (const id of doubledCardIds) {
      if (validIds.has(id)) g.doubledCards[id] = seat;
    }
  }

  g.doublingPendingSeats = g.doublingPendingSeats.filter((s) => s !== seat);

  if (g.doublingPendingSeats.length === 0) {
    const doubledCount = Object.keys(g.doubledCards).length;
    g.phase = 'trex_playing';
    g.turnSeat = g.rulerSeat;
    g.banner = {
      type: 'info',
      text:
        doubledCount > 0
          ? `تمت مضاعفة ${doubledCount} ختم! يبدأ ${room.seats[g.rulerSeat].name}`
          : `لم تتم أي مضاعفة — يبدأ ${room.seats[g.rulerSeat].name}`
    };
  }
  broadcastRoom(room);
}

function advanceCascadeTurn(room) {
  const g = room.game;
  let next = (g.turnSeat + 1) % 4;
  for (let i = 0; i < 4; i++) {
    if (g.hands[next].length > 0) {
      g.turnSeat = next;
      return;
    }
    next = (next + 1) % 4;
  }
}

function handleTrexPlay(room, seat, cardId) {
  const g = room.game;
  if (!g || g.mode !== 'trex' || g.phase !== 'trex_playing') return;
  if (seat !== g.turnSeat) return;

  const legal = getLegalCards(room, seat);
  if (!legal.includes(cardId)) return;

  const idx = g.hands[seat].findIndex((c) => c.id === cardId);
  const [card] = g.hands[seat].splice(idx, 1);

  if (g.contract === 'cascade') {
    const lane = g.cascadeBoard[card.suit];
    if (!lane) {
      g.cascadeBoard[card.suit] = { min: 11, max: 11 };
    } else {
      if (card.rank < lane.min) lane.min = card.rank;
      if (card.rank > lane.max) lane.max = card.rank;
    }

    if (g.hands[seat].length === 0) {
      const rankPos = g.finishedOrder.length;
      const pts = [200, 150, 100, 50][rankPos];
      g.finishedOrder.push({ seat, pts });
      g.scores[seat % 2] += pts;
      g.banner = {
        type: 'good',
        text: `أنهى ${room.seats[seat].name} أوراقه في المركز ${rankPos + 1} (+${pts})`
      };

      if (g.finishedOrder.length === 3) {
        const lastSeat = [0, 1, 2, 3].find((s) => g.hands[s].length > 0);
        if (lastSeat !== undefined) {
          g.finishedOrder.push({ seat: lastSeat, pts: 50 });
          g.scores[lastSeat % 2] += 50;
          g.hands[lastSeat] = [];
        }
        g.phase = 'hand_pause';
        g.turnSeat = null;
        broadcastRoom(room);
        clearRoomTimers(room);
        room.timer = setTimeout(() => dealNextTrexHand(room, false), 2500);
        return;
      }
    }

    advanceCascadeTurn(room);
    broadcastRoom(room);
    return;
  }

  g.currentTrick.push({ seat, card });
  if (g.currentTrick.length < 4) {
    g.turnSeat = (g.turnSeat + 1) % 4;
    broadcastRoom(room);
    return;
  }

  const ledSuit = g.currentTrick[0].card.suit;
  let winPlay = g.currentTrick[0];
  for (const play of g.currentTrick) {
    if (play.card.suit === ledSuit && play.card.rank > winPlay.card.rank) {
      winPlay = play;
    }
  }
  const winSeat = winPlay.seat;
  const winTeam = winSeat % 2;
  let roundMustEndEarly = false;

  if (g.contract === 'no_tricks') {
    g.scores[winTeam] -= 15;
    g.eatenPenalties.tricks[winTeam] += 1;
  } else if (g.contract === 'no_sun') {
    const sunCount = g.currentTrick.filter((p) => p.card.suit === 'sun').length;
    if (sunCount > 0) {
      g.scores[winTeam] -= sunCount * 10;
      g.eatenPenalties.sun[winTeam] += sunCount;
    }
    if (g.eatenPenalties.sun[0] + g.eatenPenalties.sun[1] >= 13) roundMustEndEarly = true;
  } else if (g.contract === 'no_ladies') {
    for (const play of g.currentTrick) {
      if (play.card.rank === 12) {
        g.eatenPenalties.ladies[winTeam] += 1;
        const doublerSeat = g.doubledCards[play.card.id];
        if (doublerSeat !== undefined) {
          const doublerTeam = doublerSeat % 2;
          g.scores[winTeam] -= 50;
          if (winTeam !== doublerTeam) g.scores[doublerTeam] += 25;
          else g.scores[1 - doublerTeam] += 25;
        } else {
          g.scores[winTeam] -= 25;
        }
      }
    }
    if (g.eatenPenalties.ladies[0] + g.eatenPenalties.ladies[1] >= 4) roundMustEndEarly = true;
  } else if (g.contract === 'no_sultan') {
    const sultanPlay = g.currentTrick.find((p) => p.card.id === 'fire_13');
    if (sultanPlay) {
      g.eatenPenalties.sultan = winTeam;
      const doublerSeat = g.doubledCards['fire_13'];
      if (doublerSeat !== undefined) {
        const doublerTeam = doublerSeat % 2;
        g.scores[winTeam] -= 150;
        if (winTeam !== doublerTeam) g.scores[doublerTeam] += 75;
        else g.scores[1 - doublerTeam] += 75;
      } else {
        g.scores[winTeam] -= 75;
      }
      roundMustEndEarly = true;
    }
  }

  g.lastTrick = { winnerSeat: winSeat, cards: [...g.currentTrick] };
  g.phase = 'trick_pause';
  g.turnSeat = null;
  g.banner = { type: 'info', text: `أكلها ${room.seats[winSeat].name}` };
  broadcastRoom(room);

  clearRoomTimers(room);
  room.timer = setTimeout(() => {
    g.currentTrick = [];
    if (g.hands[0].length === 0 || roundMustEndEarly) {
      dealNextTrexHand(room, false);
    } else {
      g.phase = 'trex_playing';
      g.turnSeat = winSeat;
      broadcastRoom(room);
    }
  }, 1400);
}

function handleTrexPass(room, seat) {
  const g = room.game;
  if (!g || g.mode !== 'trex' || g.phase !== 'trex_playing' || g.contract !== 'cascade') return;
  if (seat !== g.turnSeat) return;

  const legal = getLegalCards(room, seat);
  if (legal.length > 0) return;

  g.banner = { type: 'info', text: `تخطّى ${room.seats[seat].name} لعدم توفر ختم مناسب` };
  advanceCascadeTurn(room);
  broadcastRoom(room);
}

function startTarneebMatch(room) {
  clearRoomTimers(room);
  const firstDealer = crypto.randomInt(0, 4);
  room.status = 'playing';
  room.game = {
    mode: 'tarneeb',
    phase: 'tarneeb_bidding',
    scores: [0, 0],
    roundNumber: 0,
    hands: [[], [], [], []],
    dealerSeat: firstDealer,
    turnSeat: null,
    currentTrick: [],
    lastTrick: null,
    highestBid: 0,
    highestBidder: null,
    passedSeats: [],
    trumpSuit: null,
    tricksWon: [0, 0],
    banner: null,
    lastRoundSummary: null,
    winnerTeam: null
  };
  dealTarneebRound(room, false);
}

function dealTarneebRound(room, rotateDealer = true) {
  const g = room.game;
  if (rotateDealer) {
    g.dealerSeat = (g.dealerSeat + 1) % 4;
    g.roundNumber += 1;
  } else {
    g.roundNumber = Math.max(1, g.roundNumber);
  }

  const hands = dealHands();
  g.hands = hands;
  g.currentTrick = [];
  g.lastTrick = null;
  g.highestBid = 0;
  g.highestBidder = null;
  g.passedSeats = [];
  g.trumpSuit = null;
  g.tricksWon = [0, 0];

  const misdeal = checkTarneebMisdeal(hands);
  if (misdeal) {
    g.phase = 'misdeal_pause';
    g.turnSeat = null;
    g.banner = {
      type: 'warn',
      text: `لا تُلعب! (${room.seats[misdeal.seat].name}: ${misdeal.reason}) — جاري إعادة التوزيع`
    };
    broadcastRoom(room);
    clearRoomTimers(room);
    room.timer = setTimeout(() => dealTarneebRound(room, false), 2600);
    return;
  }

  g.phase = 'tarneeb_bidding';
  g.turnSeat = (g.dealerSeat + 1) % 4;
  g.banner = {
    type: 'info',
    text: `بدأت المزايدة — الدور على ${room.seats[g.turnSeat].name}`
  };
  broadcastRoom(room);
}

function nextActiveBidder(fromSeat, passedSeats) {
  for (let i = 1; i <= 4; i++) {
    const candidate = (fromSeat + i) % 4;
    if (!passedSeats.includes(candidate)) return candidate;
  }
  return null;
}

function handleTarneebBid(room, seat, amount) {
  const g = room.game;
  if (!g || g.mode !== 'tarneeb' || g.phase !== 'tarneeb_bidding') return;
  if (seat !== g.turnSeat) return;
  if (g.passedSeats.includes(seat)) return;

  if (amount === 'pass') {
    g.passedSeats.push(seat);

    if (g.passedSeats.length === 4) {
      g.phase = 'misdeal_pause';
      g.turnSeat = null;
      g.banner = { type: 'warn', text: 'تخطّى الجميع — يُعاد توزيع الأوراق' };
      broadcastRoom(room);
      clearRoomTimers(room);
      room.timer = setTimeout(() => dealTarneebRound(room, true), 2000);
      return;
    }

    if (g.highestBidder !== null && g.passedSeats.length === 3) {
      g.phase = 'tarneeb_choose_trump';
      g.turnSeat = g.highestBidder;
      g.banner = {
        type: 'good',
        text: `ربح ${room.seats[g.highestBidder].name} المزايدة بطلب ${g.highestBid} — يختار ${room.terminology.trumpLabel}`
      };
      broadcastRoom(room);
      return;
    }

    g.turnSeat = nextActiveBidder(seat, g.passedSeats);
    g.banner = { type: 'info', text: `تخطّى ${room.seats[seat].name}` };
    broadcastRoom(room);
    return;
  }

  const bidNum = Number(amount);
  const minAllowed = Math.max(7, g.highestBid + 1);
  if (!Number.isInteger(bidNum) || bidNum < minAllowed || bidNum > 13) return;

  g.highestBid = bidNum;
  g.highestBidder = seat;

  if (bidNum === 13 || g.passedSeats.length === 3) {
    g.phase = 'tarneeb_choose_trump';
    g.turnSeat = seat;
    g.banner = {
      type: 'good',
      text: `ربح ${room.seats[seat].name} المزايدة بطلب ${bidNum} — يختار ${room.terminology.trumpLabel}`
    };
    broadcastRoom(room);
    return;
  }

  g.turnSeat = nextActiveBidder(seat, g.passedSeats);
  g.banner = { type: 'info', text: `طلب ${room.seats[seat].name}: ${bidNum}` };
  broadcastRoom(room);
}

function handleTarneebTrump(room, seat, suit) {
  const g = room.game;
  if (!g || g.mode !== 'tarneeb' || g.phase !== 'tarneeb_choose_trump') return;
  if (seat !== g.highestBidder) return;
  if (!SUITS.includes(suit)) return;

  g.trumpSuit = suit;
  g.phase = 'tarneeb_playing';
  g.turnSeat = g.highestBidder;
  g.banner = {
    type: 'info',
    text: `${room.terminology.trumpLabel}: ${room.terminology.suits[suit]} — يبدأ ${room.seats[seat].name}`
  };
  broadcastRoom(room);
}

function handleTarneebPlay(room, seat, cardId) {
  const g = room.game;
  if (!g || g.mode !== 'tarneeb' || g.phase !== 'tarneeb_playing') return;
  if (seat !== g.turnSeat) return;

  const legal = getLegalCards(room, seat);
  if (!legal.includes(cardId)) return;

  const idx = g.hands[seat].findIndex((c) => c.id === cardId);
  const [card] = g.hands[seat].splice(idx, 1);
  g.currentTrick.push({ seat, card });

  if (g.currentTrick.length < 4) {
    g.turnSeat = (g.turnSeat + 1) % 4;
    broadcastRoom(room);
    return;
  }

  let winPlay = g.currentTrick[0];
  for (const play of g.currentTrick) {
    const c = play.card;
    const w = winPlay.card;
    if (c.suit === g.trumpSuit && w.suit !== g.trumpSuit) winPlay = play;
    else if (c.suit === w.suit && c.rank > w.rank) winPlay = play;
  }

  const winSeat = winPlay.seat;
  g.tricksWon[winSeat % 2] += 1;
  g.lastTrick = { winnerSeat: winSeat, cards: [...g.currentTrick] };
  g.phase = 'trick_pause';
  g.turnSeat = null;
  g.banner = { type: 'info', text: `أكلها ${room.seats[winSeat].name}` };
  broadcastRoom(room);

  clearRoomTimers(room);
  room.timer = setTimeout(() => {
    g.currentTrick = [];

    if (g.hands[0].length > 0) {
      g.phase = 'tarneeb_playing';
      g.turnSeat = winSeat;
      broadcastRoom(room);
      return;
    }

    const bidTeam = g.highestBidder % 2;
    const bidTricks = g.tricksWon[bidTeam];
    const bid = g.highestBid;
    let delta = 0;

    if (bid === 13) {
      delta = bidTricks === 13 ? 26 : -26;
    } else {
      if (bidTricks === 13) delta = 13;
      else if (bidTricks >= bid) delta = bidTricks;
      else delta = -bid;
    }

    g.scores[bidTeam] += delta;
    const summary = `الفريق ${bidTeam + 1} طلب ${bid} وحصد ${bidTricks} (${delta >= 0 ? '+' + delta : delta})`;
    g.lastRoundSummary = summary;

    if (g.scores[0] >= 61 || g.scores[1] >= 61) {
      g.phase = 'match_over';
      g.winnerTeam = g.scores[0] >= 61 ? 0 : 1;
      g.banner = { type: 'win', text: `فاز الفريق ${g.winnerTeam + 1} بالمباراة! ${summary}` };
      broadcastRoom(room);
      return;
    }

    g.phase = 'hand_pause';
    g.banner = { type: delta >= 0 ? 'good' : 'warn', text: summary };
    broadcastRoom(room);
    room.timer = setTimeout(() => dealTarneebRound(room, true), 2600);
  }, 1400);
}

io.on('connection', (socket) => {
  let activeRoomCode = null;
  let activeToken = null;

  function getMySeat(room) {
    if (!room || !activeToken) return null;
    const idx = room.seats.findIndex((p) => p && p.token === activeToken);
    return idx === -1 ? null : idx;
  }

  socket.on('create_room', ({ name, mode }) => {
    const cleanName = sanitizeText(name, 18) || 'اللاعب 1';
    const roomCode = generateRoomCode();
    const token = generateToken();
    const validMode = mode === 'tarneeb' ? 'tarneeb' : 'trex';

    const room = {
      code: roomCode,
      hostToken: token,
      status: 'lobby',
      mode: validMode,
      terminology: cloneDefaultTerminology(),
      seats: [
        { name: cleanName, token, socketId: socket.id, connected: true },
        null,
        null,
        null
      ],
      game: null,
      timer: null
    };

    rooms.set(roomCode, room);
    activeRoomCode = roomCode;
    activeToken = token;
    socket.emit('session_assigned', { roomCode, token, seat: 0 });
    broadcastRoom(room);
  });

  socket.on('join_room', ({ roomCode, name, token }) => {
    const code = sanitizeText(roomCode, 8).toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      socket.emit('error_msg', 'الغرفة غير موجودة أو انتهت.');
      return;
    }

    if (token) {
      const existingSeat = room.seats.findIndex((p) => p && p.token === token);
      if (existingSeat !== -1) {
        room.seats[existingSeat].socketId = socket.id;
        room.seats[existingSeat].connected = true;
        if (name && room.status === 'lobby') {
          const clean = sanitizeText(name, 18);
          if (clean) room.seats[existingSeat].name = clean;
        }
        activeRoomCode = code;
        activeToken = token;
        socket.emit('session_assigned', { roomCode: code, token, seat: existingSeat });
        broadcastRoom(room);
        return;
      }
    }

    if (room.status !== 'lobby') {
      socket.emit('error_msg', 'المباراة قد بدأت بالفعل في هذه الغرفة.');
      return;
    }

    const emptySeat = room.seats.findIndex((p) => p === null);
    if (emptySeat === -1) {
      socket.emit('error_msg', 'الغرفة ممتلئة (4 لاعبين).');
      return;
    }

    const cleanName = sanitizeText(name, 18) || `اللاعب ${emptySeat + 1}`;
    const newToken = generateToken();
    room.seats[emptySeat] = {
      name: cleanName,
      token: newToken,
      socketId: socket.id,
      connected: true
    };
    activeRoomCode = code;
    activeToken = newToken;

    socket.emit('session_assigned', { roomCode: code, token: newToken, seat: emptySeat });
    broadcastRoom(room);
  });

  socket.on('move_seat', ({ targetSeat }) => {
    const room = rooms.get(activeRoomCode);
    const seat = getMySeat(room);
    if (!room || room.status !== 'lobby' || seat === null) return;
    if (!Number.isInteger(targetSeat) || targetSeat < 0 || targetSeat > 3) return;
    if (targetSeat === seat) return;

    const currentPlayer = room.seats[seat];
    const targetPlayer = room.seats[targetSeat];
    const isHost = currentPlayer?.token === room.hostToken;

    if (targetPlayer === null) {
      room.seats[targetSeat] = currentPlayer;
      room.seats[seat] = null;
    } else if (isHost) {
      room.seats[targetSeat] = currentPlayer;
      room.seats[seat] = targetPlayer;
    }
    broadcastRoom(room);
  });

  socket.on('swap_two_seats', ({ seatA, seatB }) => {
    const room = rooms.get(activeRoomCode);
    const seat = getMySeat(room);
    if (!room || room.status !== 'lobby' || seat === null) return;
    if (room.seats[seat]?.token !== room.hostToken) return;
    if (![0, 1, 2, 3].includes(seatA) || ![0, 1, 2, 3].includes(seatB) || seatA === seatB) return;

    const temp = room.seats[seatA];
    room.seats[seatA] = room.seats[seatB];
    room.seats[seatB] = temp;
    broadcastRoom(room);
  });

  socket.on('update_settings', ({ mode, terminology }) => {
    const room = rooms.get(activeRoomCode);
    const seat = getMySeat(room);
    if (!room || room.status !== 'lobby' || seat === null) return;
    if (room.seats[seat]?.token !== room.hostToken) return;

    if (mode === 'trex' || mode === 'tarneeb') room.mode = mode;

    if (terminology && typeof terminology === 'object') {
      const t = room.terminology;
      if (sanitizeText(terminology.modeTrex)) t.modeTrex = sanitizeText(terminology.modeTrex, 20);
      if (sanitizeText(terminology.modeTarneeb)) t.modeTarneeb = sanitizeText(terminology.modeTarneeb, 20);
      if (sanitizeText(terminology.trumpLabel)) t.trumpLabel = sanitizeText(terminology.trumpLabel, 20);

      if (terminology.suits) {
        for (const s of SUITS) {
          const val = sanitizeText(terminology.suits[s], 16);
          if (val) t.suits[s] = val;
        }
      }
      if (terminology.ranks) {
        for (const r of [11, 12, 13, 14]) {
          const val = sanitizeText(terminology.ranks[r], 16);
          if (val) t.ranks[r] = val;
        }
      }
      if (terminology.contracts) {
        for (const c of TREX_CONTRACTS) {
          const val = sanitizeText(terminology.contracts[c], 22);
          if (val) t.contracts[c] = val;
        }
      }
    }
    broadcastRoom(room);
  });

  socket.on('start_game', () => {
    const room = rooms.get(activeRoomCode);
    const seat = getMySeat(room);
    if (!room || seat === null) return;
    if (room.seats[seat]?.token !== room.hostToken) return;
    if (room.seats.some((p) => p === null)) {
      socket.emit('error_msg', 'يجب اكتمال 4 لاعبين لبدء اللعب.');
      return;
    }

    if (room.mode === 'trex') startTrexMatch(room);
    else startTarneebMatch(room);
  });

  socket.on('back_to_lobby', () => {
    const room = rooms.get(activeRoomCode);
    const seat = getMySeat(room);
    if (!room || seat === null) return;
    if (room.seats[seat]?.token !== room.hostToken) return;
    clearRoomTimers(room);
    room.status = 'lobby';
    room.game = null;
    broadcastRoom(room);
  });

  socket.on('trex_choose_contract', ({ contract }) => {
    const room = rooms.get(activeRoomCode);
    const seat = getMySeat(room);
    if (!room || seat === null) return;
    handleTrexContractPick(room, seat, contract);
  });

  socket.on('trex_doubling_done', ({ doubledCardIds }) => {
    const room = rooms.get(activeRoomCode);
    const seat = getMySeat(room);
    if (!room || seat === null) return;
    handleTrexDoublingChoice(room, seat, doubledCardIds);
  });

  socket.on('trex_pass', () => {
    const room = rooms.get(activeRoomCode);
    const seat = getMySeat(room);
    if (!room || seat === null) return;
    handleTrexPass(room, seat);
  });

  socket.on('tarneeb_bid', ({ amount }) => {
    const room = rooms.get(activeRoomCode);
    const seat = getMySeat(room);
    if (!room || seat === null) return;
    handleTarneebBid(room, seat, amount);
  });

  socket.on('tarneeb_choose_trump', ({ suit }) => {
    const room = rooms.get(activeRoomCode);
    const seat = getMySeat(room);
    if (!room || seat === null) return;
    handleTarneebTrump(room, seat, suit);
  });

  socket.on('play_card', ({ cardId }) => {
    const room = rooms.get(activeRoomCode);
    const seat = getMySeat(room);
    if (!room || !room.game || seat === null) return;
    if (room.game.mode === 'trex') handleTrexPlay(room, seat, cardId);
    else handleTarneebPlay(room, seat, cardId);
  });

  socket.on('disconnect', () => {
    const room = rooms.get(activeRoomCode);
    const seat = getMySeat(room);
    if (!room || seat === null) return;
    const player = room.seats[seat];
    if (player && player.socketId === socket.id) {
      player.connected = false;
      broadcastRoom(room);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
