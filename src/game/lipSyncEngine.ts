export type VisemeCode =
  | 'SIL'
  | 'AA'
  | 'EE'
  | 'IH'
  | 'OH'
  | 'OO'
  | 'FV'
  | 'MBP'
  | 'LTH';

export interface VisemeParams {
  viseme: VisemeCode;
  jawOpen: number;    // 0.0 (closed) to 1.0 (wide open)
  mouthWidth: number; // 0.6 (pursed) to 1.35 (wide smile)
  lipRound: number;   // 0.0 (flat) to 1.0 (circular O/U)
  tongueUp: number;   // 0.0 (flat) to 1.0 (raised tip)
  teethShow: number;  // 0.0 to 1.0
}

export interface VisemeCue {
  startTime: number;
  endTime: number;
  viseme: VisemeCode;
  wordIndex: number;
  word: string;
  params: VisemeParams;
}

export interface WordTiming {
  word: string;
  index: number;
  startTime: number;
  endTime: number;
}

export interface LipSyncTimeline {
  text: string;
  totalDuration: number;
  words: WordTiming[];
  cues: VisemeCue[];
}

export const VISEME_PRESETS: Record<VisemeCode, VisemeParams> = {
  SIL: { viseme: 'SIL', jawOpen: 0.0, mouthWidth: 1.0, lipRound: 0.0, tongueUp: 0.0, teethShow: 0.0 },
  AA:  { viseme: 'AA',  jawOpen: 0.88, mouthWidth: 1.12, lipRound: 0.15, tongueUp: 0.25, teethShow: 0.45 },
  EE:  { viseme: 'EE',  jawOpen: 0.42, mouthWidth: 1.32, lipRound: 0.05, tongueUp: 0.40, teethShow: 0.85 },
  IH:  { viseme: 'IH',  jawOpen: 0.54, mouthWidth: 1.18, lipRound: 0.10, tongueUp: 0.35, teethShow: 0.60 },
  OH:  { viseme: 'OH',  jawOpen: 0.78, mouthWidth: 0.78, lipRound: 0.85, tongueUp: 0.15, teethShow: 0.20 },
  OO:  { viseme: 'OO',  jawOpen: 0.36, mouthWidth: 0.64, lipRound: 0.96, tongueUp: 0.10, teethShow: 0.05 },
  FV:  { viseme: 'FV',  jawOpen: 0.18, mouthWidth: 1.05, lipRound: 0.10, tongueUp: 0.05, teethShow: 0.90 },
  MBP: { viseme: 'MBP', jawOpen: 0.02, mouthWidth: 0.92, lipRound: 0.20, tongueUp: 0.0, teethShow: 0.0 },
  LTH: { viseme: 'LTH', jawOpen: 0.48, mouthWidth: 1.06, lipRound: 0.12, tongueUp: 0.92, teethShow: 0.55 },
};

/**
 * Maps Urdu / Arabic script characters (\u0600-\u06FF) to anatomical mouth visemes.
 */
function urduScriptToVisemes(urduWord: string): VisemeCode[] {
  const chars = Array.from(urduWord).filter((c) => /[\u0600-\u06FF]/.test(c));
  if (chars.length === 0) return ['SIL'];

  const result: VisemeCode[] = [];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    switch (ch) {
      case 'ا':
      case 'آ':
      case 'أ':
      case 'ع':
      case 'ح':
      case 'ہ':
      case 'ھ':
      case 'ة':
      case 'ے':
        result.push('AA');
        break;
      case 'و':
      case 'ؤ':
      case 'ُ':
        result.push(i === 0 ? 'OO' : 'OH');
        break;
      case 'ی':
      case 'ئ':
      case 'ِ':
        result.push('EE');
        break;
      case 'م':
      case 'ب':
      case 'پ':
        result.push('MBP');
        break;
      case 'ف':
        result.push('FV');
        break;
      case 'ل':
      case 'ت':
      case 'ٹ':
      case 'د':
      case 'ڈ':
      case 'ذ':
      case 'ر':
      case 'ڑ':
      case 'ن':
      case 'ں':
      case 'ث':
      case 'ط':
      case 'ظ':
        result.push('LTH');
        break;
      case 'س':
      case 'ش':
      case 'ص':
      case 'ض':
      case 'ز':
      case 'ژ':
      case 'ج':
      case 'چ':
        result.push('EE');
        break;
      case 'ک':
      case 'گ':
      case 'ق':
      case 'خ':
      case 'غ':
      case 'ಯ':
      default:
        result.push('IH');
        break;
    }
  }

  const compressed: VisemeCode[] = [];
  for (const v of result) {
    if (compressed[compressed.length - 1] !== v) {
      compressed.push(v);
    }
  }
  return compressed.length > 0 ? compressed : ['AA'];
}

