/**
 * Exercise library for two adjustable dumbbells (20 kg max each) plus bodyweight.
 *
 * mode:  'pair'   — two dumbbells of equal weight
 *        'single' — one dumbbell
 *        'bw'     — bodyweight only
 *        'plate'  — a single plate held or worn
 * group: legs | push | pull | core | full
 * start: rough starting weight per dumbbell (kg) by experience; null = bodyweight
 * perSide: reps (or seconds) are counted per limb, so the set is performed twice.
 *        This lives on the exercise, not on the program slot: it is a property of
 *        the movement, and a slot-level flag survived substitutions — swapping a
 *        one-arm row for a two-arm row kept "per side" set and doubled its tonnage.
 *
 * All user-facing strings stay Ukrainian — this is the app's content, not code.
 */

export const GROUPS = {
  legs: 'Ноги / сідниці',
  push: 'Жим (груди, плечі, трицепс)',
  pull: 'Тяга (спина, біцепс)',
  core: 'Кор / прес',
  full: 'Все тіло / метабол',
};

export const EXERCISES = {
  // ─────────────── LEGS ───────────────
  'goblet-squat': {
    name: 'Гоблет-присід',
    group: 'legs',
    mode: 'single',
    muscles: 'Квадрицепси, сідниці, кор',
    start: { beginner: 8, inter: 12, adv: 16 },
    cues: [
      'Тримай гантель вертикально біля грудей, лікті всередині.',
      'Опускайся до паралелі або нижче, спина рівна.',
      'Коліна йдуть у бік носків, п’яти не відриваються.',
    ],
  },
  'front-squat': {
    name: 'Присід з гантелями на плечах',
    group: 'legs',
    mode: 'pair',
    muscles: 'Квадрицепси, сідниці',
    start: { beginner: 6, inter: 10, adv: 14 },
    cues: [
      'Гантелі вертикально на передніх дельтах, лікті вперед.',
      'Корпус максимально вертикальний.',
      'Вдих вниз, видих на підйомі.',
    ],
  },
  rdl: {
    name: 'Румунська тяга',
    group: 'legs',
    mode: 'pair',
    muscles: 'Задня поверхня стегна, сідниці, спина',
    start: { beginner: 8, inter: 12, adv: 16 },
    cues: [
      'Коліна майже прямі, рух — відведення таза назад.',
      'Гантелі ковзають по стегнах, спина нейтральна.',
      'Опускайся до відчуття натягу під сідницею, не до підлоги.',
    ],
  },
  'bulgarian-split': {
    name: 'Болгарський присід',
    group: 'legs',
    mode: 'pair',
    muscles: 'Квадрицепси, сідниці, стабілізатори',
    start: { beginner: 4, inter: 8, adv: 12 },
    perSide: true,
    cues: [
      'Задня нога на стільці/дивані, ~70 см від опори.',
      'Вага на передній нозі, коліно над стопою.',
      'Нахил корпусу вперед → більше сідниці.',
    ],
  },
  'reverse-lunge': {
    name: 'Зворотні випади',
    group: 'legs',
    mode: 'pair',
    muscles: 'Сідниці, квадрицепси',
    start: { beginner: 4, inter: 8, adv: 12 },
    perSide: true,
    cues: ['Крок назад, коліно майже торкається підлоги.', 'Корпус вертикально, живіт напружений.'],
  },
  'walking-lunge': {
    name: 'Випади в ходьбі',
    group: 'legs',
    mode: 'pair',
    muscles: 'Сідниці, квадрицепси',
    start: { beginner: 4, inter: 6, adv: 10 },
    perSide: true,
    cues: ['Довгий крок, коліно задньої ноги вниз.', 'Рахуй повторення на кожну ногу.'],
  },
  'step-up': {
    name: 'Зашагування на височину',
    group: 'legs',
    mode: 'pair',
    muscles: 'Сідниці, квадрицепси',
    start: { beginner: 4, inter: 8, adv: 12 },
    perSide: true,
    cues: ['Опора 35–45 см (стілець/лавка).', 'Виштовхуйся верхньою ногою, не допомагай нижньою.'],
  },
  'hip-thrust': {
    name: 'Підйом стегон з гантеллю',
    group: 'legs',
    mode: 'single',
    muscles: 'Сідниці, задня поверхня стегна',
    start: { beginner: 10, inter: 16, adv: 20 },
    cues: [
      'Лопатки на дивані/лавці або на підлозі.',
      'Гантель на згині стегон (підклади рушник).',
      'Пауза 1 с у верхній точці, стисни сідниці.',
    ],
  },
  'sl-rdl': {
    name: 'Румунська тяга на одній нозі',
    group: 'legs',
    mode: 'single',
    muscles: 'Задня поверхня стегна, сідниці, баланс',
    start: { beginner: 6, inter: 10, adv: 14 },
    perSide: true,
    cues: ['Гантель у руці з боку робочої ноги.', 'Таз не «розкривається», плечі паралельно підлозі.'],
  },
  'calf-raise': {
    name: 'Підйом на носки',
    group: 'legs',
    mode: 'pair',
    muscles: 'Литки',
    start: { beginner: 10, inter: 16, adv: 20 },
    cues: ['Стопи на краю книги/сходинки для повної амплітуди.', 'Пауза 1 с вгорі, повільно вниз.'],
  },
  'sumo-dl': {
    name: 'Тяга сумо з гантеллю',
    group: 'legs',
    mode: 'single',
    muscles: 'Сідниці, ноги, спина',
    start: { beginner: 12, inter: 16, adv: 20 },
    cues: ['Широка стійка, гантель між ногами вертикально.', 'Штовхай підлогу ногами, спина рівна.'],
  },
  'wall-sit': {
    name: 'Присід у стіни (статика)',
    group: 'legs',
    mode: 'bw',
    muscles: 'Квадрицепси',
    start: null,
    cues: ['Стегна паралельно підлозі, спина щільно до стіни.', 'Час — у секундах.'],
  },

  // ─────────────── PUSH ───────────────
  'floor-press': {
    name: 'Жим з підлоги',
    group: 'push',
    mode: 'pair',
    muscles: 'Груди, трицепс, плечі',
    start: { beginner: 8, inter: 12, adv: 16 },
    cues: [
      'Лежачи на підлозі, лікті ~45° до корпусу.',
      'Трицепси торкаються підлоги — це нижня точка.',
      'Без інерції: пауза внизу 0,5 с.',
    ],
  },
  'squeeze-press': {
    name: 'Жим з зведенням гантелей',
    group: 'push',
    mode: 'pair',
    muscles: 'Груди (внутрішня частина)',
    start: { beginner: 6, inter: 10, adv: 14 },
    cues: ['Гантелі щільно притиснуті одна до одної весь підхід.', 'Дави їх разом — це і є навантаження.'],
  },
  'narrow-floor-press': {
    name: 'Вузький жим з підлоги',
    group: 'push',
    mode: 'pair',
    muscles: 'Трицепс, груди',
    start: { beginner: 6, inter: 10, adv: 14 },
    cues: ['Лікті близько до корпусу.', 'Опускай до легкого дотику трицепсів підлоги.'],
  },
  ohp: {
    name: 'Жим над головою стоячи',
    group: 'push',
    mode: 'pair',
    muscles: 'Плечі, трицепс, кор',
    start: { beginner: 6, inter: 10, adv: 14 },
    cues: [
      'Стисни сідниці й прес, щоб не вигинати поясницю.',
      'Гантелі йдуть по прямій, вгорі — біцепс біля вуха.',
    ],
  },
  arnold: {
    name: 'Жим Арнольда',
    group: 'push',
    mode: 'pair',
    muscles: 'Плечі (усі пучки)',
    start: { beginner: 4, inter: 8, adv: 12 },
    cues: ['Старт — долоні до себе, під час жиму розворот назовні.', 'Темп повільний, без ривків.'],
  },
  'lateral-raise': {
    name: 'Розведення в сторони',
    group: 'push',
    mode: 'pair',
    muscles: 'Середня дельта',
    start: { beginner: 2, inter: 6, adv: 8 },
    cues: ['Легкий нахил корпусу, лікті трохи зігнуті.', 'Підйом до рівня плечей, не вище. Без розкачки.'],
  },
  'front-raise': {
    name: 'Підйом перед собою',
    group: 'push',
    mode: 'pair',
    muscles: 'Передня дельта',
    start: { beginner: 2, inter: 6, adv: 8 },
    cues: ['Підйом до рівня очей, лікті майже прямі.'],
  },
  pushup: {
    name: 'Віджимання',
    group: 'push',
    mode: 'bw',
    muscles: 'Груди, трицепс, кор',
    start: null,
    cues: ['Тіло — пряма лінія, лікті під 45°.', 'Легше: з колін. Складніше: ноги на дивані.'],
  },
  'pushup-on-db': {
    name: 'Віджимання з упором на гантелі',
    group: 'push',
    mode: 'bw',
    muscles: 'Груди (глибока амплітуда)',
    start: null,
    cues: ['Гантелі як упори — груди опускаються нижче рівня рук.', 'Гантелі стоять стабільно, шестикутні краї вниз.'],
  },
  'pushup-weighted': {
    name: 'Віджимання з блином на спині',
    group: 'push',
    mode: 'plate',
    muscles: 'Груди, трицепс',
    start: { beginner: 4, inter: 8, adv: 12 },
    cues: ['Блин між лопатками (попроси покласти або став обережно).', 'Кор напружений, таз не провисає.'],
  },
  'bench-dip': {
    name: 'Віджимання від опори назад',
    group: 'push',
    mode: 'bw',
    muscles: 'Трицепс, груди',
    start: null,
    cues: ['Руки на дивані за спиною, ноги вперед.', 'Опускайся до 90° у лікті, лікті назад.'],
  },
  pullover: {
    name: 'Пулловер',
    group: 'push',
    mode: 'single',
    muscles: 'Груди, найширші, зубчасті',
    start: { beginner: 8, inter: 12, adv: 16 },
    cues: ['Лежачи, гантель прямими руками над грудьми.', 'Заводь за голову до натягу, лікті майже прямі.'],
  },
  kickback: {
    name: 'Розгинання рук у нахилі',
    group: 'push',
    mode: 'pair',
    muscles: 'Трицепс',
    start: { beginner: 2, inter: 6, adv: 8 },
    cues: ['Плече паралельно корпусу і не рухається.', 'Пауза у випрямленій позиції 1 с.'],
  },
  'overhead-ext': {
    name: 'Французький жим над головою',
    group: 'push',
    mode: 'single',
    muscles: 'Трицепс (довга голівка)',
    start: { beginner: 6, inter: 10, adv: 14 },
    cues: ['Гантель двома руками за голову, лікті вузько.', 'Не розводь лікті в сторони.'],
  },

  // ─────────────── PULL ───────────────
  'bent-row': {
    name: 'Тяга в нахилі двома гантелями',
    group: 'pull',
    mode: 'pair',
    muscles: 'Спина, задня дельта, біцепс',
    start: { beginner: 8, inter: 12, adv: 16 },
    cues: [
      'Нахил ~45°, спина нейтральна, погляд у підлогу.',
      'Тягни лікті назад до кишень, зводь лопатки.',
      'Без розгинання корпусу — це не ривок.',
    ],
  },
  'one-arm-row': {
    name: 'Тяга однією рукою',
    group: 'pull',
    mode: 'single',
    muscles: 'Найширші, ромбовидні, біцепс',
    start: { beginner: 10, inter: 16, adv: 20 },
    perSide: true,
    cues: ['Упор рукою в диван, спина паралельно підлозі.', 'Тягни до пояса, лікоть вздовж тіла.'],
  },
  'renegade-row': {
    name: 'Тяга в упорі лежачи',
    group: 'pull',
    mode: 'pair',
    muscles: 'Спина, кор, плечі',
    start: { beginner: 6, inter: 10, adv: 14 },
    perSide: true,
    cues: ['Упор на гантелі, ноги ширше для стабільності.', 'Таз не крутиться — це головне.'],
  },
  'gorilla-row': {
    name: 'Горила-тяга',
    group: 'pull',
    mode: 'pair',
    muscles: 'Спина, біцепс',
    start: { beginner: 10, inter: 14, adv: 18 },
    perSide: true,
    cues: ['Гантелі на підлозі між стопами, нахил як у сумо.', 'Тягни поперемінно, друга гантель — опора.'],
  },
  'high-pull': {
    name: 'Високе протягування',
    group: 'pull',
    mode: 'pair',
    muscles: 'Трапеції, задня дельта',
    start: { beginner: 4, inter: 8, adv: 12 },
    cues: ['Різкий підйом ліктями вгору до рівня плечей.', 'Гантелі близько до корпусу.'],
  },
  'reverse-fly': {
    name: 'Розведення в нахилі',
    group: 'pull',
    mode: 'pair',
    muscles: 'Задня дельта, ромбовидні',
    start: { beginner: 2, inter: 4, adv: 6 },
    cues: ['Нахил 45°, руки майже прямі.', 'Веди мізинцями вгору, без інерції.'],
  },
  shrug: {
    name: 'Шраги',
    group: 'pull',
    mode: 'pair',
    muscles: 'Трапеції',
    start: { beginner: 12, inter: 16, adv: 20 },
    cues: ['Тільки підйом плечей вгору, без обертання.', 'Пауза вгорі 1 с.'],
  },
  curl: {
    name: 'Підйом на біцепс',
    group: 'pull',
    mode: 'pair',
    muscles: 'Біцепс',
    start: { beginner: 4, inter: 8, adv: 12 },
    cues: ['Лікті притиснуті до корпусу.', 'Повільне опускання 2–3 с.'],
  },
  'hammer-curl': {
    name: 'Молоток',
    group: 'pull',
    mode: 'pair',
    muscles: 'Біцепс, брахіаліс, передпліччя',
    start: { beginner: 4, inter: 8, adv: 12 },
    cues: ['Нейтральний хват (долоні одна до одної).', 'Без розкачки корпусом.'],
  },
  'conc-curl': {
    name: 'Концентрований підйом',
    group: 'pull',
    mode: 'single',
    muscles: 'Біцепс (пік)',
    start: { beginner: 6, inter: 10, adv: 14 },
    perSide: true,
    cues: ['Сидячи, лікоть в упорі на внутрішній стороні стегна.', 'Максимальне скорочення вгорі.'],
  },

  // ─────────────── CORE ───────────────
  plank: {
    name: 'Планка',
    group: 'core',
    mode: 'bw',
    muscles: 'Прес, кор',
    start: null,
    cues: ['Лікті під плечима, таз підкручений.', 'Час — у секундах, дихай рівно.'],
  },
  'side-plank': {
    name: 'Бокова планка',
    group: 'core',
    mode: 'bw',
    muscles: 'Косі м’язи',
    start: null,
    perSide: true,
    cues: ['Тіло пряме, таз високо.', 'Час на кожну сторону.'],
  },
  'suitcase-carry': {
    name: 'Перенос валізи',
    group: 'core',
    mode: 'single',
    muscles: 'Косі, кор, хват',
    start: { beginner: 12, inter: 16, adv: 20 },
    perSide: true,
    cues: ['Гантель в одній руці, корпус не хилиться.', 'Час або кроки на кожну сторону.'],
  },
  'farmer-walk': {
    name: 'Прогулянка фермера',
    group: 'core',
    mode: 'pair',
    muscles: 'Хват, кор, трапеції',
    start: { beginner: 12, inter: 16, adv: 20 },
    cues: ['Дві гантелі, плечі назад, крок короткий.', 'Час — у секундах.'],
  },
  'russian-twist': {
    name: 'Російські скручування',
    group: 'core',
    mode: 'single',
    muscles: 'Косі м’язи',
    start: { beginner: 4, inter: 8, adv: 10 },
    perSide: true,
    cues: ['Сидячи, корпус відкинутий назад ~45°.', 'Оберт від грудей, не тільки руками.'],
  },
  'dead-bug': {
    name: 'Мертвий жук',
    group: 'core',
    mode: 'bw',
    muscles: 'Глибокий прес',
    start: null,
    cues: ['Поясниця щільно до підлоги весь час.', 'Протилежна рука-нога, повільно.'],
  },
  'hollow-hold': {
    name: 'Порожнє тіло (статика)',
    group: 'core',
    mode: 'bw',
    muscles: 'Прес',
    start: null,
    cues: ['Лопатки й ноги відірвані, поясниця притиснута.', 'Легше — підтягни коліна.'],
  },
  'leg-raise': {
    name: 'Підйом ніг лежачи',
    group: 'core',
    mode: 'bw',
    muscles: 'Низ пресу',
    start: null,
    cues: ['Руки під сідницями, поясниця не вигинається.', 'Опускай ноги повільно.'],
  },
  'side-bend': {
    name: 'Нахили в сторони',
    group: 'core',
    mode: 'single',
    muscles: 'Косі м’язи',
    start: { beginner: 10, inter: 14, adv: 20 },
    perSide: true,
    cues: ['Гантель в одній руці, нахил строго в площині.', 'Без обертання корпусу.'],
  },
  windmill: {
    name: 'Млинок',
    group: 'core',
    mode: 'single',
    muscles: 'Косі, плечі, гнучкість',
    start: { beginner: 4, inter: 8, adv: 12 },
    perSide: true,
    cues: ['Гантель вгорі на прямій руці, погляд на неї.', 'Тягнись вільною рукою до стопи.'],
  },

  // ─────────────── METABOLIC / HIIT ───────────────
  thruster: {
    name: 'Трастер',
    group: 'full',
    mode: 'pair',
    muscles: 'Все тіло',
    start: { beginner: 4, inter: 8, adv: 12 },
    cues: ['Присід → вибуховий підйом → жим над головою одним рухом.', 'Дихай на кожному повторенні.'],
  },
  'db-swing': {
    name: 'Махи гантеллю',
    group: 'full',
    mode: 'single',
    muscles: 'Сідниці, спина, кардіо',
    start: { beginner: 8, inter: 12, adv: 16 },
    cues: ['Рух від таза, не присід. Гантель по дузі до рівня грудей.', 'Спина нейтральна весь час.'],
  },
  'clean-press': {
    name: 'Взяття на груди + жим',
    group: 'full',
    mode: 'pair',
    muscles: 'Все тіло',
    start: { beginner: 4, inter: 8, adv: 12 },
    cues: ['Тяга → підрив → лікті швидко вперед → жим.', 'Опускай контрольовано.'],
  },
  'db-snatch': {
    name: 'Ривок однією рукою',
    group: 'full',
    mode: 'single',
    muscles: 'Все тіло, кардіо',
    start: { beginner: 6, inter: 10, adv: 14 },
    cues: ['З підлоги в одну фазу над голову.', 'Чергуй руки, техніка важливіша за вагу.'],
  },
  'man-maker': {
    name: 'Мен-мейкер',
    group: 'full',
    mode: 'pair',
    muscles: 'Все тіло',
    start: { beginner: 4, inter: 6, adv: 10 },
    cues: ['Віджимання → тяга кожною рукою → взяття → жим.', 'Це 1 повторення. Дуже витратно.'],
  },
  'push-press': {
    name: 'Швунг жимовий',
    group: 'full',
    mode: 'pair',
    muscles: 'Плечі, ноги',
    start: { beginner: 6, inter: 10, adv: 14 },
    cues: ['Короткий підсід ногами → жим над головою.', 'Дозволяє більшу вагу, ніж строгий жим.'],
  },
  burpee: {
    name: 'Берпі',
    group: 'full',
    mode: 'bw',
    muscles: 'Все тіло, кардіо',
    start: null,
    cues: ['Присід → упор → віджимання → стрибок.', 'Полегшення: без віджимання й без стрибка.'],
  },
  'mountain-climber': {
    name: 'Скелелаз',
    group: 'full',
    mode: 'bw',
    muscles: 'Кор, кардіо',
    start: null,
    cues: ['Таз низько, темп швидкий.', 'Час — у секундах.'],
  },
  'high-knees': {
    name: 'Біг на місці з високим підйомом колін',
    group: 'full',
    mode: 'bw',
    muscles: 'Кардіо',
    start: null,
    cues: ['Коліна до рівня таза, руки працюють.'],
  },
  'jump-squat': {
    name: 'Присід зі стрибком',
    group: 'full',
    mode: 'bw',
    muscles: 'Ноги, кардіо',
    start: null,
    cues: ['М’яка посадка на всю стопу, коліна пружинять.', 'Болять коліна — заміни на швидкі присіди.'],
  },
  'devils-press': {
    name: 'Дияволський жим',
    group: 'full',
    mode: 'single',
    muscles: 'Все тіло',
    start: { beginner: 6, inter: 10, adv: 14 },
    cues: ['Берпі з гантеллю → махом над голову.', 'Найважчий рух у списку — стеж за спиною.'],
  },
};

