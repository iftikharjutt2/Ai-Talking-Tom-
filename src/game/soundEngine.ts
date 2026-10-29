import {
  type LipSyncTimeline,
  type VisemeParams,
  type VisemeCode,
  VISEME_PRESETS,
  sampleLipSyncAtTime,
  buildVisemeTimeline,
  wordToVisemes,
} from './lipSyncEngine';
import { detectUrduLanguage } from './tomState';

export interface LiveLipSyncSnapshot {
  isSpeaking: boolean;
  viseme: VisemeCode;
  wordIndex: number;
  word: string;
  progress: number; // 0..1
  params: VisemeParams;
  waveformBins: number[]; // 12 bar heights (0..1) for visual voice meter
}

export class AudioLipSyncController {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private activeSource: AudioBufferSourceNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;
  private timeData: Uint8Array<ArrayBuffer> | null = null;

  private timeline: LipSyncTimeline | null = null;
  private wordCharOffsets: Array<{ wordIndex: number; startChar: number; endChar: number }> = [];
  private boundaryWordIndex: number | null = null;
  private speechSynthActive = false;
  private speechSynthStartMs = 0;
  private startPerfMs = 0;
  private durationSec = 0;
  private isPlaying = false;
  private isMuted = false;
  private onCompleteCallback: (() => void) | null = null;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 256;
        this.analyser.smoothingTimeConstant = 0.65;
        this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
        this.timeData = new Uint8Array(this.analyser.fftSize);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (muted) {
      this.stop();
    }
  }

  public isCurrentlySpeaking(): boolean {
    return this.isPlaying;
  }

  private finishPlayback(): void {
    if (this.activeSource) {
      try {
        this.activeSource.onended = null;
        this.activeSource.stop();
      } catch {
        // ignore
      }
      this.activeSource = null;
    }
    this.speechSynthActive = false;
    this.boundaryWordIndex = null;
    this.isPlaying = false;
    const cb = this.onCompleteCallback;
    this.onCompleteCallback = null;
    if (cb) cb();
  }

  public stop(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
    this.timeline = null;
    this.finishPlayback();
  }

  private computeWordCharOffsets(text: string): Array<{
    wordIndex: number;
    startChar: number;
    endChar: number;
  }> {
    const offsets: Array<{ wordIndex: number; startChar: number; endChar: number }> = [];
    const regex = /\S+/g;
    let match: RegExpExecArray | null;
    let idx = 0;
    while ((match = regex.exec(text)) !== null) {
      offsets.push({
        wordIndex: idx,
        startChar: match.index,
        endChar: match.index + match[0].length,
      });
      idx++;
    }
    return offsets;
  }

  public async playSynchronizedSpeech(options: {
    text: string;
    audioBase64?: string;
    timeline?: LipSyncTimeline;
    playbackRate?: number;
    audioSource?: 'gemini-tts' | 'procedural-wav' | 'instant-wav';
    language?: string;
    useBrowserVoice?: boolean;
    onComplete?: () => void;
  }): Promise<void> {
    this.stop();

    const isGeminiTts = options.audioSource === 'gemini-tts';
    const isUrduText =
      options.language === 'ur-PK' || detectUrduLanguage(options.text);

    // When playing native Gemini TTS audio, play at 0.96x so the natural voice timbre is preserved
    const requestedRate = isGeminiTts
      ? options.playbackRate ?? 0.96
      : options.playbackRate ?? 0.82;

    const baseTimeline =
      options.timeline || buildVisemeTimeline(options.text);
    this.timeline = baseTimeline;
    this.wordCharOffsets = this.computeWordCharOffsets(options.text);
    this.boundaryWordIndex = null;
    this.durationSec = baseTimeline.totalDuration / Math.max(0.5, requestedRate);
    this.startPerfMs = performance.now();
    this.isPlaying = true;
    this.onCompleteCallback = options.onComplete || null;

    if (this.isMuted) {
      return;
    }

    let browserVoiceActive = false;
    // Never run browser speechSynthesis over native Gemini TTS audio
    if (
      !isGeminiTts &&
      options.useBrowserVoice !== false &&
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      typeof SpeechSynthesisUtterance !== 'undefined'
    ) {
      try {
        const voices = window.speechSynthesis.getVoices?.() || [];
        let selectedVoice: SpeechSynthesisVoice | null = null;

        if (isUrduText) {
          // Prefer Pakistani Urdu (ur-PK), Indian Urdu (ur-IN), generic Urdu (ur), or Hindi/South Asian voice (hi-IN)
          selectedVoice =
            voices.find((v) => v.lang.toLowerCase() === 'ur-pk') ||
            voices.find((v) => v.lang.toLowerCase().startsWith('ur')) ||
            voices.find((v) => v.lang.toLowerCase().startsWith('hi')) ||
            null;
        } else {
          selectedVoice =
            voices.find((v) => v.lang.toLowerCase().startsWith('en') && v.default) ||
            voices.find((v) => v.lang.toLowerCase().startsWith('en')) ||
            null;
        }

        // Critical fix for "English lehja": If the text is Urdu and the browser has NO Urdu/Hindi voice installed
        // while we already have a synthesized WAV buffer, do NOT let an English voice read Urdu with an English accent!
        const skipBrowserVoiceForUrdu =
          isUrduText && !selectedVoice && Boolean(options.audioBase64);

        if (!skipBrowserVoiceForUrdu) {
          window.speechSynthesis.cancel();
          const utter = new SpeechSynthesisUtterance(options.text);
          utter.lang = isUrduText ? 'ur-PK' : 'en-US';
          if (selectedVoice) {
            utter.voice = selectedVoice;
          }
          // Slower, relaxed speaking rate (0.82) so Tom speaks clearly and naturally
          utter.rate = Math.min(1.0, Math.max(0.74, requestedRate));
          utter.pitch = isUrduText ? 1.02 : 1.08;
          utter.volume = 0.95;

          this.speechSynthStartMs = performance.now();

          utter.onstart = () => {
            this.speechSynthActive = true;
            this.speechSynthStartMs = performance.now();
            // Reset timeline clock to the exact moment voice audio begins coming out
            this.startPerfMs = performance.now();
          };

          utter.onboundary = (ev: SpeechSynthesisEvent) => {
            if (!this.timeline || typeof ev.charIndex !== 'number') return;
            this.speechSynthActive = true;
            const found = this.wordCharOffsets.find(
              (w) => ev.charIndex >= w.startChar && ev.charIndex <= w.endChar + 2
            );
            if (found) {
              this.boundaryWordIndex = found.wordIndex;
              const wordTiming = this.timeline.words[found.wordIndex];
              if (wordTiming) {
                const targetElapsedSec =
                  (wordTiming.startTime / Math.max(0.1, this.timeline.totalDuration)) *
                  this.durationSec;
                this.startPerfMs = performance.now() - targetElapsedSec * 1000;
              }
            }
          };

          utter.onend = () => {
            const spokenElapsedSec = (performance.now() - this.speechSynthStartMs) / 1000;
            this.speechSynthActive = false;
            this.boundaryWordIndex = null;
            if (spokenElapsedSec > 0.45) {
              this.finishPlayback();
            }
          };

          utter.onerror = () => {
            this.speechSynthActive = false;
            this.boundaryWordIndex = null;
          };

          window.speechSynthesis.speak(utter);
          browserVoiceActive = true;
        }
      } catch {
        this.speechSynthActive = false;
      }
    }

    if (!options.audioBase64) {
      return;
    }

    const ctx = this.ensureContext();
    if (!ctx || !this.analyser) {
      return;
    }

    try {
      const binaryString = atob(options.audioBase64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const audioBuffer = await ctx.decodeAudioData(bytes.buffer.slice(0));
      if (!this.isPlaying) return;

      const actualDuration = audioBuffer.duration / Math.max(0.5, requestedRate);
      this.durationSec = Math.max(this.durationSec, actualDuration);
      this.timeline = buildVisemeTimeline(options.text, audioBuffer.duration);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.playbackRate.value = requestedRate;
      source.loop = browserVoiceActive && !isGeminiTts;

      const gainNode = ctx.createGain();
      gainNode.gain.value = isGeminiTts ? 0.95 : browserVoiceActive ? 0.12 : 0.85;

      source.connect(this.analyser);
      this.analyser.connect(gainNode);
      gainNode.connect(ctx.destination);

      this.activeSource = source;
      source.onended = () => {
        if (this.activeSource === source) {
          this.activeSource = null;
          if (isGeminiTts) {
            this.finishPlayback();
          }
        }
      };
      source.start(0);
    } catch {
      // If decoding fails or autoplay is blocked, timeline clock still drives lip-sync smoothly
    }
  }

  public sampleCurrentFrame(): LiveLipSyncSnapshot {
    if (!this.isPlaying || !this.timeline) {
      return {
        isSpeaking: false,
        viseme: 'SIL',
        wordIndex: -1,
        word: '',
        progress: 0,
        params: { ...VISEME_PRESETS.SIL },
        waveformBins: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      };
    }

    const nowMs = performance.now();
    const elapsedRealSec = (nowMs - this.startPerfMs) / 1000;

    const browserSpeakingNow =
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      Boolean(window.speechSynthesis?.speaking);

    if (
      this.speechSynthActive &&
      !browserSpeakingNow &&
      nowMs - this.speechSynthStartMs > Math.max(1200, this.durationSec * 1500)
    ) {
      this.speechSynthActive = false;
    }

    const voiceStillComing = browserSpeakingNow || this.speechSynthActive;

    // Never stop lip-sync early while voice is still coming!
    if (elapsedRealSec >= this.durationSec && !voiceStillComing) {
      this.finishPlayback();
      return {
        isSpeaking: false,
        viseme: 'SIL',
        wordIndex: -1,
        word: '',
        progress: 1,
        params: { ...VISEME_PRESETS.SIL },
        waveformBins: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      };
    }

    // If voice is still speaking past estimated durationSec, smoothly cycle visemes across the sentence so lips stay synced with voice
    let progress = elapsedRealSec / Math.max(0.1, this.durationSec);
    if (progress >= 0.96 && voiceStillComing) {
      progress = 0.65 + ((progress - 0.65) % 0.32);
    }
    progress = Math.min(0.99, Math.max(0, progress));

    const timelineTimeSec = progress * this.timeline.totalDuration;

    let audioBands:
      | { rms: number; low: number; mid: number; high: number }
      | undefined;
    const waveformBins = new Array(12).fill(0);

    if (this.analyser && this.freqData && this.timeData && this.activeSource && !this.isMuted) {
      this.analyser.getByteFrequencyData(this.freqData);
      this.analyser.getByteTimeDomainData(this.timeData);

      let sumSq = 0;
      for (let i = 0; i < this.timeData.length; i++) {
        const norm = (this.timeData[i] - 128) / 128;
        sumSq += norm * norm;
      }
      const rms = Math.sqrt(sumSq / this.timeData.length);

      const avgRange = (startBin: number, endBin: number) => {
        let sum = 0;
        const count = Math.max(1, endBin - startBin);
        for (let i = startBin; i < endBin && i < this.freqData!.length; i++) {
          sum += this.freqData![i];
        }
        return sum / (count * 255);
      };

      const low = avgRange(1, 7);
      const mid = avgRange(7, 24);
      const high = avgRange(24, 56);

      audioBands = { rms, low, mid, high };

      for (let b = 0; b < 12; b++) {
        const val = this.freqData[b * 3 + 2] / 255;
        waveformBins[b] = Number(Math.min(1, val * 1.35).toFixed(2));
      }
    }

    const sampled = sampleLipSyncAtTime(this.timeline, timelineTimeSec, audioBands);

    let activeWordIndex = sampled.wordIndex;
    let activeWord = sampled.word;
    let activeViseme = sampled.viseme;
    let activeParams = sampled.params;

    if (
      this.boundaryWordIndex !== null &&
      this.timeline.words[this.boundaryWordIndex]
    ) {
      activeWordIndex = this.boundaryWordIndex;
      activeWord = this.timeline.words[this.boundaryWordIndex].word;
      const wordVisemes = wordToVisemes(activeWord);
      const subIdx = Math.floor((elapsedRealSec * 6.0) % wordVisemes.length);
      activeViseme = wordVisemes[subIdx] || sampled.viseme;
      const preset = VISEME_PRESETS[activeViseme] || sampled.params;
      const syllabicPulse = 0.55 + 0.45 * Math.abs(Math.sin(elapsedRealSec * 10.5));
      activeParams = {
        ...preset,
        jawOpen: Number(Math.min(1, Math.max(0.2, preset.jawOpen * syllabicPulse)).toFixed(3)),
      };
    } else if (voiceStillComing && activeParams.jawOpen < 0.14) {
      const pulse = 0.32 + 0.45 * Math.abs(Math.sin(elapsedRealSec * 10.0));
      activeParams = {
        ...activeParams,
        jawOpen: Number(pulse.toFixed(3)),
      };
    }

    if (!audioBands || audioBands.rms < 0.01) {
      for (let b = 0; b < 12; b++) {
        const wave =
          activeParams.jawOpen *
          (0.45 + 0.55 * Math.abs(Math.sin(elapsedRealSec * 12 + b * 0.7)));
        waveformBins[b] = Number(Math.min(1, wave).toFixed(2));
      }
    }

    return {
      isSpeaking: true,
      viseme: activeViseme,
      wordIndex: activeWordIndex,
      word: activeWord,
      progress,
      params: activeParams,
      waveformBins,
    };
  }

  public playRestMeow(meowText = 'Meow!'): void {
    // Only animate rest-mode meow if not already speaking a full sentence
    if (!this.isPlaying) {
      this.timeline = buildVisemeTimeline(meowText, 0.72);
      this.wordCharOffsets = this.computeWordCharOffsets(meowText);
      this.boundaryWordIndex = null;
      this.durationSec = 0.72;
      this.startPerfMs = performance.now();
      this.isPlaying = true;
    }
    this.playProceduralSfx('meow');
  }

  public playProceduralSfx(
    kind:
      | 'purr'
      | 'crunch'
      | 'slurp'
      | 'giggle'
      | 'guitar'
      | 'boing'
      | 'squeak'
      | 'fanfare'
      | 'meow'
  ): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const pitchJitter = 0.94 + Math.random() * 0.12;

    if (kind === 'meow') {
      // Expressive two-formant cat "Meee-owww!" pitch and vowel contour
      const oscMain = ctx.createOscillator();
      const oscHarmonic = ctx.createOscillator();
      const formantFilter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      oscMain.type = 'sawtooth';
      oscHarmonic.type = 'triangle';

      // Pitch contour: rises on "Meee" (380 -> 670 Hz), then glides down on "-owww" (670 -> 390 Hz)
      oscMain.frequency.setValueAtTime(380 * pitchJitter, now);
      oscMain.frequency.exponentialRampToValueAtTime(670 * pitchJitter, now + 0.22);
      oscMain.frequency.exponentialRampToValueAtTime(520 * pitchJitter, now + 0.45);
      oscMain.frequency.exponentialRampToValueAtTime(370 * pitchJitter, now + 0.66);

      oscHarmonic.frequency.setValueAtTime(760 * pitchJitter, now);
      oscHarmonic.frequency.exponentialRampToValueAtTime(1340 * pitchJitter, now + 0.22);
      oscHarmonic.frequency.exponentialRampToValueAtTime(740 * pitchJitter, now + 0.66);

      // Vowel formant sweep: nasal "M" (550Hz) -> open "AA/EE" (1450Hz) -> round "OW/OO" (680Hz)
      formantFilter.type = 'bandpass';
      formantFilter.Q.setValueAtTime(2.6, now);
      formantFilter.frequency.setValueAtTime(550, now);
      formantFilter.frequency.exponentialRampToValueAtTime(1450, now + 0.24);
      formantFilter.frequency.exponentialRampToValueAtTime(680, now + 0.64);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.22, now + 0.07);
      gain.gain.setValueAtTime(0.2, now + 0.34);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.68);

      oscMain.connect(formantFilter);
      oscHarmonic.connect(formantFilter);
      formantFilter.connect(gain);
      gain.connect(ctx.destination);

      oscMain.start(now);
      oscHarmonic.start(now);
      oscMain.stop(now + 0.7);
      oscHarmonic.stop(now + 0.7);
      return;
    }

    if (kind === 'boing' || kind === 'squeak') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = kind === 'squeak' ? 'triangle' : 'sine';
      const startFreq = (kind === 'squeak' ? 780 : 280) * pitchJitter;
      const endFreq = (kind === 'squeak' ? 1320 : 540) * pitchJitter;
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.16);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.19);
      return;
    }

    if (kind === 'guitar') {
      const notes = [220, 277.18, 329.63, 440];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq * pitchJitter, now + idx * 0.045);
        gain.gain.setValueAtTime(0.11, now + idx * 0.045);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.045 + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.045);
        osc.stop(now + idx * 0.045 + 0.46);
      });
      return;
    }

    if (kind === 'fanfare') {
      const notes = [261.63, 329.63, 392.0, 523.25];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.09);
        gain.gain.setValueAtTime(0.16, now + idx * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.09);
        osc.stop(now + idx * 0.09 + 0.36);
      });
      return;
    }

    // Default warm chime / purr pulse
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = kind === 'purr' ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(340 * pitchJitter, now);
    osc.frequency.exponentialRampToValueAtTime(480 * pitchJitter, now + 0.14);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.17);
  }
}