/**
 * Converts a word (English, Roman Urdu, or Urdu Nastaliq script) into a realistic sequence of viseme codes.
 */
export function wordToVisemes(rawWord: string): VisemeCode[] {
  if (/[\u0600-\u06FF]/.test(rawWord)) {
    return urduScriptToVisemes(rawWord);
  }

  const clean = rawWord.toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) return ['SIL'];

  const result: VisemeCode[] = [];
  let i = 0;

  while (i < clean.length) {
    const two = clean.slice(i, i + 2);
    const ch = clean[i];

    if (two === 'aa' || two === 'ah') {
      result.push('AA');
      i += 2;
      continue;
    }
    if (two === 'oo' || two === 'ou' || two === 'ew' || two === 'ue') {
      result.push('OO');
      i += 2;
      continue;
    }
    if (two === 'ee' || two === 'ea' || two === 'ie' || two === 'ey' || two === 'ai' || two === 'ay') {
      result.push('EE');
      i += 2;
      continue;
    }
    if (two === 'oa' || two === 'ow' || two === 'au' || two === 'aw') {
      result.push('OH');
      i += 2;
      continue;
    }
    if (two === 'th' || two === 'll' || two === 'dh' || two === 'rh') {
      result.push('LTH');
      i += 2;
      continue;
    }
    if (two === 'ph' || two === 'bh') {
      result.push(two === 'ph' ? 'FV' : 'MBP');
      i += 2;
      continue;
    }
    if (two === 'sh' || two === 'ch' || two === 'kh' || two === 'gh') {
      result.push('IH');
      i += 2;
      continue;
    }

    switch (ch) {
      case 'a':
        result.push('AA');
        break;
      case 'e':
        if (i === clean.length - 1 && clean.length > 3 && result.length > 0) {
          break;
        }
        result.push('EE');
        break;
      case 'i':
      case 'y':
        result.push('IH');
        break;
      case 'o':
        result.push('OH');
        break;
      case 'u':
      case 'w':
      case 'q':
        result.push('OO');
        break;
      case 'm':
      case 'b':
      case 'p':
        result.push('MBP');
        break;
      case 'f':
      case 'v':
        result.push('FV');
        break;
      case 'l':
      case 'd':
      case 't':
      case 'n':
        result.push('LTH');
        break;
      case 's':
      case 'z':
      case 'c':
      case 'j':
        result.push('EE');
        break;
      case 'r':
      case 'k':
      case 'g':
      case 'h':
      case 'x':
      default:
        result.push('IH');
        break;
    }
    i += 1;
  }

  const compressed: VisemeCode[] = [];
  for (const v of result) {
    if (compressed[compressed.length - 1] !== v) {
      compressed.push(v);
    }
  }

  return compressed.length > 0 ? compressed : ['IH'];
}

/**
 * Estimates spoken duration in seconds for a text string at a relaxed, clear speaking speed (0.82x).
 */
export function estimateSpeechDuration(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0.5;
  // ~1.9 words per second for slower, clearer speech + punctuation pauses (including Urdu ۔ ؟ ،)
  const punctuationMatches = text.match(/[.,!?;:۔؟،]/g);
  const pauseBonus = (punctuationMatches ? punctuationMatches.length : 0) * 0.32;
  return Math.max(1.1, Number((words.length * 0.52 + pauseBonus + 0.3).toFixed(2)));
}

/**
 * Builds a complete phoneme/viseme timeline for lip-syncing to spoken text over `totalDurationSec`.
 */
