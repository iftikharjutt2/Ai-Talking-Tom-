export type GameShellState = 'title' | 'playing' | 'paused' | 'gameover';

export type TomEmotion =
  | 'happy'
  | 'curious'
  | 'excited'
  | 'laughing'
  | 'thinking'
  | 'sleepy'
  | 'surprised'
  | 'proud'
  | 'sassy';

export type TomPersonaId = 'witty_bestie' | 'wise_professor' | 'cozy_storyteller' | 'dramatic_poet';

export type StageEnvironmentId = 'living_room' | 'bedroom' | 'garden';

export type TimeOfDayId = 'morning' | 'day' | 'sunset' | 'night';

export type Stage3DEffectId = 'cinema_depth' | 'hologram_prism' | 'studio_spotlight';

export interface Stage3DEffectConfig {
  id: Stage3DEffectId;
  label: string;
  subtitle: string;
  parallaxStrength: number;
  godRaysIntensity: number;
  floorReflectionAlpha: number;
  hologramRings: boolean;
}

export const STAGE_3D_EFFECTS: Stage3DEffectConfig[] = [
  {
    id: 'cinema_depth',
    label: 'Cinema 3D',
    subtitle: 'Volumetric God-Rays & Deep Parallax',
    parallaxStrength: 1.0,
    godRaysIntensity: 0.85,
    floorReflectionAlpha: 0.22,
    hologramRings: false,
  },
  {
    id: 'hologram_prism',
    label: 'Holo-Prism 3D',
    subtitle: '3D Soundwave Rings & Cyber Pedestal',
    parallaxStrength: 1.25,
    godRaysIntensity: 0.65,
    floorReflectionAlpha: 0.35,
    hologramRings: true,
  },
  {
    id: 'studio_spotlight',
    label: 'Stage Mirror 3D',
    subtitle: '3D Mirror Floor & Dual Spotlights',
    parallaxStrength: 1.1,
    godRaysIntensity: 1.0,
    floorReflectionAlpha: 0.48,
    hologramRings: false,
  },
];

export function getNext3DEffect(current: Stage3DEffectId): Stage3DEffectId {
  const idx = STAGE_3D_EFFECTS.findIndex((e) => e.id === current);
  if (idx === -1) return 'cinema_depth';
  return STAGE_3D_EFFECTS[(idx + 1) % STAGE_3D_EFFECTS.length].id;
}

export interface Projected3DPoint {
  screenX: number;
  screenY: number;
  scale: number;
  depthAlpha: number;
}

/**
 * Projects a 3D world coordinate (x, y, z) relative to viewport center (centerX, centerY)
 * with camera yaw/pitch rotation and perspective focal length.
 * Positive Z is closer to the viewer; negative Z is deeper into the room.
 */
export function project3DPoint(
  x: number,
  y: number,
  z: number,
  centerX: number,
  centerY: number,
  cameraYaw: number,
  cameraPitch: number,
  focalLength = 520
): Projected3DPoint {
  const cosY = Math.cos(cameraYaw);
  const sinY = Math.sin(cameraYaw);
  const cosP = Math.cos(cameraPitch);
  const sinP = Math.sin(cameraPitch);

  // Rotate around Y (yaw)
  const rx = x * cosY + z * sinY;
  const rz1 = -x * sinY + z * cosY;

  // Rotate around X (pitch)
  const ry = y * cosP - rz1 * sinP;
  const rz = y * sinP + rz1 * cosP;

  // Clamp denominator so objects behind camera never invert
  const effectiveDepth = Math.max(120, focalLength - rz);
  const scale = focalLength / effectiveDepth;

  const screenX = centerX + rx * scale;
  const screenY = centerY + ry * scale;
  const depthAlpha = Math.max(0.15, Math.min(1, (rz + 220) / 360));

  return {
    screenX,
    screenY,
    scale,
    depthAlpha,
  };
}

export interface Character3DLayerOffsets {
  cameraYaw: number;
  cameraPitch: number;
  tailOffsetX: number;
  tailOffsetY: number;
  earsOffsetX: number;
  earsOffsetY: number;
  torsoOffsetX: number;
  torsoOffsetY: number;
  headOffsetX: number;
  headOffsetY: number;
  muzzleOffsetX: number;
  muzzleOffsetY: number;
  pawsOffsetX: number;
  pawsOffsetY: number;
  rimShiftX: number;
  rimShiftY: number;
}