/** Warm-up performed before every strength session. */
export const WARMUP = [
  { name: 'Швидка хода / біг на місці', detail: '2 хв, підняти пульс' },
  { name: 'Обертання руками вперед-назад', detail: '20 в кожну сторону' },
  { name: 'Обертання тазом і корпусом', detail: '10 в кожну сторону' },
  { name: 'Присіди без ваги', detail: '15 повторень' },
  { name: 'Випади з обертом корпусу', detail: '6 на кожну ногу' },
  { name: 'Кіт-корова + місток', detail: '10 повторень' },
  { name: 'Розминкові підходи', detail: 'Перша вправа з грифом або 50% ваги ×10' },
];

/** Cool-down and stretching. */
export const COOLDOWN = [
  { name: 'Розтяжка задньої поверхні стегна', detail: '40 с на ногу' },
  { name: 'Розтяжка квадрицепса', detail: '30 с на ногу' },
  { name: 'Розтяжка грудей у дверях', detail: '40 с' },
  { name: 'Поза дитини + скручування лежачи', detail: '60 с' },
  { name: 'Дихання 4-7-8', detail: '5 циклів — знижує пульс' },
];

export function ex(id) {
  const e = EXERCISES[id];
  if (!e) throw new Error(`Невідома вправа: ${id}`);
  return { id, ...e };
}

export function allExercises() {
  return Object.keys(EXERCISES).map(ex);
}