export function buildVisemeTimeline(text: string, totalDurationSec?: number): LipSyncTimeline {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const duration =
    typeof totalDurationSec === 'number' && totalDurationSec > 0.15
      ? totalDurationSec
      : estimateSpeechDuration(text);

  if (tokens.length === 0) {
    return {
      text,
      totalDuration: duration,
      words: [],
      cues: [
        {
          startTime: 0,
          endTime: duration,
          viseme: 'SIL',
          wordIndex: -1,
          word: '',
          params: { ...VISEME_PRESETS.SIL },
        },
      ],
    };
  }

  // Weight each token by character count (supporting both Latin and Urdu script) + punctuation pause
  const weights = tokens.map((tok) => {
    const cleanChars = tok.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '');
    const alphaLen = Math.max(2, cleanChars.length);
    const hasMajorPause = /[.!?۔؟]$/.test(tok);
    const hasMinorPause = /[,;:،]$/.test(tok);
    return {
      tok,
      speakWeight: Math.pow(alphaLen, 0.75),
      pauseWeight: hasMajorPause ? 1.4 : hasMinorPause ? 0.7 : 0.22,
    };
  });

  const totalWeight = weights.reduce((acc, w) => acc + w.speakWeight + w.pauseWeight, 0);
  const timePerWeight = duration / Math.max(0.001, totalWeight);

  const words: WordTiming[] = [];
  const cues: VisemeCue[] = [];
  let cursor = 0;

  weights.forEach((item, wordIdx) => {
    const speakDuration = item.speakWeight * timePerWeight;
    const pauseDuration = item.pauseWeight * timePerWeight;
    const wordStart = cursor;
    const wordEnd = cursor + speakDuration;

    words.push({
      word: item.tok,
      index: wordIdx,
      startTime: Number(wordStart.toFixed(4)),
      endTime: Number(wordEnd.toFixed(4)),
    });

    const visemes = wordToVisemes(item.tok);
    const sliceDur = speakDuration / visemes.length;

    visemes.forEach((vCode, vIdx) => {
      const cStart = wordStart + vIdx * sliceDur;
      const cEnd = cStart + sliceDur;
      cues.push({
        startTime: Number(cStart.toFixed(4)),
        endTime: Number(cEnd.toFixed(4)),
        viseme: vCode,
        wordIndex: wordIdx,
        word: item.tok,
        params: { ...VISEME_PRESETS[vCode] },
      });
    });

    cursor = wordEnd;

    if (pauseDuration > 0.01) {
      const pauseCode: VisemeCode = /[.!?]$/.test(item.tok) ? 'SIL' : 'MBP';
      cues.push({
        startTime: Number(cursor.toFixed(4)),
        endTime: Number((cursor + pauseDuration).toFixed(4)),
        viseme: pauseCode,
        wordIndex: wordIdx,
        word: item.tok,
        params: {
          ...VISEME_PRESETS[pauseCode],
          jawOpen: 0,
        },
      });
      cursor += pauseDuration;
    }
  });

  return {
    text,
    totalDuration: duration,
    words,
    cues,
  };
}

/**
 * Queries the active viseme cue and interpolated mouth parameters at playback timestamp `currentTimeSec`,
 * optionally blending with real-time Web Audio frequency band energy (`rms`, `lowEnergy`, `midEnergy`, `highEnergy`).
 */
export function sampleLipSyncAtTime(
  timeline: LipSyncTimeline,
  currentTimeSec: number,
  audioBands?: {
    rms: number;      // 0..1
    low: number;      // 0..1 (150-600 Hz jaw resonance)
    mid: number;      // 0..1 (600-2200 Hz vowel formants)
    high: number;     // 0..1 (2200-6000 Hz sibilants F/V/S/EE)
  }
): {
  viseme: VisemeCode;
  wordIndex: number;
  word: string;
  params: VisemeParams;
} {
  if (!timeline.cues.length || currentTimeSec < 0 || currentTimeSec > timeline.totalDuration + 0.05) {
    return {
      viseme: 'SIL',
      wordIndex: -1,
      word: '',
      params: { ...VISEME_PRESETS.SIL },
    };
  }

  const clampedTime = Math.min(timeline.totalDuration, Math.max(0, currentTimeSec));
  let activeCue = timeline.cues[timeline.cues.length - 1];

  for (let i = 0; i < timeline.cues.length; i++) {
    const cue = timeline.cues[i];
    if (clampedTime >= cue.startTime && clampedTime <= cue.endTime) {
      activeCue = cue;
      break;
    }
  }

  // Compute intra-cue bell curve so mouth opens & closes organically on each phoneme
  const cueSpan = Math.max(0.01, activeCue.endTime - activeCue.startTime);
  const localT = Math.min(1, Math.max(0, (clampedTime - activeCue.startTime) / cueSpan));
  const syllableEnvelope = Math.sin(localT * Math.PI) * 0.35 + 0.65;

  let jawOpen = activeCue.params.jawOpen * syllableEnvelope;
  let mouthWidth = activeCue.params.mouthWidth;
  let lipRound = activeCue.params.lipRound;
  const tongueUp = activeCue.params.tongueUp;
  const teethShow = activeCue.params.teethShow;

  // Blend with real acoustic energy when Web Audio analyzer data is active
  if (audioBands && audioBands.rms > 0.015) {
    const acousticOpen = Math.min(1, audioBands.rms * 2.1 + audioBands.low * 0.45);
    jawOpen = jawOpen * 0.55 + acousticOpen * 0.45;

    if (audioBands.high > audioBands.low * 1.15) {
      // High-frequency sibilance widens mouth slightly
      mouthWidth = Math.min(1.38, mouthWidth + 0.12);
    } else if (audioBands.low > audioBands.mid * 1.1) {
      // Low resonant vowel rounds lips slightly
      lipRound = Math.min(1.0, lipRound + 0.15);
    }
  }

  return {
    viseme: activeCue.viseme,
    wordIndex: activeCue.wordIndex,
    word: activeCue.word,
    params: {
      viseme: activeCue.viseme,
      jawOpen: Number(Math.min(1, Math.max(0, jawOpen)).toFixed(3)),
      mouthWidth: Number(mouthWidth.toFixed(3)),
      lipRound: Number(lipRound.toFixed(3)),
      tongueUp: Number(tongueUp.toFixed(3)),
      teethShow: Number(teethShow.toFixed(3)),
    },
  };
}