/**
 * Computes multi-layer 3D parallax displacements for Tom's anatomical parts
 * based on normalized pointer gaze (-1..1) and active 3D effect preset.
 */
export function computeCharacter3DOffsets(
  gazeX: number,
  gazeY: number,
  effectId: Stage3DEffectId
): Character3DLayerOffsets {
  const cfg = STAGE_3D_EFFECTS.find((e) => e.id === effectId) || STAGE_3D_EFFECTS[0];
  const s = cfg.parallaxStrength;
  const cameraYaw = gazeX * 0.28 * s;
  const cameraPitch = gazeY * 0.22 * s;

  return {
    cameraYaw,
    cameraPitch,
    tailOffsetX: -gazeX * 14 * s,
    tailOffsetY: -gazeY * 8 * s,
    earsOffsetX: -gazeX * 7 * s,
    earsOffsetY: -gazeY * 5 * s,
    torsoOffsetX: gazeX * 4 * s,
    torsoOffsetY: gazeY * 3 * s,
    headOffsetX: gazeX * 11 * s,
    headOffsetY: gazeY * 7 * s,
    muzzleOffsetX: gazeX * 18 * s,
    muzzleOffsetY: gazeY * 11 * s,
    pawsOffsetX: gazeX * 13 * s,
    pawsOffsetY: gazeY * 8 * s,
    rimShiftX: -gazeX * 9 * s,
    rimShiftY: -gazeY * 6 * s,
  };
}

export interface StageEnvironmentConfig {
  id: StageEnvironmentId;
  label: string;
  subtitle: string;
}

export const STAGE_ENVIRONMENTS: StageEnvironmentConfig[] = [
  {
    id: 'living_room',
    label: 'Living Room',
    subtitle: 'Cozy Studio & Bookshelf',
  },
  {
    id: 'bedroom',
    label: 'Bedroom',
    subtitle: 'Plush Bed & Nightstand Lamp',
  },
  {
    id: 'garden',
    label: 'Garden',
    subtitle: 'Sunny Patio & Blooming Flowers',
  },
];

export const TIME_OF_DAY_ORDER: TimeOfDayId[] = ['morning', 'day', 'sunset', 'night'];

export interface CharacterLightingParams {
  timeOfDay: TimeOfDayId;
  label: string;
  ambientBrightness: number; // 0.65 .. 1.1
  furHighlightHex: string;
  furMidHex: string;
  furShadowHex: string;
  bellyHex: string;
  rimLightColor: string;
  rimLightAlpha: number;
  ambientTintRgba: string;
  spotlightRgba: string;
  shadowAlpha: number;
  shadowOffsetX: number;
  lightSourceAngle: number; // radians
}

export function getNextEnvironment(current: StageEnvironmentId): StageEnvironmentId {
  const idx = STAGE_ENVIRONMENTS.findIndex((e) => e.id === current);
  if (idx === -1) return 'living_room';
  return STAGE_ENVIRONMENTS[(idx + 1) % STAGE_ENVIRONMENTS.length].id;
}

export function getNextTimeOfDay(current: TimeOfDayId): TimeOfDayId {
  const idx = TIME_OF_DAY_ORDER.indexOf(current);
  if (idx === -1) return 'day';
  return TIME_OF_DAY_ORDER[(idx + 1) % TIME_OF_DAY_ORDER.length];
}

export function detectTimeOfDayFromHour(hour24: number): TimeOfDayId {
  const h = ((hour24 % 24) + 24) % 24;
  if (h >= 6 && h < 11) return 'morning';
  if (h >= 11 && h < 17) return 'day';
  if (h >= 17 && h < 20) return 'sunset';
  return 'night';
}

/**
 * Computes character lighting & shading parameters based on time of day and environment.
 */
