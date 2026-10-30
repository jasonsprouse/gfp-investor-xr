// Spoken content and tour for the NPC docent (Docent Lux).
// Facts come from the digital-golden-plates presentations. Text is written to be spoken aloud
// (numbers spelled out where a speech engine could mangle them) and is also shown as captions.
//
// A stop: { at, steps: [ {say: [lines]} | {act: 'booth:<id>:<cmd>' | 'relic:<id>:<cmd>'} | {wait: seconds} ] }
//   at: 'welcome' | 'booth:<id>' | 'relic:<cluster>' | 'helipad'

export const GREETING = [
  'Hello, I am Docent Lux.',
  'Press T for a guided tour, or walk up to any booth or relic and press H, and I will explain it.'
];

export const NOTHING_NEARBY = [
  'Walk up to a booth or a relic and press H, and I will explain it.',
  'Press T for the full tour.'
];

export const STOPS = {
  welcome: {
    at: 'welcome',
    steps: [
      { say: [
        'Welcome to the Good Faith Paradigm investor pitch.',
        'This tour covers the presentation booths, the digital relics, and the aerial transit system.',
        'Follow me. I will wait for you at each stop.'
      ] }
    ]
  },

  'booth:prismatic': {
    at: 'booth:prismatic',
    steps: [
      { say: [
        'This is the Prismatic Architecture booth. It holds a twenty slide narrated deck called The Light Over The Word.',
        'I will press play on the console.'
      ] },
      { act: 'booth:prismatic:toggle' },
      { wait: 7 },
      { act: 'booth:prismatic:toggle' },
      { say: [
        'The narration plays over each slide, and the club music lowers while it speaks. Auto advance moves to the next slide by itself.',
        'Now I will press the view button to show the full narration transcript.'
      ] },
      { act: 'booth:prismatic:view' },
      { wait: 4 },
      { act: 'booth:prismatic:view' },
      { say: ['Use previous and next to move between slides. The link button opens the original presentation online.'] }
    ]
  },

  'booth:harps': {
    at: 'booth:harps',
    steps: [
      { say: [
        'This booth presents the NFT Harps of God Raffle deck. It has sixteen slides, built from the original video and the Good Faith Paradigm research.',
        'This is the video evidence view. It shows the frame from the original presentation and what was said in it.'
      ] },
      { wait: 1.5 },
      { act: 'booth:harps:view' },
      { say: ['Now the Good Faith Paradigm synthesis view. This is the research behind that same moment.'] },
      { wait: 2.5 },
      { act: 'booth:harps:view' },
      { say: ['And now both side by side.'] },
      { wait: 2.5 },
      { act: 'booth:harps:view' },
      { say: ['Press play for the narration. It reads the same points you can see on the screen.'] }
    ]
  },

  'booth:archive': {
    at: 'booth:archive',
    steps: [
      { say: [
        'This booth is self guided. It shows the Good Faith Paradigm infographic, the Sacred Blueprint, the economics of salvation, and the Golden Plates blueprint.',
        'It runs as an automatic slide show while you stand nearby. Next and previous let you take control.'
      ] },
      { act: 'booth:archive:next' },
      { wait: 2 },
      { act: 'booth:archive:next' },
      { wait: 1 }
    ]
  },

  'booth:collector': {
    at: 'booth:collector',
    steps: [
      { say: [
        'Here are the two Harps of God digital twin NFTs, and the raffle for two ounce gold, silver and copper medallions.',
        'Each NFT gives a raffle entry and a one time pass to the Golden Plates museum tour. The link button opens the token on Rarible.'
      ] },
      { act: 'booth:collector:next' },
      { wait: 2 }
    ]
  },

  'relic:plates': {
    at: 'relic:plates',
    steps: [
      { say: [
        'These are the three Golden Plates. The plan is to cast them in solid gold, inlaid with emeralds, sapphires and diamonds.',
        'Plate one carries the multiverse proof equation. Now watch plate three.'
      ] },
      { act: 'relic:plate3:toggle' },
      { wait: 1.8 },
      { say: [
        'The Harp of God card covers the zero in one hundred dollars, and two thousand becomes two thousand and one.',
        'That echoes the two music festivals of the year two thousand and two thousand and one. Click the plate to slide the card back.'
      ] },
      { act: 'relic:plate3:toggle' },
      { wait: 1.5 }
    ]
  },

  'relic:cards': {
    at: 'relic:cards',
    steps: [
      { say: [
        'These are the Harps of God cards. Yellow is token four nine two eight five six, with the dove and seven world religions.',
        'Green is token four nine zero six four three, the cosmic harp. Click a card to flip it.'
      ] },
      { act: 'relic:yellow:flip' },
      { wait: 1.6 },
      { act: 'relic:green:flip' },
      { wait: 1.6 },
      { say: ['The buy button opens each token on Rarible.'] },
      { act: 'relic:yellow:flip' },
      { act: 'relic:green:flip' }
    ]
  },

  'relic:sphinx': {
    at: 'relic:sphinx',
    steps: [
      { say: [
        'This is the unfinished pyramid from the one dollar bill, and the Sphinx is its missing capstone.',
        'At two million miles per hour, you travel about five hundred fifty five miles every second. Watch the count.'
      ] },
      { act: 'relic:sphinx:count' },
      { wait: 4.8 },
      { say: ['Three seconds is one thousand six hundred sixty six point seven miles. Click again to lift the Sphinx.'] },
      { act: 'relic:sphinx:count' },
      { wait: 1.2 }
    ]
  },

  'relic:medals': {
    at: 'relic:medals',
    steps: [
      { say: [
        'These are the raffle prizes: two ounce gold, silver and copper medallions.',
        'The front reads In God We Trust, two thousand thirteen. The back shows four pillars and one trillion dollar. Click any coin to flip it.'
      ] },
      { act: 'relic:gold:flip' },
      { wait: 1.6 },
      { act: 'relic:gold:flip' },
      { wait: 1 }
    ]
  },

  helipad: {
    at: 'helipad',
    steps: [
      { say: [
        'From the helipad you can board the eVTOL. Stand near it and press E, or click it.',
        'It flies the skyway to Vertiport Bravo. There you can board the last mile pod and drive the promenade to the Paradigm club.'
      ] }
    ]
  },

  closing: {
    at: 'welcome',
    steps: [
      { say: ['That is the tour. Press T to start it again, or press H near any booth and I will explain it.'] }
    ]
  }
};

export const TOUR_ORDER = [
  'welcome', 'booth:prismatic', 'booth:harps', 'booth:archive', 'booth:collector',
  'relic:plates', 'relic:cards', 'relic:sphinx', 'relic:medals', 'helipad', 'closing'
];

export const RELIC_ORDER = ['relic:plates', 'relic:cards', 'relic:sphinx', 'relic:medals'];