/**
 * Generates a playable 24kHz 16-bit mono WAV audio buffer (as base64) with formant-modulated
 * cat-like expressive voice syllables synchronized to the viseme timeline.
 * Used as an instant zero-latency fallback or in Classic Pitch-Shift Mimic Mode.
 */
export function synthesizeExpressiveSpeechWavBase64(
  text: string,
  options?: { basePitchHz?: number; durationSec?: number }
): { wavBase64: string; durationSec: number } {
  const sampleRate = 24000;
  const timeline = buildVisemeTimeline(text, options?.durationSec);
  const durationSec = Math.min(10, Math.max(0.6, timeline.totalDuration));
  const numSamples = Math.floor(sampleRate * durationSec);
  const basePitch = options?.basePitchHz ?? 265; // Expressive Talking Tom baritone-tenor pitch

  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // Standard 44-byte RIFF WAV header
  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true);  // PCM format = 1
  view.setUint16(22, 1, true);  // Mono = 1
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);  // Block align
  view.setUint16(34, 16, true); // 16-bit
  writeAscii(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  let phase1 = 0;
  let phase2 = 0;
  let phase3 = 0;
  let cueIdx = 0;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    while (cueIdx < timeline.cues.length - 1 && t > timeline.cues[cueIdx].endTime) {
      cueIdx++;
    }
    const cue = timeline.cues[cueIdx] || timeline.cues[0];
    const cueDur = Math.max(0.01, cue.endTime - cue.startTime);
    const localProgress = Math.min(1, Math.max(0, (t - cue.startTime) / cueDur));

    if (cue.viseme === 'SIL' || cue.params.jawOpen < 0.03) {
      view.setInt16(44 + i * 2, 0, true);
      continue;
    }

    // Melodic intonation contour across sentence + word
    const sentenceContour = 1.0 + 0.12 * Math.sin((t / durationSec) * Math.PI * 2.5);
    const vibrato = 1.0 + 0.018 * Math.sin(t * 2 * Math.PI * 5.8);
    const f0 = basePitch * sentenceContour * vibrato;

    // Vowel formant frequencies based on active viseme
    let f1 = 600;
    let f2 = 1200;
    switch (cue.viseme) {
      case 'AA':
        f1 = 750;
        f2 = 1180;
        break;
      case 'EE':
        f1 = 310;
        f2 = 2250;
        break;
      case 'IH':
        f1 = 420;
        f2 = 1920;
        break;
      case 'OH':
        f1 = 480;
        f2 = 880;
        break;
      case 'OO':
        f1 = 330;
        f2 = 760;
        break;
      case 'FV':
        f1 = 520;
        f2 = 1650;
        break;
      case 'LTH':
        f1 = 450;
        f2 = 1500;
        break;
      default:
        f1 = 500;
        f2 = 1300;
        break;
    }

    phase1 += (2 * Math.PI * f0) / sampleRate;
    phase2 += (2 * Math.PI * f1) / sampleRate;
    phase3 += (2 * Math.PI * f2) / sampleRate;

    const env = Math.sin(localProgress * Math.PI) * cue.params.jawOpen;
    const rawSignal =
      0.55 * Math.sin(phase1) +
      0.28 * Math.sin(phase2) +
      0.17 * Math.sin(phase3);

    const sampleVal = Math.max(-1, Math.min(1, rawSignal * env * 0.55));
    view.setInt16(44 + i * 2, Math.floor(sampleVal * 32767), true);
  }

  // Convert ArrayBuffer to base64 in both Node and Browser environments
  const bytes = new Uint8Array(buffer);
  if (typeof Buffer !== 'undefined') {
    return {
      wavBase64: Buffer.from(bytes).toString('base64'),
      durationSec,
    };
  }
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return {
    wavBase64: btoa(binary),
    durationSec,
  };
}