export function computeCharacterLighting(
  timeOfDay: TimeOfDayId,
  environment: StageEnvironmentId
): CharacterLightingParams {
  const isOutdoor = environment === 'garden';

  switch (timeOfDay) {
    case 'morning':
      return {
        timeOfDay: 'morning',
        label: 'Morning Glow',
        ambientBrightness: isOutdoor ? 1.02 : 0.96,
        furHighlightHex: '#E2E8F0',
        furMidHex: '#94A3B8',
        furShadowHex: '#64748B',
        bellyHex: '#F8FAFC',
        rimLightColor: '#FDE68A',
        rimLightAlpha: 0.55,
        ambientTintRgba: 'rgba(253, 186, 116, 0.10)',
        spotlightRgba: 'rgba(254, 240, 138, 0.22)',
        shadowAlpha: 0.34,
        shadowOffsetX: -18,
        lightSourceAngle: -0.65,
      };
    case 'day':
      return {
        timeOfDay: 'day',
        label: 'Bright Daylight',
        ambientBrightness: isOutdoor ? 1.1 : 1.02,
        furHighlightHex: '#F1F5F9',
        furMidHex: '#94A3B8',
        furShadowHex: '#64748B',
        bellyHex: '#FFFFFF',
        rimLightColor: '#FEF9C3',
        rimLightAlpha: 0.65,
        ambientTintRgba: 'rgba(254, 249, 195, 0.08)',
        spotlightRgba: 'rgba(255, 255, 255, 0.24)',
        shadowAlpha: 0.4,
        shadowOffsetX: 0,
        lightSourceAngle: 0,
      };
    case 'sunset':
      return {
        timeOfDay: 'sunset',
        label: 'Golden Sunset',
        ambientBrightness: 0.9,
        furHighlightHex: '#FED7AA',
        furMidHex: '#9A8C98',
        furShadowHex: '#5C5470',
        bellyHex: '#FFEDD5',
        rimLightColor: '#FB923C',
        rimLightAlpha: 0.78,
        ambientTintRgba: 'rgba(249, 115, 22, 0.16)',
        spotlightRgba: 'rgba(251, 146, 60, 0.25)',
        shadowAlpha: 0.46,
        shadowOffsetX: 22,
        lightSourceAngle: 0.72,
      };
    case 'night':
    default:
      return {
        timeOfDay: 'night',
        label: 'Starlit Night',
        ambientBrightness: isOutdoor ? 0.74 : 0.82,
        furHighlightHex: '#CBD5E1',
        furMidHex: '#7C8BA1',
        furShadowHex: '#475569',
        bellyHex: '#E2E8F0',
        rimLightColor: environment === 'bedroom' ? '#FBBF24' : '#818CF8',
        rimLightAlpha: 0.7,
        ambientTintRgba:
          environment === 'bedroom'
            ? 'rgba(245, 158, 11, 0.10)'
            : 'rgba(99, 102, 241, 0.16)',
        spotlightRgba:
          environment === 'bedroom'
            ? 'rgba(251, 191, 36, 0.22)'
            : 'rgba(129, 140, 248, 0.20)',
        shadowAlpha: 0.52,
        shadowOffsetX: environment === 'bedroom' ? -14 : 12,
        lightSourceAngle: -0.45,
      };
  }
}

export interface TomPersona {
  id: TomPersonaId;
  name: string;
  kicker: string;
  voiceName: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';
  pitchShift: number;
  greeting: string;
  systemPrompt: string;
}

export const TOM_PERSONAS: Record<TomPersonaId, TomPersona> = {
  witty_bestie: {
    id: 'witty_bestie',
    name: 'Classic Witty Tom',
    kicker: 'Playful · Clever · Warm',
    voiceName: 'Puck',
    pitchShift: 1.08,
    greeting:
      "Meow-hello! I'm Talking Tom. Ask me any question—what's on your mind?",
    systemPrompt:
      'You are Talking Tom, the witty gray tabby cat! STRICT RULE: Answer in VERY SHORT, simple words—maximum 1 to 2 short sentences (under 18 words total). Directly answer the question first. Never repeat the question.',
  },
  wise_professor: {
    id: 'wise_professor',
    name: 'Professor Purr-stein',
    kicker: 'Science · Trivia · Deep Talks',
    voiceName: 'Charon',
    pitchShift: 1.02,
    greeting:
      'Ah, splendid timing! Ask me any science or trivia question!',
    systemPrompt:
      'You are Professor Tom, a clever scholar cat. STRICT RULE: Answer in VERY SHORT, simple words—maximum 1 to 2 short sentences (under 18 words total). Directly state the fact first.',
  },
  cozy_storyteller: {
    id: 'cozy_storyteller',
    name: 'Cozy Whiskers',
    kicker: 'Empathetic · Mindful · Stories',
    voiceName: 'Kore',
    pitchShift: 1.04,
    greeting:
      'Purrrr... Pull up a cozy cushion and ask me anything!',
    systemPrompt:
      'You are Cozy Tom, a warm and gentle cat friend. STRICT RULE: Answer in VERY SHORT, simple words—maximum 1 to 2 short sentences (under 18 words total).',
  },
  dramatic_poet: {
    id: 'dramatic_poet',
    name: 'Maestro Tommaso',
    kicker: 'Theatrical · Rhymes · Humor',
    voiceName: 'Fenrir',
    pitchShift: 1.06,
    greeting:
      'Bravo! The stage is ours! Ask your question, dear friend!',
    systemPrompt:
      'You are Maestro Tommaso, a theatrical cat. STRICT RULE: Answer in VERY SHORT, simple words—maximum 1 to 2 short sentences (under 18 words total).',
  },
};

