import React, { useState } from 'react';
import {
  TOM_PERSONAS,
  STAGE_ENVIRONMENTS,
  STAGE_3D_EFFECTS,
  computeCharacterLighting,
  computeVitalityPips,
  type CareActionType,
  type Stage3DEffectId,
  type StageEnvironmentId,
  type TimeOfDayId,
  type TomEmotion,
  type TomPersonaId,
  type TomVitalityStats,
} from '../game/tomState';
import type { LiveLipSyncSnapshot } from '../game/soundEngine';

export interface ChatTurnItem {
  id: string;
  role: 'user' | 'tom';
  text: string;
  emotion?: TomEmotion;
}

export interface GameHudProps {
  stats: TomVitalityStats;
  emotion: TomEmotion;
  personaId: TomPersonaId;
  environment: StageEnvironmentId;
  timeOfDay: TimeOfDayId;
  effect3d: Stage3DEffectId;
  parallaxTilt: { x: number; y: number };
  mimicMode: boolean;
  miniGameActive: boolean;
  isMuted: boolean;
  isFullscreen: boolean;
  isThinking: boolean;
  isRecordingMic: boolean;
  activeTomSpeech: string;
  followUps: string[];
  chatLog: ChatTurnItem[];
  lipSyncState: LiveLipSyncSnapshot;
  errorBanner: string | null;
  onSelectPersona: (id: TomPersonaId) => void;
  onCycleEnvironment: () => void;
  onCycleTimeOfDay: () => void;
  onCycle3DEffect: () => void;
  onCareAction: (action: CareActionType) => void;
  onTriggerMeow: () => void;
  onSendMessage: (msg: string) => void;
  onToggleMimicMode: () => void;
  onToggleMiniGame: () => void;
  onToggleMicRecording: () => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onPause: () => void;
  onRestart: () => void;
}

function renderVitalityPipSvg(
  state: 'full' | 'damaged' | 'empty',
  kind: 'joy' | 'fullness' | 'pep',
  idx: number
) {
  const fillColors = {
    joy: '#F43F5E',
    fullness: '#F59E0B',
    pep: '#10B981',
  };
  const activeColor = fillColors[kind];

  return (
    <svg
      key={idx}
      viewBox="0 0 24 24"
      className="w-4 h-4 shrink-0"
      aria-hidden="true"
    >
      <rect
        x="2"
        y="3"
        width="20"
        height="18"
        rx="5"
        fill="#140E1C"
        stroke="#4E3866"
        strokeWidth="2"
      />
      {state === 'full' && (
        <>
          <rect x="4.5" y="5.5" width="15" height="13" rx="3" fill={activeColor} />
          <rect x="6" y="7" width="12" height="3" rx="1.5" fill="rgba(255,255,255,0.42)" />
        </>
      )}
      {state === 'damaged' && (
        <>
          <path d="M 4.5 5.5 H 12.5 L 10 18.5 H 4.5 Z" fill={activeColor} />
          <path
            d="M 12.5 5.5 L 10.5 11.5 L 13 14 L 10 18.5"
            stroke="#FEF08A"
            strokeWidth="1.5"
            fill="none"
          />
        </>
      )}
    </svg>
  );
}

const CARE_ACTIONS: Array<{
  id: CareActionType;
  keyHint: string;
  label: string;
  clue: string;
}> = [
  { id: 'feed_salmon', keyHint: '1', label: 'Salmon', clue: '+22 Full' },
  { id: 'drink_milk', keyHint: '2', label: 'Warm Milk', clue: '+16 Pep' },
  { id: 'tickle_belly', keyHint: '3', label: 'Tickle', clue: '+18 Joy' },
  { id: 'head_pat', keyHint: '4', label: 'Head Pat', clue: '+14 Joy' },
  { id: 'play_guitar', keyHint: '5', label: 'Guitar Solo', clue: '+30 Pts' },
];

