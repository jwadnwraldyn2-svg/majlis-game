(() => {
  const socket = io();

  const STORAGE_TOKEN = 'majlis_token';
  const STORAGE_ROOM = 'majlis_room';
  const STORAGE_NAME = 'majlis_name';

  let state = null;
  let swapFirstSeat = null;
  let doublingSelection = new Set();
  let soundEnabled = true;

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let audioCtx = null;
  function playTone(freq = 520, duration = 0.06, type = 'sine') {
    if (!soundEnabled || !AudioCtx) return;
    try {
      if (!audioCtx) audioCtx = new AudioCtx();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (_) {}
  }

  document.getElementById('logo-fire').innerHTML = DeckRenderer.suitSVG('fire', '#C81E32', 22);
  document.getElementById('logo-sun').innerHTML = DeckRenderer.suitSVG('sun', '#C81E32', 22);
  document.getElementById('logo-moon').innerHTML = DeckRenderer.suitSVG('moon', '#172554', 22);
  document.getElementById('logo-star').innerHTML = DeckRenderer.suitSVG('star', '#172554', 22);

  const el = {
    home: document.getElementById('screen-home'),
    lobby: document.getElementById('screen-lobby'),
    game: document.getElementById('screen-game'),
    inputName: document.getElementById('input-name'),
    createMode: document.getElementById('create-mode'),
    inputCode: document.getElementById('input-code'),
    homeError: document.getElementById('home-error'),
    lobbyCode: document.getElementById('lobby-code'),
    lobbyModeBadge: document.getElementById('lobby-mode-badge'),
    lobbySeats: document.getElementById('lobby-seats'),
    hostControls: document.getElementById('host-controls'),
    lobbyModeSelect: document.getElementById('lobby-mode-select'),
    btnStartGame: document.getElementById('btn-start-game'),
    lobbyWaitMsg: document.getElementById('lobby-wait-msg'),
    hudMode: document.getElementById('hud-mode'),
    hudContract: document.getElementById('hud-contract'),
    hudRound: document.getElementById('hud-round'),
    hudT0Label: document.getElementById('hud-team0-label'),
    hudT1Label: document.getElementById('hud-team1-label'),
    hudT0Score: document.getElementById('hud-team0-score'),
    hudT1Score: document.getElementById('hud-team1-score'),
    banner: document.getElementById('game-banner'),
    seatTop: document.getElementById('seat-top'),
    seatRight: document.getElementById('seat-right'),
    seatLeft: document.getElementById('seat-left'),
    seatBottom: document.getElementById('seat-bottom'),
    centerTrick: document.getElementById('center-trick'),
    centerCascade: document.getElementById('center-cascade'),
    centerAction: document.getElementById('center-action'),
    handCards: document.getElementById('hand-cards'),
    handActions: document.getElementById('hand-actions'),
    modalSettings: document.getElementById('modal-settings'),
    modalRules: document.getElementById('modal-rules'),
    modalGameover: document.getElementById('modal-gameover')
  };

  function showScreen(name) {
    el.home.classList.toggle('active', name === 'home');
    el.lobby.classList.toggle('active', name === 'lobby');
    el.game.classList.toggle('active', name === 'game');
  }

  function showHomeError(msg) {
    el.homeError.textContent = msg;
    el.homeError.classList.remove('hidden');
  }

  const urlParams = new URLSearchParams(window.location.search);
  const urlRoom = urlParams.get('room');
  if (urlRoom) {
    el.inputCode.value = urlRoom.toUpperCase();
  }
  const savedName = localStorage.getItem(STORAGE_NAME);
  if (savedName) el.inputName.value = savedName;

  const savedRoom = localStorage.getItem(STORAGE_ROOM);
  const savedToken = localStorage.getItem(STORAGE_TOKEN);
  if (savedRoom && savedToken && (!urlRoom || urlRoom.toUpperCase() === savedRoom)) {
    socket.emit('join_room', { roomCode: savedRoom, name: savedName || '', token: savedToken });
  }

  document.getElementById('btn-create').onclick = () => {
    const name = el.inputName.value.trim();
    if (!name) return showHomeError('اكتب اسمك أولاً.');
    localStorage.setItem(STORAGE_NAME, name);
    el.homeError.classList.add('hidden');
    socket.emit('create_room', { name, mode: el.createMode.value });
  };

  document.getElementById('btn-join').onclick = () => {
    const name = el.inputName.value.trim();
    const code = el.inputCode.value.trim().toUpperCase();
    if (!name) return showHomeError('اكتب اسمك أولاً.');
    if (!code) return showHomeError('أدخل كود الغرفة.');
    localStorage.setItem(STORAGE_NAME, name);
    el.homeError.classList.add('hidden');
    const token = savedRoom === code ? localStorage.getItem(STORAGE_TOKEN) : null;
    socket.emit('join_room', { roomCode: code, name, token });
  };

  document.getElementById('btn-copy-link').onclick = async () => {
    if (!state) return;
    const link = `${window.location.origin}/?room=${state.roomCode}`;
    try {
      await navigator.clipboard.writeText(link);
      const btn = document.getElementById('btn-copy-link');
      btn.textContent = 'تم النسخ ✓';
      setTimeout(() => (btn.textContent = 'نسخ رابط الدعوة'), 1800);
    } catch (_) {
      prompt('انسخ الرابط التالي وأرسله لأصحابك:', link);
    }
  };

  document.getElementById('btn-leave-room').onclick = () => {
    localStorage.removeItem(STORAGE_ROOM);
    localStorage.removeItem(STORAGE_TOKEN);
    window.location.href = window.location.pathname;
  };

  el.lobbyModeSelect.onchange = () => {
    socket.emit('update_settings', { mode: el.lobbyModeSelect.value });
  };

  el.btnStartGame.onclick = () => socket.emit('start_game');
  document.getElementById('btn-play-again').onclick = () => socket.emit('start_game');
  document.getElementById('btn-back-lobby').onclick = () => socket.emit('back_to_lobby');

  document.getElementById('btn-sound').onclick = () => {
    soundEnabled = !soundEnabled;
    document.getElementById('btn-sound').textContent = soundEnabled ? '🔊' : '🔇';
  };

  document.getElementById('btn-open-settings').onclick = () => {
    if (!state) return;
    const t = state.terminology;
    document.getElementById('set-modeTrex').value = t.modeTrex;
    document.getElementById('set-modeTarneeb').value = t.modeTarneeb;
    document.getElementById('set-trumpLabel').value = t.trumpLabel;
    for (const s of ['fire', 'sun', 'moon', 'star']) {
      document.getElementById(`set-suit-${s}`).value = t.suits[s];
    }
    for (const r of [11, 12, 13, 14]) {
      document.getElementById(`set-rank-${r}`).value = t.ranks[r];
    }
    for (const c of ['no_tricks', 'no_sun', 'no_ladies', 'no_sultan', 'cascade']) {
      document.getElementById(`set-c-${c}`).value = t.contracts[c];
    }
    el.modalSettings.classList.remove('hidden');
  };
  document.getElementById('btn-close-settings').onclick = () => el.modalSettings.classList.add('hidden');
  document.getElementById('btn-save-settings').onclick = () => {
    const terminology = {
      modeTrex: document.getElementById('set-modeTrex').value,
      modeTarneeb: document.getElementById('set-modeTarneeb').value,
      trumpLabel: document.getElementById('set-trumpLabel').value,
      suits: {
        fire: document.getElementById('set-suit-fire').value,
        sun: document.getElementById('set-suit-sun').value,
        moon: document.getElementById('set-suit-moon').value,
        star: document.getElementById('set-suit-star').value
      },
      ranks: {
        11: document.getElementById('set-rank-11').value,
        12: document.getElementById('set-rank-12').value,
        13: document.getElementById('set-rank-13').value,
        14: document.getElementById('set-rank-14').value
      },
      contracts: {
        no_tricks: document.getElementById('set-c-no_tricks').value,
        no_sun: document.getElementById('set-c-no_sun').value,
        no_ladies: document.getElementById('set-c-no_ladies').value,
        no_sultan: document.getElementById('set-c-no_sultan').value,
        cascade: document.getElementById('set-c-cascade').value
      }
    };
    socket.emit('update_settings', { terminology });
    el.modalSettings.classList.add('hidden');
  };

  document.getElementById('btn-rules').onclick = () => {
    if (!state) return;
    const t = state.terminology;
    document.getElementById('rules-body').innerHTML = `
      <p><strong>1. ${t.modeTrex} (شراكة 2 ضد 2):</strong><br/>
      يبدأ صاحب <code>7 ${t.suits.fire}</code> ثم يتوالى الدور عكس عقارب الساعة. يختار صاحب المملكة أي طلب من الخمسة ويبدأ اللعب.
      <br/>• <strong>لا تُلعب:</strong> في <em>${t.contracts.no_sultan}</em> إذا كان ${t.ranks[13]} ${t.suits.fire} لوحده بدون بيته. وفي <em>${t.contracts.cascade}</em> إذا امتلك لاعب 3 اثنينات و3 من النوع الرابع. يُعاد الخلط ويختار نفس صاحب المملكة بحرية.
      <br/>• <strong>التدبيل:</strong> يضاعف حاملو ${t.ranks[12]} أو ${t.ranks[13]} ${t.suits.fire} الورقة قبل أول رمية.</p>
      <p><strong>2. ${t.modeTarneeb} (شراكة إلى 61):</strong><br/>
      • <strong>لا تُلعب:</strong> إذا لم يحمل أي لاعب أي صورة (${t.ranks[11]} / ${t.ranks[12]} / ${t.ranks[13]} / 1 ${t.ranks[14]}).
      <br/>• مزايدة من 7 إلى 13. إذا ربح الطالب يُحسب له أكلاته الفعلية والخصم صفر. إذا خسر يُخصم طلبه فقط. طلب 13 = +26 أو -26. طلب أقل من 13 وجاب 13 = +13.</p>
    `;
    el.modalRules.classList.remove('hidden');
  };
  document.getElementById('btn-close-rules').onclick = () => el.modalRules.classList.add('hidden');

  socket.on('session_assigned', ({ roomCode, token }) => {
    localStorage.setItem(STORAGE_ROOM, roomCode);
    localStorage.setItem(STORAGE_TOKEN, token);
    window.history.replaceState({}, '', `?room=${roomCode}`);
  });

  socket.on('error_msg', (msg) => {
    if (!state) showHomeError(msg);
    else alert(msg);
  });

  socket.on('room_state', (newState) => {
    const prevTurn = state?.game?.turnSeat;
    state = newState;
    if (state.status === 'lobby') {
      el.modalGameover.classList.add('hidden');
      renderLobby();
      showScreen('lobby');
    } else {
      renderGame();
      showScreen('game');
      if (state.game && state.game.turnSeat === state.mySeat && prevTurn !== state.mySeat) {
        playTone(640, 0.08);
      }
    }
  });

  function renderLobby() {
    const t = state.terminology;
    el.lobbyCode.textContent = state.roomCode;
    el.lobbyModeBadge.textContent = state.mode === 'trex' ? t.modeTrex : t.modeTarneeb;
    el.lobbyModeSelect.value = state.mode;

    const order = [0, 1, 2, 3];
    el.lobbySeats.innerHTML = order
      .map((s) => {
        const p = state.players[s];
        const teamCls = s % 2 === 0 ? 'team0' : 'team1';
        const teamName = s % 2 === 0 ? 'الفريق 1' : 'الفريق 2';
        const isMe = s === state.mySeat;
        const selectedCls = swapFirstSeat === s ? 'style="outline:2px solid #eab308"' : '';

        if (!p.name) {
          return `<div class="lobby-seat empty ${teamCls}" data-seat="${s}">
            <small>${teamName} • مقعد ${s + 1}</small>
            <strong>مقعد فارغ</strong>
            <small>اضغط للجلوس هنا</small>
          </div>`;
        }
        return `<div class="lobby-seat ${teamCls}" data-seat="${s}" ${selectedCls}>
          <small>${teamName}${p.isHost ? ' 👑' : ''}${isMe ? ' (أنت)' : ''}</small>
          <strong>${escapeHtml(p.name)}</strong>
          <small>${p.connected ? 'متصل ✓' : 'منقطع...'}</small>
        </div>`;
      })
      .join('');

    el.lobbySeats.querySelectorAll('.lobby-seat').forEach((node) => {
      node.onclick = () => {
        const target = Number(node.dataset.seat);
        const p = state.players[target];
        if (!p.name) {
          swapFirstSeat = null;
          socket.emit('move_seat', { targetSeat: target });
        } else if (state.isHost) {
          if (swapFirstSeat === null) {
            swapFirstSeat = target;
            renderLobby();
          } else {
            if (swapFirstSeat !== target) {
              socket.emit('swap_two_seats', { seatA: swapFirstSeat, seatB: target });
            }
            swapFirstSeat = null;
            renderLobby();
          }
        }
      };
    });

    const full = state.players.every((p) => p.name);
    el.hostControls.classList.toggle('hidden', !state.isHost);
    el.lobbyWaitMsg.classList.toggle('hidden', state.isHost);
    el.btnStartGame.disabled = !full;
    el.btnStartGame.textContent = full
      ? 'ابدأ المباراة الآن'
      : `بانتظار اكتمال 4 لاعبين (${state.players.filter((p) => p.name).length}/4)`;
  }

  function seatBoxHTML(seatIdx, relLabel) {
    const p = state.players[seatIdx];
    const g = state.game;
    const tags = [];
    if (g.mode === 'trex' && g.rulerSeat === seatIdx) tags.push('👑 مملكة');
    if (g.mode === 'tarneeb' && g.dealerSeat === seatIdx) tags.push('موزع');
    if (g.mode === 'tarneeb' && g.highestBidder === seatIdx && g.highestBid) tags.push(`طلب ${g.highestBid}`);

    return `
      <strong>${escapeHtml(p.name || '')}</strong>
      <small>${relLabel}${tags.length ? ' • ' + tags.join(' ') : ''}</small>
      <small>${p.cardCount} ختم</small>
    `;
  }

  function applySeatStyle(box, seatIdx) {
    const g = state.game;
    const p = state.players[seatIdx];
    box.classList.toggle('active-turn', g.turnSeat === seatIdx);
    box.classList.toggle('offline', !p.connected);
  }

  function renderGame() {
    const g = state.game;
    const t = state.terminology;
    const my = state.mySeat;
    const myTeam = my % 2;
    const oppTeam = 1 - myTeam;

    el.hudT0Label.textContent = myTeam === 0 ? 'فريقنا' : 'الخصوم';
    el.hudT1Label.textContent = myTeam === 1 ? 'فريقنا' : 'الخصوم';
    el.hudT0Score.textContent = g.scores[0];
    el.hudT1Score.textContent = g.scores[1];
    el.hudMode.textContent = g.mode === 'trex' ? t.modeTrex : t.modeTarneeb;
    el.hudRound.textContent = `جولة ${g.roundNumber}`;

    if (g.mode === 'trex') {
      el.hudContract.textContent = g.contract
        ? `${t.contracts[g.contract]} (مملكة ${g.realmsCompleted + 1}/4)`
        : `اختيار طلب (مملكة ${g.realmsCompleted + 1}/4)`;
    } else {
      if (g.trumpSuit) {
        el.hudContract.innerHTML = `${t.trumpLabel}: ${t.suits[g.trumpSuit]} | أكلات: ${g.tricksWon[myTeam]}-${g.tricksWon[oppTeam]}`;
      } else {
        el.hudContract.textContent = g.highestBid ? `أعلى طلب: ${g.highestBid}` : 'مرحلة المزايدة';
      }
    }

    if (g.banner && g.banner.text) {
      el.banner.textContent = g.banner.text;
      el.banner.className = `game-banner ${g.banner.type || 'info'}`;
    } else {
      el.banner.classList.add('hidden');
    }

    const seatBottom = my;
    const seatRight = (my + 1) % 4;
    const seatTop = (my + 2) % 4;
    const seatLeft = (my + 3) % 4;

    el.seatBottom.innerHTML = seatBoxHTML(seatBottom, 'أنت');
    el.seatRight.innerHTML = seatBoxHTML(seatRight, 'يمين');
    el.seatTop.innerHTML = seatBoxHTML(seatTop, 'شريكك');
    el.seatLeft.innerHTML = seatBoxHTML(seatLeft, 'يسار');

    applySeatStyle(el.seatBottom, seatBottom);
    applySeatStyle(el.seatRight, seatRight);
    applySeatStyle(el.seatTop, seatTop);
    applySeatStyle(el.seatLeft, seatLeft);

    el.centerTrick.classList.add('hidden');
    el.centerCascade.classList.add('hidden');
    el.centerAction.classList.add('hidden');

    if (g.phase === 'trex_choose_contract') {
      renderTrexContractPicker();
    } else if (g.phase === 'trex_doubling') {
      renderTrexDoubling();
    } else if (g.phase === 'tarneeb_bidding') {
      renderTarneebBidding();
    } else if (g.phase === 'tarneeb_choose_trump') {
      renderTarneebTrumpPicker();
    } else if (g.mode === 'trex' && g.contract === 'cascade') {
      renderCascadeBoard();
    } else if (g.currentTrick && g.currentTrick.length > 0) {
      renderTrickBoard(seatBottom, seatRight, seatTop, seatLeft);
    }

    renderMyHand();

    if (g.phase === 'match_over') {
      renderGameOver();
    } else {
      el.modalGameover.classList.add('hidden');
    }
  }

  function renderTrexContractPicker() {
    const g = state.game;
    const t = state.terminology;
    el.centerAction.classList.remove('hidden');

    if (g.rulerSeat !== state.mySeat) {
      el.centerAction.innerHTML = `<h4>بانتظار ${escapeHtml(state.players[g.rulerSeat].name)} لاختيار الطلب...</h4>`;
      return;
    }

    const hints = {
      no_tricks: '-15',
      no_sun: '-10',
      no_ladies: '-25',
      no_sultan: '-75',
      cascade: '+200..+50'
    };

    el.centerAction.innerHTML = `
      <h4>اختر طلبك من المتبقي لك:</h4>
      <div class="action-grid">
        ${g.remainingContracts
          .map(
            (c) => `<button class="action-chip" data-contract="${c}">${escapeHtml(t.contracts[c])} <small>(${hints[c]})</small></button>`
          )
          .join('')}
      </div>
    `;
    el.centerAction.querySelectorAll('[data-contract]').forEach((btn) => {
      btn.onclick = () => {
        playTone(540, 0.06);
        socket.emit('trex_choose_contract', { contract: btn.dataset.contract });
      };
    });
  }

  function renderTrexDoubling() {
    const g = state.game;
    const t = state.terminology;
    el.centerAction.classList.remove('hidden');

    if (!g.doublingPendingSeats.includes(state.mySeat)) {
      el.centerAction.innerHTML = `<h4>جاري انتظار قرار المضاعفة (التدبيل)...</h4>`;
      return;
    }

    const cards = g.myEligibleDoubleCards || [];
    const validIds = new Set(cards.map((c) => c.id));
    for (const id of [...doublingSelection]) {
      if (!validIds.has(id)) doublingSelection.delete(id);
    }

    el.centerAction.innerHTML = `
      <h4>هل تريد مضاعفة أي من هذه الأختام؟</h4>
      <div class="action-grid" style="margin-bottom:10px;">
        ${cards
          .map((c) => {
            const label = `${t.ranks[c.rank]} ${t.suits[c.suit]}`;
            const sel = doublingSelection.has(c.id) ? 'selected' : '';
            return `<button class="action-chip ${sel}" data-dbl-id="${c.id}">${escapeHtml(label)}</button>`;
          })
          .join('')}
      </div>
      <button id="btn-confirm-double" class="btn primary full-width">تأكيد وبدء اللعب</button>
    `;

    el.centerAction.querySelectorAll('[data-dbl-id]').forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.dblId;
        if (doublingSelection.has(id)) doublingSelection.delete(id);
        else doublingSelection.add(id);
        renderTrexDoubling();
      };
    });

    document.getElementById('btn-confirm-double').onclick = () => {
      const chosen = [...doublingSelection];
      doublingSelection.clear();
      socket.emit('trex_doubling_done', { doubledCardIds: chosen });
    };
  }

  function renderTarneebBidding() {
    const g = state.game;
    el.centerAction.classList.remove('hidden');

    if (g.turnSeat !== state.mySeat) {
      const curName = g.turnSeat !== null ? state.players[g.turnSeat].name : '';
      el.centerAction.innerHTML = `<h4>المزايدة (أعلى طلب: ${g.highestBid || 'لا يوجد'})</h4><p class="hint-text" style="margin:0;">الدور على ${escapeHtml(curName)}...</p>`;
      return;
    }

    const minBid = Math.max(7, g.highestBid + 1);
    const bids = [];
    for (let b = minBid; b <= 13; b++) bids.push(b);

    el.centerAction.innerHTML = `
      <h4>دورك في المزايدة (الحالي: ${g.highestBid || '-'})</h4>
      <div class="action-grid">
        ${bids.map((b) => `<button class="action-chip" data-bid="${b}">${b}</button>`).join('')}
        <button class="action-chip" style="background:#7f1d1d;" data-bid="pass">تخطي</button>
      </div>
    `;
    el.centerAction.querySelectorAll('[data-bid]').forEach((btn) => {
      btn.onclick = () => {
        playTone(580, 0.06);
        socket.emit('tarneeb_bid', { amount: btn.dataset.bid });
      };
    });
  }

  function renderTarneebTrumpPicker() {
    const g = state.game;
    const t = state.terminology;
    el.centerAction.classList.remove('hidden');

    if (g.highestBidder !== state.mySeat) {
      el.centerAction.innerHTML = `<h4>بانتظار ${escapeHtml(state.players[g.highestBidder].name)} لاختيار ${escapeHtml(t.trumpLabel)}...</h4>`;
      return;
    }

    el.centerAction.innerHTML = `
      <h4>اختر ${escapeHtml(t.trumpLabel)} (طلبك: ${g.highestBid}):</h4>
      <div class="action-grid">
        ${['fire', 'sun', 'moon', 'star']
          .map(
            (s) => `<button class="action-chip" data-trump="${s}" style="display:flex;align-items:center;gap:6px;">
              ${DeckRenderer.suitSVG(s, DeckRenderer.HOUSE_COLOR[s], 18)}
              <span>${escapeHtml(t.suits[s])}</span>
            </button>`
          )
          .join('')}
      </div>
    `;
    el.centerAction.querySelectorAll('[data-trump]').forEach((btn) => {
      btn.onclick = () => socket.emit('tarneeb_choose_trump', { suit: btn.dataset.trump });
    });
  }

  function fmtRank(r) {
    if (r === 14) return '1 (قطب)';
    return String(r);
  }

  function renderCascadeBoard() {
    const g = state.game;
    const t = state.terminology;
    el.centerCascade.classList.remove('hidden');
    el.centerCascade.innerHTML = ['fire', 'moon', 'sun', 'star']
      .map((s) => {
        const lane = g.cascadeBoard[s];
        const color = DeckRenderer.HOUSE_COLOR[s];
        const rangeText = lane ? `${fmtRank(lane.min)} ⟵ 11 ⟶ ${fmtRank(lane.max)}` : 'مغلق (يبدأ بـ 11)';
        return `
          <div class="cascade-lane">
            <div class="lane-title">
              ${DeckRenderer.suitSVG(s, color, 18)}
              <span>${escapeHtml(t.suits[s])}</span>
            </div>
            <div class="lane-range">${rangeText}</div>
          </div>
        `;
      })
      .join('');
  }

  function renderTrickBoard(seatBottom, seatRight, seatTop, seatLeft) {
    const g = state.game;
    el.centerTrick.classList.remove('hidden');

    const posMap = {
      [seatBottom]: 'pos-bottom',
      [seatRight]: 'pos-right',
      [seatTop]: 'pos-top',
      [seatLeft]: 'pos-left'
    };

    el.centerTrick.innerHTML = g.currentTrick
      .map((play) => {
        const isDbl = g.doubledCards && g.doubledCards[play.card.id] !== undefined;
        return `<div class="trick-slot ${posMap[play.seat]}">
          ${DeckRenderer.renderCardHTML(play.card, {
            mini: true,
            doubled: isDbl,
            terminology: state.terminology
          })}
        </div>`;
      })
      .join('');
  }

  function renderMyHand() {
    const g = state.game;
    const suitOrder = { fire: 0, moon: 1, sun: 2, star: 3 };
    const sorted = [...(g.myHand || [])].sort((a, b) => {
      if (suitOrder[a.suit] !== suitOrder[b.suit]) return suitOrder[a.suit] - suitOrder[b.suit];
      return a.rank - b.rank;
    });

    const isMyPlayTurn =
      g.turnSeat === state.mySeat && (g.phase === 'trex_playing' || g.phase === 'tarneeb_playing');
    const legalSet = new Set(g.legalCards || []);

    if (isMyPlayTurn && g.mode === 'trex' && g.contract === 'cascade' && legalSet.size === 0) {
      el.handActions.classList.remove('hidden');
      el.handActions.innerHTML = `<button id="btn-pass-cascade" class="btn warn">تخطي (لا يوجد ختم صالح)</button>`;
      document.getElementById('btn-pass-cascade').onclick = () => socket.emit('trex_pass');
    } else {
      el.handActions.classList.add('hidden');
      el.handActions.innerHTML = '';
    }

    el.handCards.innerHTML = sorted
      .map((card) => {
        const isLegal = isMyPlayTurn && legalSet.has(card.id);
        const isDimmed = isMyPlayTurn && !legalSet.has(card.id);
        const isDbl = g.doubledCards && g.doubledCards[card.id] !== undefined;
        return DeckRenderer.renderCardHTML(card, {
          legal: isLegal,
          dimmed: isDimmed,
          doubled: isDbl,
          terminology: state.terminology
        });
      })
      .join('');

    if (isMyPlayTurn) {
      el.handCards.querySelectorAll('.sigil-card').forEach((node) => {
        const id = node.dataset.cardId;
        if (legalSet.has(id)) {
          node.onclick = () => {
            playTone(460, 0.05);
            socket.emit('play_card', { cardId: id });
          };
        }
      });
    }
  }

  function renderGameOver() {
    const g = state.game;
    const myTeam = state.mySeat % 2;
    const titleEl = document.getElementById('gameover-title');
    if (g.winnerTeam === -1) titleEl.textContent = 'تعادل بين الفريقين!';
    else titleEl.textContent = g.winnerTeam === myTeam ? 'مبروك! فاز فريقنا!' : 'فاز الفريق المنافس!';

    document.getElementById('gameover-scores').innerHTML = `
      <div><small>${myTeam === 0 ? 'فريقنا' : 'الخصوم'}</small><br/><strong>${g.scores[0]}</strong></div>
      <div><small>${myTeam === 1 ? 'فريقنا' : 'الخصوم'}</small><br/><strong>${g.scores[1]}</strong></div>
    `;

    document.getElementById('btn-play-again').classList.toggle('hidden', !state.isHost);
    document.getElementById('btn-back-lobby').classList.toggle('hidden', !state.isHost);
    el.modalGameover.classList.remove('hidden');
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }
})();