export const REST_MODE_MEOW_LINES: Array<{ text: string; emotion: TomEmotion }> = [
  { text: 'Meow! Mrrr-meow~ 🐾', emotion: 'happy' },
  { text: 'Purrrr... Meow! Ask me anything!', emotion: 'curious' },
  { text: 'Mew! Meow-meow! 🐱', emotion: 'excited' },
  { text: 'Mrrr-oww~ I am right here, friend!', emotion: 'happy' },
  { text: 'Meow? Got a fun question for me?', emotion: 'curious' },
];

export function getNextRestMeow(index: number): {
  text: string;
  emotion: TomEmotion;
  nextIndex: number;
} {
  const safeIdx = ((index % REST_MODE_MEOW_LINES.length) + REST_MODE_MEOW_LINES.length) % REST_MODE_MEOW_LINES.length;
  const item = REST_MODE_MEOW_LINES[safeIdx];
  return {
    text: item.text,
    emotion: item.emotion,
    nextIndex: (safeIdx + 1) % REST_MODE_MEOW_LINES.length,
  };
}

const ROMAN_URDU_KEYWORDS = new Set([
  'kya',
  'hai',
  'hain',
  'ho',
  'hoon',
  'men',
  'mein',
  'main',
  'nahi',
  'nahen',
  'nhi',
  'kyun',
  'kiyun',
  'kaise',
  'kaisa',
  'kaisi',
  'aap',
  'tum',
  'mera',
  'meri',
  'mere',
  'tumhara',
  'apka',
  'naam',
  'haal',
  'theek',
  'thik',
  'karo',
  'karen',
  'batao',
  'batayen',
  'sunao',
  'urdu',
  'jawab',
  'lehja',
  'salam',
  'assalam',
  'walekum',
  'shukriya',
  'lateefa',
  'kahani',
  'mausam',
  'billi',
  'dost',
  'yaar',
  'acha',
  'achha',
  'bohat',
  'bahut',
  'mujhe',
  'hamara',
  'pakistan',
  'islamabad',
  'karachi',
  'lahore',
  'kon',
  'kaun',
  'kab',
  'kahan',
  'kitna',
  'kitne',
  'neela',
  'aasman',
  'asman',
  'zameen',
  'pani',
  'khana',
  'machli',
  'doodh',
  'bolte',
  'bolo',
  'baat',
  'sawal',
  'ota',
  'hota',
  'hoti',
  'karta',
  'karti',
  'deta',
  'deti',
  'sahi',
  'isk',
  'isko',
]);

/**
 * Detects whether user input is written in Urdu script (اردو) or Roman Urdu.
 */
export function detectUrduLanguage(text: string): boolean {
  if (!text) return false;
  // 1. Check for Arabic/Urdu Unicode block characters
  if (/[\u0600-\u06FF]/.test(text)) {
    return true;
  }
  // 2. Check for Roman Urdu vocabulary tokens
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return false;

  let urduHits = 0;
  for (const tok of tokens) {
    if (ROMAN_URDU_KEYWORDS.has(tok)) {
      urduHits++;
    }
  }
  // Single-word greeting like "salam" or "urdu", or >= 1 hit in short phrases / >= 2 hits in longer sentences
  if (tokens.includes('urdu') || tokens.includes('salam') || tokens.includes('assalam')) {
    return true;
  }
  return tokens.length <= 3 ? urduHits >= 1 : urduHits >= 2;
}

/**
 * Strictly enforces short, simple spoken replies (<= maxWords) so Tom's answers
 * are concise, natural, and quick to speak aloud in both English and Urdu.
 */
