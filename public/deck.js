ممتاز جداً! بقي ملفان فقط وتخلص مرحلة GitHub! 👏

الملف (5 من 6): deck.js (تصميم البطاقات والرموز الأصلية)

1.  من نفس شاشتك داخل مجلد public، اضغط Add file ← Create new file.
2.  إذا مكتوب قبل الخانة majlis-game / public /، انسخ والصق في الخانة: deck.js
    (وإذا مكتوب فقط majlis-game /، اكتب public/deck.js).
3.  الصق هذا الكود بالكامل:

// مولّد الأختام الـ 52 الأصلية برسومات SVG هندسية خالصة
(function (global) {
  const HOUSE_COLOR = {
    fire: '#C81E32', // أحمر ياقوتي موحّد (النار + الشمس)
    sun: '#C81E32',
    moon: '#172554', // كحلي عميق موحّد (القمر + النجم)
    star: '#172554'
  };

  function suitSVG(suit, color, size = 20) {
    if (suit === 'fire') {
      // شعلة هندسية
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}">
        <path d="M12 2C12 2 18 7.5 18 13.5C18 17.6 15.3 21 12 21C8.7 21 6 17.6 6 13.5C6 10.6 7.8 8.1 9.4 6.5C9.2 8.7 10.3 9.8 11.1 10.2C10.5 7.4 12 2 12 2ZM12 18.5C13.6 18.5 14.8 17.1 14.8 15.2C14.8 13.8 13.9 12.6 12.8 11.7C12.7 13.1 11.8 13.9 11 14.2C11.4 13 10.9 11.9 10.9 11.9C9.8 12.9 9.2 14.1 9.2 15.2C9.2 17.1 10.4 18.5 12 18.5Z"/>
      </svg>`;
    }
    if (suit === 'sun') {
      // شمس مثمّنة الأشعة
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}">
        <circle cx="12" cy="12" r="4.8"/>
        <path d="M12 1.5L13.5 5.2H10.5L12 1.5ZM12 22.5L10.5 18.8H13.5L12 22.5ZM1.5 12L5.2 10.5V13.5L1.5 12ZM22.5 12L18.8 13.5V10.5L22.5 12ZM4.6 4.6L8.2 6.2L6.2 8.2L4.6 4.6ZM19.4 19.4L15.8 17.8L17.8 15.8L19.4 19.4ZM19.4 4.6L17.8 8.2L15.8 6.2L19.4 4.6ZM4.6 19.4L6.2 15.8L8.2 17.8L4.6 19.4Z"/>
      </svg>`;
    }
    if (suit === 'moon') {
      // هلال حاد أنيق
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}">
        <path d="M15.8 3.2C11.1 3.7 7.4 7.7 7.4 12.5C7.4 17.3 11.1 21.3 15.8 21.8C11.3 22.8 6.4 20.4 4.6 16C2.7 11.4 4.6 6.1 9 4C11.2 3 13.6 2.7 15.8 3.2ZM16.8 6.5L17.6 8.3L19.4 9.1L17.6 9.9L16.8 11.7L16 9.9L14.2 9.1L16 8.3L16.8 6.5Z"/>
      </svg>`;
    }
    // نجمة رباعية حادة
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}">
      <path d="M12 1.5L14.6 9.4L22.5 12L14.6 14.6L12 22.5L9.4 14.6L1.5 12L9.4 9.4L12 1.5Z"/>
    </svg>`;
  }

  // 11: فارس (سيفان متقاطعان)
  function knightSVG(color) {
    return `<svg width="34" height="34" viewBox="0 0 48 48" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10 38L36 12M36 12L38 8L34 10M13 30L18 35M8 40L12 36" />
      <path d="M38 38L12 12M12 12L10 8L14 10M35 30L30 35M40 40L36 36" />
    </svg>`;
  }

  // 12: سيدة (قلادة / بروش ملكي بيضاوي مرصّع بجوهرة)
  function ladySVG(color) {
    return `<svg width="34" height="34" viewBox="0 0 48 48" fill="none">
      <path d="M14 10C18 16 30 16 34 10" stroke="${color}" stroke-width="2.4" stroke-linecap="round"/>
      <circle cx="24" cy="14" r="2.2" fill="${color}"/>
      <ellipse cx="24" cy="27" rx="9" ry="12" stroke="${color}" stroke-width="2.4" fill="none"/>
      <path d="M24 19L29 27L24 35L19 27Z" fill="${color}"/>
      <circle cx="24" cy="41.5" r="2.2" fill="${color}"/>
    </svg>`;
  }

  // 13: سلطان (تاج ملكي ضخم)
  function sultanSVG(color) {
    return `<svg width="36" height="36" viewBox="0 0 48 48" fill="${color}">
      <path d="M6 34L4 14L15 23L24 10L33 23L44 14L42 34H6Z"/>
      <rect x="7" y="36" width="34" height="4.5" rx="2"/>
      <circle cx="24" cy="7.5" r="2.5"/>
      <circle cx="4.5" cy="11.5" r="2"/>
      <circle cx="43.5" cy="11.5" r="2"/>
    </svg>`;
  }

  const PIP_POSITIONS = {
    2: [[50, 24], [50, 76]],
    3: [[50, 20], [50, 50], [50, 80]],
    4: [[32, 24], [68, 24], [32, 76], [68, 76]],
    5: [[32, 22], [68, 22], [50, 50], [32, 78], [68, 78]],
    6: [[32, 20], [68, 20], [32, 50], [68, 50], [32, 80], [68, 80]],
    7: [[32, 18], [68, 18], [50, 34], [32, 52], [68, 52], [32, 82], [68, 82]],
    8: [[32, 18], [68, 18], [50, 34], [32, 50], [68, 50], [50, 66], [32, 82], [68, 82]],
    9: [[30, 16], [70, 16], [30, 38], [70, 38], [50, 50], [30, 62], [70, 62], [30, 84], [70, 84]],
    10: [[30, 16], [70, 16], [50, 27], [30, 39], [70, 39], [30, 61], [70, 61], [50, 73], [30, 84], [70, 84]]
  };

  function centerContentHTML(card, color, terminology) {
    if (card.rank === 14) {
      return `
        <div style="border:2px solid ${color}33; border-radius:50%; padding:6px; display:flex; align-items:center; justify-content:center;">
          ${suitSVG(card.suit, color, 34)}
        </div>
      `;
    }
    if (card.rank === 11) {
      return `${knightSVG(color)}<div class="card-role">${terminology.ranks[11]}</div>`;
    }
    if (card.rank === 12) {
      return `${ladySVG(color)}<div class="card-role">${terminology.ranks[12]}</div>`;
    }
    if (card.rank === 13) {
      return `${sultanSVG(color)}<div class="card-role">${terminology.ranks[13]}</div>`;
    }

    const pts = PIP_POSITIONS[card.rank] || [];
    const pips = pts
      .map(
        ([x, y]) =>
          `<div style="position:absolute; left:${x}%; top:${y}%; transform:translate(-50%,-50%); line-height:0;">
            ${suitSVG(card.suit, color, 10)}
          </div>`
      )
      .join('');
    return `<div style="position:relative; width:100%; height:100%;">${pips}</div>`;
  }

  function renderCardHTML(card, options = {}) {
    const {
      mini = false,
      legal = false,
      dimmed = false,
      doubled = false,
      terminology = { ranks: { 11: 'فارِس', 12: 'سَيّدة', 13: 'سُلطان', 14: 'القُطب' } }
    } = options;

    const color = HOUSE_COLOR[card.suit];
    const displayNum = card.rank === 14 ? '1' : String(card.rank);
    const classes = ['sigil-card'];
    if (mini) classes.push('mini');
    if (legal) classes.push('legal');
    if (dimmed) classes.push('dimmed');
    if (doubled) classes.push('doubled-badge');

    return `
      <div class="${classes.join(' ')}" data-card-id="${card.id}" style="color:${color};">
        <div class="card-corner top">
          <span class="card-num">${displayNum}</span>
          ${suitSVG(card.suit, color, 11)}
        </div>
        <div class="card-center">
          ${centerContentHTML(card, color, terminology)}
        </div>
        <div class="card-corner bottom">
          <span class="card-num">${displayNum}</span>
          ${suitSVG(card.suit, color, 11)}
        </div>
      </div>
    `;
  }

  global.DeckRenderer = {
    suitSVG,
    HOUSE_COLOR,
    renderCardHTML
  };
})(window);

4.  اضغط Commit changes... ثم Commit changes للحفظ.

(قل لي "تم 5" عشان أعطيك آخر ملف app.js وبعده مباشرة نطلع الرابط على Render!)