export const GameHud: React.FC<GameHudProps> = ({
  stats,
  emotion,
  personaId,
  environment,
  timeOfDay,
  effect3d,
  parallaxTilt,
  mimicMode,
  miniGameActive,
  isMuted,
  isFullscreen,
  isThinking,
  isRecordingMic,
  activeTomSpeech,
  followUps,
  chatLog,
  lipSyncState,
  errorBanner,
  onSelectPersona,
  onCycleEnvironment,
  onCycleTimeOfDay,
  onCycle3DEffect,
  onCareAction,
  onTriggerMeow,
  onSendMessage,
  onToggleMimicMode,
  onToggleMiniGame,
  onToggleMicRecording,
  onToggleMute,
  onToggleFullscreen,
  onPause,
  onRestart,
}) => {
  const [inputText, setInputText] = useState('');
  const [showTranscriptDrawer, setShowTranscriptDrawer] = useState(false);

  const joyPips = computeVitalityPips(stats.happiness);
  const fullPips = computeVitalityPips(stats.hunger);
  const pepPips = computeVitalityPips(stats.energy);

  const currentEnvMeta =
    STAGE_ENVIRONMENTS.find((e) => e.id === environment) || STAGE_ENVIRONMENTS[0];
  const currentLighting = computeCharacterLighting(timeOfDay, environment);
  const current3DMeta =
    STAGE_3D_EFFECTS.find((e) => e.id === effect3d) || STAGE_3D_EFFECTS[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = inputText.trim();
    if (!cleaned) return;
    setInputText('');
    onSendMessage(cleaned);
  };

  const spokenWords = activeTomSpeech.trim().split(/\s+/).filter(Boolean);

  // Subtle 3D tilt angles driven by live stage pointer parallax
  const tiltRotateY = Math.round(parallaxTilt.x * 7 * 10) / 10;
  const tiltRotateX = Math.round(-parallaxTilt.y * 6 * 10) / 10;

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3 md:p-5">
      {/* ================= TOP PERIMETER CLUSTERS ================= */}
      <div className="flex items-start justify-between gap-3">
        {/* Top-Left Cluster: 3D Extruded Mahogany Plaque with Friendship Level & Vitality Pips */}
        <div
          className="pointer-events-auto flex items-center gap-3.5 bg-[#24162B]/95 border-2 border-b-4 border-[#8B532B] rounded-2xl px-3.5 py-2 shadow-2xl"
          style={{
            transform: `perspective(850px) rotateX(${tiltRotateX}deg) rotateY(${tiltRotateY}deg)`,
          }}
        >
          <div className="pr-3 border-r border-[#493459]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300/90 whitespace-nowrap">
              LVL {Math.round(stats.friendshipLevel)} · BOND PTS
            </div>
            <div
              className="text-2xl font-bold text-amber-100 leading-none mt-0.5 tabular-nums"
              style={{
                fontFamily: "'Fredoka', sans-serif",
                fontVariantNumeric: 'tabular-nums',
                paintOrder: 'stroke fill',
              }}
              data-testid="hud-friendship-points"
            >
              {Math.round(stats.friendshipPoints)}
            </div>
          </div>

          {/* 3 Vitality Socket Pip Rows */}
          <div className="flex flex-col gap-1 text-[10px] font-bold tracking-wider">
            <div className="flex items-center justify-between gap-2">
              <span className="text-rose-300 w-9 whitespace-nowrap">JOY</span>
              <div className="flex items-center gap-0.5">
                {joyPips.map((st, idx) => renderVitalityPipSvg(st, 'joy', idx))}
              </div>
              <span className="text-white/90 w-6 text-right tabular-nums">
                {Math.round(stats.happiness)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-amber-300 w-9 whitespace-nowrap">FULL</span>
              <div className="flex items-center gap-0.5">
                {fullPips.map((st, idx) => renderVitalityPipSvg(st, 'fullness', idx))}
              </div>
              <span className="text-white/90 w-6 text-right tabular-nums">
                {Math.round(stats.hunger)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-emerald-300 w-9 whitespace-nowrap">PEP</span>
              <div className="flex items-center gap-0.5">
                {pepPips.map((st, idx) => renderVitalityPipSvg(st, 'pep', idx))}
              </div>
              <span className="text-white/90 w-6 text-right tabular-nums">
                {Math.round(stats.energy)}
              </span>
            </div>
          </div>
        </div>

        {/* Top-Right Cluster: 3D Effect Cycler, Environment Cycler, Lighting Cycler, Persona, & Utility Controls */}
        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
          {/* 3D Effect Mode Cycle Control [D] */}
          <button
            type="button"
            tabIndex={-1}
            data-testid="hud-3d-cycle-btn"
            aria-label={`Change 3D Visual Effect Mode, current is ${current3DMeta.label}`}
            onClick={(e) => {
              e.currentTarget.blur();
              onCycle3DEffect();
            }}
            className="h-10 px-3 rounded-xl bg-[#24162B]/95 border-2 border-b-4 border-sky-400/80 hover:border-amber-300 text-xs font-bold text-sky-200 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-sky-300 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            <span>3D: {current3DMeta.label} [D]</span>
          </button>

          {/* Background Environment Cycle Control [E] */}
          <button
            type="button"
            tabIndex={-1}
            data-testid="hud-env-cycle-btn"
            aria-label={`Change Background Environment, current is ${currentEnvMeta.label}`}
            onClick={(e) => {
              e.currentTarget.blur();
              onCycleEnvironment();
            }}
            className="h-10 px-3 rounded-xl bg-[#24162B]/95 border-2 border-b-4 border-[#7C4A27] hover:border-amber-400 text-xs font-bold text-amber-100 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-emerald-300 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <span>Scene: {currentEnvMeta.label} [E]</span>
          </button>

          {/* Time-of-Day Character Lighting Cycle Control [T] */}
          <button
            type="button"
            tabIndex={-1}
            data-testid="hud-lighting-cycle-btn"
            aria-label={`Change Time of Day Lighting, current is ${currentLighting.label}`}
            onClick={(e) => {
              e.currentTarget.blur();
              onCycleTimeOfDay();
            }}
            className="h-10 px-3 rounded-xl bg-[#24162B]/95 border-2 border-b-4 border-[#5B3E6E] hover:border-amber-400 text-xs font-bold text-amber-100 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-amber-300 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
            </svg>
            <span>Light: {currentLighting.label} [T]</span>
          </button>

          {/* Persona Switcher */}
          <label className="sr-only" htmlFor="persona-select">
            Select Tom Persona
          </label>
          <select
            id="persona-select"
            aria-label="Select Tom Persona"
            value={personaId}
            onChange={(e) => {
              e.currentTarget.blur();
              onSelectPersona(e.target.value as TomPersonaId);
            }}
            className="h-10 px-3 rounded-xl bg-[#24162B]/95 border-2 border-b-4 border-[#7C4A27] text-xs font-bold text-amber-100 cursor-pointer focus:outline-none focus:border-amber-400"
          >
            {Object.values(TOM_PERSONAS).map((p) => (
              <option key={p.id} value={p.id} className="bg-[#24162B] text-amber-100">
                {p.name}
              </option>
            ))}
          </select>

          {/* Mimic Repeat Mode Toggle [V] — clearly labeled so users know Q&A is default */}
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMimicMode();
            }}
            className={`h-10 px-3 rounded-xl border-2 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              mimicMode
                ? 'bg-amber-500 border-amber-300 text-slate-950'
                : 'bg-[#24162B]/95 border-[#5B3E6E] text-amber-100 hover:border-amber-400'
            }`}
          >
            {mimicMode ? 'Mimic Repeat: ON [V]' : 'Mimic Repeat: OFF [V]'}
          </button>

          {/* Laser Mouse Chase Mini-Game Toggle [G] */}
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMiniGame();
            }}
            className={`h-10 px-3 rounded-xl border-2 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              miniGameActive
                ? 'bg-rose-600 border-rose-300 text-white'
                : 'bg-[#24162B]/95 border-[#5B3E6E] text-amber-100 hover:border-amber-400'
            }`}
          >
            {miniGameActive
              ? `Catch Mouse (${Math.round(stats.miceCaught)}/5) [G]`
              : 'Mouse Chase [G]'}
          </button>

          {/* Chat Log Drawer Toggle */}
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              setShowTranscriptDrawer((prev) => !prev);
            }}
            className="h-10 px-3 rounded-xl bg-[#24162B]/95 border-2 border-[#5B3E6E] hover:border-amber-400 text-xs font-bold text-amber-100 cursor-pointer whitespace-nowrap shrink-0"
          >
            History ({Math.round(chatLog.length)})
          </button>

          {/* Compact Square SVG Utility Buttons: Full Screen [F], Mute [M], Pause [P], Restart [R] */}
          <button
            type="button"
            tabIndex={-1}
            data-testid="hud-fullscreen-btn"
            aria-label={isFullscreen ? 'Exit Full Screen [F]' : 'Enter Full Screen [F]'}
            title={isFullscreen ? 'Exit Full Screen [F]' : 'Enter Full Screen [F]'}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleFullscreen();
            }}
            className={`h-10 px-2.5 rounded-xl border-2 flex items-center gap-1.5 text-xs font-bold cursor-pointer shrink-0 transition-colors ${
              isFullscreen
                ? 'bg-amber-500 border-amber-300 text-slate-950'
                : 'bg-[#24162B]/95 border-[#5B3E6E] hover:border-amber-400 text-amber-100'
            }`}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2">
              {isFullscreen ? (
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
              ) : (
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              )}
            </svg>
            <span className="hidden sm:inline">{isFullscreen ? 'Exit Full [F]' : 'Full Screen [F]'}</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label={isMuted ? 'Unmute Audio [M]' : 'Mute Audio [M]'}
            title={isMuted ? 'Unmute Audio [M]' : 'Mute Audio [M]'}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            className="w-10 h-10 rounded-xl bg-[#24162B]/95 border-2 border-[#5B3E6E] hover:border-amber-400 flex items-center justify-center text-amber-100 cursor-pointer shrink-0"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M11 5L6 9H2v6h4l5 4V5z" fill="#3B254B" />
              {isMuted ? (
                <path d="M22 9l-6 6M16 9l6 6" stroke="#F43F5E" />
              ) : (
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" stroke="#FBBF24" />
              )}
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Pause Game [P]"
            title="Pause Game [P]"
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            className="w-10 h-10 rounded-xl bg-[#24162B]/95 border-2 border-[#5B3E6E] hover:border-amber-400 flex items-center justify-center text-amber-100 cursor-pointer shrink-0"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1.5" />
              <rect x="14" y="4" width="4" height="16" rx="1.5" />
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Restart Session [R]"
            title="Restart Session [R]"
            onClick={(e) => {
              e.currentTarget.blur();
              onRestart();
            }}
            className="w-10 h-10 rounded-xl bg-[#24162B]/95 border-2 border-[#5B3E6E] hover:border-amber-400 flex items-center justify-center text-amber-100 cursor-pointer shrink-0"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        </div>
      </div>

      {/* ================= DIEGETIC SPEECH BUBBLE & LIVE LIP-SYNC READOUT ================= */}
      <div className="my-auto flex items-start justify-between pointer-events-none">
        <div
          className="pointer-events-auto max-w-xs md:max-w-sm bg-[#23172B]/95 border-2 border-b-4 border-[#8B532B] rounded-2xl p-3.5 shadow-2xl"
          style={{
            transform: `perspective(850px) rotateX(${tiltRotateX}deg) rotateY(${tiltRotateY}deg)`,
          }}
          data-lipsync-active={lipSyncState.isSpeaking ? 'true' : 'false'}
          data-active-viseme={lipSyncState.viseme}
        >
          <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-[#463157]">
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
              {isThinking
                ? 'TOM IS PONDERING...'
                : lipSyncState.isSpeaking
                ? 'SPEAKING · LIP-SYNC ACTIVE'
                : `MOOD: ${emotion.toUpperCase()}`}
            </div>
            <div
              className="text-[11px] font-mono font-bold text-emerald-300 tabular-nums"
              style={{ fontVariantNumeric: 'tabular-nums' }}
              data-testid="viseme-readout"
            >
              MOUTH: {lipSyncState.viseme} · {Math.round(lipSyncState.params.jawOpen * 100)}%
            </div>
          </div>

          <p
            dir="auto"
            className="text-xs md:text-sm text-[#FAF5FF] leading-relaxed"
            data-testid="tom-speech-bubble"
          >
            {isThinking ? (
              <span className="italic text-amber-200">
                Hmm, let me twitch my whiskers and think of the best answer for you...
              </span>
            ) : (
              spokenWords.map((w, idx) => {
                const isCurrentWord =
                  lipSyncState.isSpeaking && lipSyncState.wordIndex === idx;
                return (
                  <span
                    key={idx}
                    className={
                      isCurrentWord
                        ? 'bg-amber-400 text-slate-950 font-bold px-1 rounded'
                        : ''
                    }
                  >
                    {w}{' '}
                  </span>
                );
              })
            )}
          </p>

          {/* 12-Bar Real-Time Voice Formant Waveform */}
          <div
            className="mt-2.5 h-5 flex items-end gap-1 pt-1"
            aria-label="Voice Acoustic Waveform"
          >
            {lipSyncState.waveformBins.map((val, i) => (
              <div
                key={i}
                className="flex-1 bg-amber-400 rounded-t origin-bottom"
                style={{
                  height: '100%',
                  transform: `scaleY(${Math.max(0.14, val)})`,
                }}
              />
            ))}
          </div>

          {/* Environment, Lighting & 3D Mode Telemetry Line */}
          <div
            className="mt-2 pt-1.5 border-t border-[#3E2A4D] flex items-center justify-between text-[10px] text-[#CFC4E0] tabular-nums"
            data-testid="lighting-telemetry"
          >
            <span>{currentEnvMeta.label}</span>
            <span>·</span>
            <span>{currentLighting.label}</span>
            <span>·</span>
            <span className="text-sky-300 font-bold">{current3DMeta.label}</span>
            <span>·</span>
            <span>Lum {Math.round(currentLighting.ambientBrightness * 100)}%</span>
          </div>
        </div>

        {/* Optional Collapsible Conversation History Panel on Right */}
        {showTranscriptDrawer && (
          <div className="pointer-events-auto w-72 md:w-80 max-h-72 overflow-y-auto bg-[#23172B]/95 border-2 border-[#7C4A27] rounded-2xl p-3.5 shadow-2xl">
            <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-[#463157]">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
                Conversation Log
              </span>
              <button
                type="button"
                onClick={() => setShowTranscriptDrawer(false)}
                className="text-xs text-[#CFC4E0] hover:text-white cursor-pointer"
              >
                Close
              </button>
            </div>
            <div className="space-y-2 text-xs">
              {chatLog.map((item) => (
                <div
                  key={item.id}
                  className={`p-2 rounded-xl ${
                    item.role === 'user'
                      ? 'bg-[#362645] text-amber-100 ml-4'
                      : 'bg-[#191122] text-[#E9E2F5] mr-4'
                  }`}
                >
                  <div className="text-[10px] font-bold uppercase text-amber-400/80 mb-0.5">
                    {item.role === 'user' ? 'You' : 'Talking Tom'}
                  </div>
                  <div>{item.text}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ================= UNIFIED BOTTOM PERIMETER DOCK ================= */}
      <div className="pointer-events-auto w-full max-w-4xl mx-auto flex flex-col gap-2">
        {errorBanner && (
          <div
            role="alert"
            className="bg-rose-950/95 border border-rose-500 text-rose-100 px-3.5 py-2 rounded-xl text-xs font-medium"
          >
            {errorBanner}
          </div>
        )}

        {/* Row 1: Care Actions + Quick Conversation Prompts */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {CARE_ACTIONS.map((act) => (
              <button
                key={act.id}
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onCareAction(act.id);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-[#271930]/95 hover:bg-[#372444] border border-[#7C4A27] text-left transition-transform active:scale-95 cursor-pointer shrink-0"
              >
                <div className="text-[11px] font-bold text-amber-100 whitespace-nowrap">
                  [{act.keyHint}] {act.label}
                </div>
                <div className="text-[10px] text-amber-300/80 whitespace-nowrap">
                  {act.clue}
                </div>
              </button>
            ))}

            <button
              type="button"
              data-testid="hud-meow-btn"
              onClick={(e) => {
                e.currentTarget.blur();
                onTriggerMeow();
              }}
              className="px-2.5 py-1.5 rounded-xl bg-[#271930]/95 hover:bg-[#372444] border border-amber-500/80 text-left transition-transform active:scale-95 cursor-pointer shrink-0"
            >
              <div className="text-[11px] font-bold text-amber-200 whitespace-nowrap">
                [6] Meow!
              </div>
              <div className="text-[10px] text-emerald-300/90 whitespace-nowrap">
                Rest Call
              </div>
            </button>
          </div>

          <div className="hidden lg:flex items-center gap-1.5">
            {followUps.slice(0, 2).map((promptText, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onSendMessage(promptText)}
                disabled={isThinking}
                className="px-3 py-2 rounded-xl bg-[#201528]/95 hover:bg-[#31213D] border border-[#583E6B] text-xs font-medium text-[#E2D8F0] transition-colors cursor-pointer whitespace-nowrap truncate max-w-[210px] disabled:opacity-50"
              >
                &ldquo;{promptText}&rdquo;
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: Voice Mic Input + Text Conversation Form */}
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 bg-[#23162B]/95 border-2 border-[#8B532B] rounded-2xl p-2 shadow-2xl"
        >
          <button
            type="button"
            onClick={onToggleMicRecording}
            aria-label={isRecordingMic ? 'Stop Recording Voice' : 'Speak to Tom with Microphone'}
            className={`h-11 px-3.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              isRecordingMic
                ? 'bg-rose-600 text-white'
                : 'bg-[#362442] hover:bg-[#462F56] text-amber-200 border border-[#65497A]'
            }`}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2">
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
            </svg>
            <span>{isRecordingMic ? 'Listening...' : 'Voice Mic'}</span>
          </button>

          <label htmlFor="tom-chat-input" className="sr-only">
            Message to Talking Tom
          </label>
          <input
            id="tom-chat-input"
            dir="auto"
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={
              mimicMode
                ? 'Type anything for Tom to repeat in his funny voice...'
                : 'Ask Tom in English or Urdu (اردو / Roman Urdu)...'
            }
            className="flex-1 min-w-0 h-11 px-3.5 rounded-xl bg-[#160E1C] border border-[#493459] text-sm text-white placeholder-[#9C8EB0] focus:outline-none focus:border-amber-400"
          />

          <button
            type="submit"
            disabled={isThinking || !inputText.trim()}
            className="h-11 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-45 text-slate-950 font-bold text-xs md:text-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {isThinking ? 'Thinking...' : mimicMode ? 'Repeat It' : 'Ask Tom'}
          </button>
        </form>
      </div>
    </div>
  );
};