export function enforceShortSpokenReply(rawReply: string, maxWords = 18): string {
  const cleaned = rawReply
    .replace(/[*_#`~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return 'Meow! Tell me more!';

  const isUrduScript = /[\u0600-\u06FF]/.test(cleaned);
  const words = cleaned.split(' ');
  if (words.length <= maxWords) {
    return cleaned;
  }

  // Try keeping the first 1 or 2 complete sentences if they fit within maxWords
  const sentences = cleaned.match(/[^.!?۔؟]+[.!?۔؟]+/g);
  if (sentences && sentences.length > 0) {
    const firstSentence = sentences[0].trim();
    const firstWords = firstSentence.split(/\s+/);
    if (firstWords.length <= maxWords) {
      if (sentences.length > 1) {
        const twoSentences = `${firstSentence} ${sentences[1].trim()}`;
        if (twoSentences.split(/\s+/).length <= maxWords) {
          return twoSentences;
        }
      }
      return firstSentence;
    }
  }

  // Otherwise truncate cleanly at maxWords and ensure ending punctuation
  const sliced = words.slice(0, maxWords).join(' ').replace(/[,;:\-،]+$/, '');
  if (/[.!?۔؟]$/.test(sliced)) return sliced;
  return isUrduScript ? `${sliced}۔` : `${sliced}.`;
}

export interface TomVitalityStats {
  happiness: number;      // 0..100
  hunger: number;         // 0..100 (100 = well-fed)
  energy: number;         // 0..100
  friendshipPoints: number;
  friendshipLevel: number;
  conversationsCount: number;
  treatsFed: number;
  miceCaught: number;
  bestScore: number;
}

export type CareActionType =
  | 'feed_salmon'
  | 'drink_milk'
  | 'tickle_belly'
  | 'head_pat'
  | 'play_guitar'
  | 'poke_paw';

export interface CareActionOutcome {
  stats: TomVitalityStats;
  emotion: TomEmotion;
  spokenLine: string;
  scoreDelta: number;
}

export function createInitialTomStats(): TomVitalityStats {
  return {
    happiness: 85,
    hunger: 78,
    energy: 90,
    friendshipPoints: 120,
    friendshipLevel: 2,
    conversationsCount: 0,
    treatsFed: 0,
    miceCaught: 0,
    bestScore: 120,
  };
}

export function computeFriendshipLevel(points: number): number {
  if (points < 0) return 1;
  return Math.floor(points / 100) + 1;
}

/**
 * Computes a 3-pip socket array ('full' | 'damaged' | 'empty') for HUD vitality display.
 */
export function computeVitalityPips(value: number): Array<'full' | 'damaged' | 'empty'> {
  const clamped = Math.max(0, Math.min(100, value));
  const pips: Array<'full' | 'damaged' | 'empty'> = [];
  const thresholds = [33.3, 66.6, 100];

  for (let i = 0; i < 3; i++) {
    const low = i * 33.3;
    const high = thresholds[i];
    if (clamped >= high - 4) {
      pips.push('full');
    } else if (clamped > low + 5) {
      pips.push('damaged');
    } else {
      pips.push('empty');
    }
  }
  return pips;
}

/**
 * Pure state reducer for care/petting interactions on Tom.
 */
export function applyCareAction(
  current: TomVitalityStats,
  action: CareActionType
): CareActionOutcome {
  const next = { ...current };
  let emotion: TomEmotion = 'happy';
  let spokenLine = 'Purrrr! That feels wonderful!';
  let scoreDelta = 15;

  switch (action) {
    case 'feed_salmon':
      next.hunger = Math.min(100, current.hunger + 22);
      next.happiness = Math.min(100, current.happiness + 10);
      next.treatsFed = current.treatsFed + 1;
      emotion = 'excited';
      spokenLine = 'Yum! Fresh grilled salmon is my favorite treat!';
      scoreDelta = 25;
      break;
    case 'drink_milk':
      next.hunger = Math.min(100, current.hunger + 14);
      next.energy = Math.min(100, current.energy + 16);
      next.treatsFed = current.treatsFed + 1;
      emotion = 'happy';
      spokenLine = 'Slurp! Warm milk gives my whiskers super energy!';
      scoreDelta = 20;
      break;
    case 'tickle_belly':
      next.happiness = Math.min(100, current.happiness + 18);
      next.energy = Math.max(10, current.energy - 4);
      emotion = 'laughing';
      spokenLine = 'Hehehe! Stop, my belly is super ticklish!';
      scoreDelta = 20;
      break;
    case 'head_pat':
      next.happiness = Math.min(100, current.happiness + 14);
      next.energy = Math.min(100, current.energy + 6);
      emotion = 'proud';
      spokenLine = 'Purrrr... Right behind the ears feels amazing!';
      scoreDelta = 15;
      break;
    case 'play_guitar':
      next.happiness = Math.min(100, current.happiness + 16);
      next.energy = Math.max(10, current.energy - 8);
      emotion = 'excited';
      spokenLine = 'Meow! Rock and roll! How was my guitar solo?';
      scoreDelta = 30;
      break;
    case 'poke_paw':
      next.happiness = Math.min(100, current.happiness + 8);
      emotion = 'surprised';
      spokenLine = 'Whoa! High-five right back at you, friend!';
      scoreDelta = 10;
      break;
  }

  next.friendshipPoints = current.friendshipPoints + scoreDelta;
  next.friendshipLevel = computeFriendshipLevel(next.friendshipPoints);
  next.bestScore = Math.max(current.bestScore, next.friendshipPoints);

  return {
    stats: next,
    emotion,
    spokenLine,
    scoreDelta,
  };
}

/**
 * Pure state reducer when a meaningful conversation turn completes.
 */
export function recordConversationTurn(
  current: TomVitalityStats,
  replyLengthWords: number
): TomVitalityStats {
  const bonus = Math.min(45, Math.max(15, Math.round(replyLengthWords * 1.2)));
  const points = current.friendshipPoints + bonus;
  return {
    ...current,
    happiness: Math.min(100, current.happiness + 8),
    energy: Math.max(15, current.energy - 3),
    conversationsCount: current.conversationsCount + 1,
    friendshipPoints: points,
    friendshipLevel: computeFriendshipLevel(points),
    bestScore: Math.max(current.bestScore, points),
  };
}

/**
 * Intelligent offline/fallback question-answering assistant for Tom so that even if
 * the server API key is unconfigured or offline, Tom directly answers questions
 * in short, simple words (<= 18 words) instead of repeating the user's input.
 */
export function generateDirectQuestionAnswer(
  userMessage: string,
  personaId: TomPersonaId = 'witty_bestie'
): {
  reply: string;
  emotion: TomEmotion;
  followUps: string[];
} {
  const clean = userMessage.trim();
  const lower = clean.toLowerCase();
  const persona = TOM_PERSONAS[personaId] || TOM_PERSONAS.witty_bestie;
  const isUrdu = detectUrduLanguage(clean);

  // 1. Check for arithmetic / math expressions
  const mathMatch = lower.match(
    /(-?\d+(?:\.\d+)?)\s*(\+|\-|\*|x|×|\/|÷|\^)\s*(-?\d+(?:\.\d+)?)/
  );
  if (mathMatch) {
    const a = parseFloat(mathMatch[1]);
    const op = mathMatch[2];
    const b = parseFloat(mathMatch[3]);
    let ans: number | null = null;
    if (op === '+') ans = a + b;
    else if (op === '-') ans = a - b;
    else if (op === '*' || op === 'x' || op === '×') ans = a * b;
    else if ((op === '/' || op === '÷') && b !== 0) ans = Number((a / b).toFixed(4));
    else if (op === '^') ans = Math.pow(a, b);

    if (ans !== null && Number.isFinite(ans)) {
      if (isUrdu) {
        return {
          reply: `اس کا جواب ${ans} ہے! میں نے اپنے پنجوں پر گن لیا۔`,
          emotion: 'proud',
          followUps: [
            'آسمان نیلا کیوں ہے؟',
            'کوئی مزاحیہ لطیفہ سناؤ!',
            'تمہارا نام کیا ہے؟',
          ],
        };
      }
      return {
        reply: `The answer is ${ans}! Counted right on my toe beans!`,
        emotion: 'proud',
        followUps: [
          'What is 144 divided by 12?',
          'Give me a math riddle!',
          'Why is the sky blue?',
        ],
      };
    }
  }

  // 1b. Native Pakistani Urdu Q&A when Urdu script or Roman Urdu is detected
  if (isUrdu) {
    const urduFollowUps = [
      'آسمان نیلا کیوں ہے؟',
      'کوئی مزاحیہ لطیفہ سناؤ!',
      'پاکستان کا دارالحکومت کیا ہے؟',
    ];

    if (
      lower.includes('naam') ||
      lower.includes('kon') ||
      lower.includes('kaun') ||
      clean.includes('نام') ||
      clean.includes('کون')
    ) {
      return {
        reply: 'میرا نام ٹاکنگ ٹام ہے، میں آپ کا ذہین اور پیارا بلّا دوست ہوں!',
        emotion: 'proud',
        followUps: urduFollowUps,
      };
    }

    if (
      lower.includes('haal') ||
      lower.includes('kaise') ||
      lower.includes('kaisa') ||
      lower.includes('salam') ||
      lower.includes('assalam') ||
      clean.includes('سلام') ||
      clean.includes('حال') ||
      clean.includes('کیسے')
    ) {
      return {
        reply: 'وعلیکم السلام! میں بالکل ٹھیک اور خوش ہوں، آپ سنائیں آپ کیسے ہیں؟',
        emotion: 'happy',
        followUps: urduFollowUps,
      };
    }

    if (
      lower.includes('aasman') ||
      lower.includes('asman') ||
      lower.includes('neela') ||
      clean.includes('آسمان') ||
      clean.includes('نیلا')
    ) {
      return {
        reply: 'ہوا سورج کی نیلی روشنی کو چاروں طرف بکھیر دیتی ہے، اس لیے آسمان نیلا دکھتا ہے!',
        emotion: 'curious',
        followUps: urduFollowUps,
      };
    }

    if (
      lower.includes('lateefa') ||
      lower.includes('joke') ||
      lower.includes('hansi') ||
      clean.includes('لطیفہ') ||
      clean.includes('مذاق')
    ) {
      return {
        reply: 'بلی کمپیوٹر پر کیوں بیٹھی؟ تاکہ ماؤس پر نظر رکھ سکے! ہاہاہا!',
        emotion: 'laughing',
        followUps: urduFollowUps,
      };
    }

    if (lower.includes('pakistan') || clean.includes('پاکستان') || clean.includes('دارالحکومت')) {
      return {
        reply: 'پاکستان کا دارالحکومت خوبصورت شہر اسلام آباد ہے!',
        emotion: 'proud',
        followUps: urduFollowUps,
      };
    }

    if (
      lower.includes('khana') ||
      lower.includes('machli') ||
      lower.includes('doodh') ||
      clean.includes('کھانا') ||
      clean.includes('مچھلی') ||
      clean.includes('دودھ')
    ) {
      return {
        reply: 'مجھے تازہ مچھلی اور گرم دودھ بہت پسند ہے! آپ کو کیا پسند ہے؟',
        emotion: 'excited',
        followUps: urduFollowUps,
      };
    }

    if (lower.includes('urdu') || lower.includes('lehja') || clean.includes('اردو') || clean.includes('لہجہ')) {
      return {
        reply: 'جی بالکل! اب میں خالص اور آسان اردو لہجے میں آپ کو مختصر جواب دوں گا۔',
        emotion: 'happy',
        followUps: urduFollowUps,
      };
    }

    return {
      reply: 'میاؤں! بہت اچھا سوال ہے، میں ہمیشہ خالص اردو میں آپ کی مدد کے لیے تیار ہوں۔',
      emotion: 'happy',
      followUps: urduFollowUps,
    };
  }

  // 2. Greetings & personal questions
  if (
    /^(hi|hello|hey|yo|good morning|good afternoon|good evening|howdy)\b/.test(lower) ||
    lower.includes('how are you') ||
    lower.includes("how's it going")
  ) {
    return {
      reply: `Meow-hello! I feel pawsome and ready to chat. How are you today?`,
      emotion: 'happy',
      followUps: [
        'Why is the sky blue?',
        'Tell me a cat joke!',
        'What is the fastest animal?',
      ],
    };
  }

  if (lower.includes('your name') || lower.includes('who are you') || lower.includes('what are you')) {
    return {
      reply: `I'm Talking Tom (${persona.name}), your clever cat bestie who loves answering questions!`,
      emotion: 'proud',
      followUps: [
        'What is your favorite food?',
        'How does gravity work?',
        'Tell me a joke!',
      ],
    };
  }

  // 3. Common science & nature questions (short & punchy!)
  if (lower.includes('sky') && lower.includes('blue')) {
    return {
      reply:
        "Earth's air scatters short blue sunlight waves across the sky—that's Rayleigh scattering!",
      emotion: 'curious',
      followUps: [
        'Why do stars twinkle?',
        'How do rainbows form?',
        'Why does the moon glow?',
      ],
    };
  }

  if (lower.includes('fastest') && lower.includes('animal')) {
    return {
      reply:
        'The cheetah is the fastest land animal, sprinting up to 70 miles per hour!',
      emotion: 'excited',
      followUps: [
        'How high can cats jump?',
        'Why do cats purr?',
        'Tell me another animal fact!',
      ],
    };
  }

  if (lower.includes('purr')) {
    return {
      reply:
        'Cats vibrate throat muscles at low frequencies when happy, which calms stress and heals bones!',
      emotion: 'happy',
      followUps: [
        'Why do cats knead blankets?',
        'How high can a cat jump?',
        'Can cats see in the dark?',
      ],
    };
  }

  if (lower.includes('gravity') || lower.includes('newton') || lower.includes('black hole')) {
    return {
      reply:
        'Gravity is the invisible pull between masses that keeps our paws on the ground!',
      emotion: 'curious',
      followUps: [
        'How do cats land on their feet?',
        'How fast does light travel?',
        'Why do planets orbit the sun?',
      ],
    };
  }

  // 4. Geography & Capitals
  if (lower.includes('capital of')) {
    const capitals: Record<string, string> = {
      france: 'Paris, the city of lights and cafe cats!',
      japan: 'Tokyo, famous for cat cafes and neon lights!',
      italy: 'Rome, home to ancient ruins and royal alley cats!',
      usa: 'Washington, D.C.!',
      'united states': 'Washington, D.C.!',
      uk: 'London, right on the River Thames!',
      india: 'New Delhi!',
      canada: 'Ottawa!',
      australia: 'Canberra!',
      germany: 'Berlin!',
      brazil: 'Brasília!',
      egypt: 'Cairo, where ancient cats were treated like royalty!',
    };
    for (const [country, answer] of Object.entries(capitals)) {
      if (lower.includes(country)) {
        return {
          reply: `The capital of ${country.charAt(0).toUpperCase() + country.slice(1)} is ${answer}`,
          emotion: 'proud',
          followUps: [
            'What is the largest ocean?',
            'Why did Egyptians love cats?',
            'Tell me a geography fact!',
          ],
        };
      }
    }
  }

  // 5. Jokes & Riddles
  if (lower.includes('joke') || lower.includes('funny') || lower.includes('laugh')) {
    return {
      reply:
        'Why did the cat sit on the computer? To keep an eye on the mouse! Hehehe!',
      emotion: 'laughing',
      followUps: [
        'Tell me a quick riddle!',
        'Why do cats love boxes?',
        'Tell me another cat pun!',
      ],
    };
  }

  // 6. Stories & Bedtime
  if (lower.includes('story') || lower.includes('sleep') || lower.includes('dream') || lower.includes('bedtime')) {
    return {
      reply:
        'A silver kitten chased a glowing firefly up a moonbeam and found starry yarn balls!',
      emotion: 'happy',
      followUps: [
        'What do cats dream about?',
        'Tell me another tiny story!',
        'Why do cats sleep so much?',
      ],
    };
  }

  // 7. Food & Treats
  if (lower.includes('food') || lower.includes('eat') || lower.includes('hungry') || lower.includes('fish') || lower.includes('salmon')) {
    return {
      reply:
        'Grilled salmon and warm milk are my favorite! What is your favorite snack?',
      emotion: 'excited',
      followUps: [
        'Why do cats love fish?',
        'What foods are bad for cats?',
        'Tell me a cooking tip!',
      ],
    };
  }

  // 8. Programming, AI & Tech
  if (lower.includes('code') || lower.includes('python') || lower.includes('javascript') || lower.includes('computer') || lower.includes('ai')) {
    return {
      reply:
        'Coding breaks big problems into tiny logical steps! Even bugs vanish after a quick catnap.',
      emotion: 'curious',
      followUps: [
        'How does lip-sync work?',
        'How do I learn coding fast?',
        'Tell me a tech joke!',
      ],
    };
  }

  // 9. General Question Answering
  if (lower.startsWith('why ') || lower.startsWith('how ') || lower.startsWith('what ') || lower.endsWith('?')) {
    return {
      reply:
        'Every big question comes down to energy, curiosity, and cause-and-effect working together!',
      emotion: 'curious',
      followUps: [
        'Why is the sky blue?',
        'How do cats purr?',
        'What is 24 * 7?',
      ],
    };
  }

  return {
    reply:
      'Purrrr, great point! Staying curious and playful makes every day brighter!',
    emotion: 'happy',
    followUps: [
      'Why is the sky blue?',
      'Tell me a funny cat joke!',
      'How does gravity work?',
    ],
  };
}
