/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  TOM_PERSONAS,
  STAGE_ENVIRONMENTS,
  STAGE_3D_EFFECTS,
  applyCareAction,
  computeCharacterLighting,
  createInitialTomStats,
  detectTimeOfDayFromHour,
  getNext3DEffect,
  getNextEnvironment,
  getNextRestMeow,
  getNextTimeOfDay,
  recordConversationTurn,
  type CareActionType,
  type GameShellState,
  type Stage3DEffectId,
  type StageEnvironmentId,
  type TimeOfDayId,
  type TomEmotion,
  type TomPersonaId,
  type TomVitalityStats,
} from './game/tomState';
import {
  buildVisemeTimeline,
  synthesizeExpressiveSpeechWavBase64,
  VISEME_PRESETS,
  type LipSyncTimeline,
} from './game/lipSyncEngine';
import {
  AudioLipSyncController,
  type LiveLipSyncSnapshot,
} from './game/soundEngine';
import { TomStageCanvas } from './components/TomStageCanvas';
import { TitleScreenOverlay } from './components/TitleScreenOverlay';
import { GameHud, type ChatTurnItem } from './components/GameHud';
import { StatusModals } from './components/StatusModals';

const DEFAULT_FOLLOW_UPS = [
  'Why is the sky blue?',
  'Why do cats purr when they are happy?',
  'Tell me a funny cat joke!',
];

export default function App() {
  const initialAutostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const [shellState, setShellState] = useState<GameShellState>(
    initialAutostart ? 'playing' : 'title'
  );
  const [personaId, setPersonaId] = useState<TomPersonaId>('witty_bestie');
  const [environment, setEnvironment] = useState<StageEnvironmentId>('living_room');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDayId>(() =>
    detectTimeOfDayFromHour(new Date().getHours())
  );
  const [effect3d, setEffect3d] = useState<Stage3DEffectId>('cinema_depth');
  const [parallaxTilt, setParallaxTilt] = useState<{ x: number; y: number }>({
    x: 0.14,
    y: -0.08,
  });
  const [emotion, setEmotion] = useState<TomEmotion>('happy');
  const [stats, setStats] = useState<TomVitalityStats>(() => createInitialTomStats());
  const [mimicMode, setMimicMode] = useState(false);
  const [miniGameActive, setMiniGameActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isRecordingMic, setIsRecordingMic] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const restMeowIndexRef = useRef(0);

  const [activeTomSpeech, setActiveTomSpeech] = useState<string>(
    TOM_PERSONAS.witty_bestie.greeting
  );
  const [followUps, setFollowUps] = useState<string[]>(DEFAULT_FOLLOW_UPS);
  const [chatLog, setChatLog] = useState<ChatTurnItem[]>([
    {
      id: 'welcome-1',
      role: 'tom',
      text: TOM_PERSONAS.witty_bestie.greeting,
      emotion: 'happy',
    },
  ]);

  const [lipSyncState, setLipSyncState] = useState<LiveLipSyncSnapshot>({
    isSpeaking: false,
    viseme: 'SIL',
    wordIndex: -1,
    word: '',
    progress: 0,
    params: { ...VISEME_PRESETS.SIL },
    waveformBins: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  });

  const lipSyncControllerRef = useRef<AudioLipSyncController | null>(null);
  if (!lipSyncControllerRef.current) {
    lipSyncControllerRef.current = new AudioLipSyncController();
  }

  const triggerCanvasActionRef = useRef<((action: CareActionType) => void) | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Mirror shellState to document.body.dataset.state synchronously
  useEffect(() => {
    document.body.dataset.state = shellState;
  }, [shellState]);

  // Sync browser fullscreen state changes
  useEffect(() => {
    const onFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement);
      setIsFullscreen(active);
      document.body.dataset.fullscreen = active ? 'true' : 'false';
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const handleToggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
          setIsFullscreen(true);
          document.body.dataset.fullscreen = 'true';
          return;
        }
      } else if (document.exitFullscreen) {
        await document.exitFullscreen();
        setIsFullscreen(false);
        document.body.dataset.fullscreen = 'false';
        return;
      }
    } catch {
      // Fallback for sandboxed iframe environments where Fullscreen API is restricted
    }
    setIsFullscreen((prev) => {
      const next = !prev;
      document.body.dataset.fullscreen = next ? 'true' : 'false';
      return next;
    });
  }, []);

  const speakWithLipSync = useCallback(
    async (
      text: string,
      options?: {
        audioBase64?: string;
        timeline?: LipSyncTimeline;
        playbackRate?: number;
        audioSource?: 'gemini-tts' | 'procedural-wav' | 'instant-wav';
        language?: string;
      }
    ) => {
      setActiveTomSpeech(text);
      const controller = lipSyncControllerRef.current;
      if (!controller) return;

      let audioBase64 = options?.audioBase64;
      let timeline = options?.timeline;

      if (!audioBase64) {
        const localWav = synthesizeExpressiveSpeechWavBase64(text, {
          basePitchHz: Math.round(255 * TOM_PERSONAS[personaId].pitchShift),
        });
        audioBase64 = localWav.wavBase64;
        timeline = buildVisemeTimeline(text, localWav.durationSec);
      }

      await controller.playSynchronizedSpeech({
        text,
        audioBase64,
        timeline,
        playbackRate: options?.playbackRate ?? 0.84,
        audioSource: options?.audioSource,
        language: options?.language,
      });
    },
    [personaId]
  );

  const handleTriggerMeow = useCallback(() => {
    if (shellState !== 'playing') return;
    const nextMeow = getNextRestMeow(restMeowIndexRef.current);
    restMeowIndexRef.current = nextMeow.nextIndex;
    setEmotion(nextMeow.emotion);
    setActiveTomSpeech(nextMeow.text);
    triggerCanvasActionRef.current?.('head_pat');
    lipSyncControllerRef.current?.playRestMeow(nextMeow.text);
  }, [shellState]);

  // Automatic Rest-Mode Meow: when Tom is resting (not answering, thinking, or listening),
  // he periodically says a cute "Meow!" so he feels alive in rest mode.
  useEffect(() => {
    if (
      shellState !== 'playing' ||
      lipSyncState.isSpeaking ||
      isThinking ||
      isRecordingMic
    ) {
      return;
    }

    const timer = setInterval(() => {
      const ctrl = lipSyncControllerRef.current;
      if (ctrl && !ctrl.isCurrentlySpeaking()) {
        const nextMeow = getNextRestMeow(restMeowIndexRef.current);
        restMeowIndexRef.current = nextMeow.nextIndex;
        setEmotion(nextMeow.emotion);
        ctrl.playRestMeow('Meow!');
      }
    }, 6500);

    return () => clearInterval(timer);
  }, [
    shellState,
    lipSyncState.isSpeaking,
    isThinking,
    isRecordingMic,
  ]);

  const handleStartGame = useCallback(() => {
    document.body.dataset.state = 'playing';
    setShellState('playing');
    const greeting = TOM_PERSONAS[personaId].greeting;
    setEmotion('happy');
    speakWithLipSync(greeting);
  }, [personaId, speakWithLipSync]);

  const handleSelectPersona = useCallback(
    (newPersonaId: TomPersonaId) => {
      setPersonaId(newPersonaId);
      const greeting = TOM_PERSONAS[newPersonaId].greeting;
      setActiveTomSpeech(greeting);
      if (shellState === 'playing') {
        speakWithLipSync(greeting);
      }
    },
    [shellState, speakWithLipSync]
  );

  const handleCycleEnvironment = useCallback(() => {
    setEnvironment((prev) => {
      const next = getNextEnvironment(prev);
      const meta = STAGE_ENVIRONMENTS.find((e) => e.id === next);
      lipSyncControllerRef.current?.playProceduralSfx('purr');
      setEmotion('excited');
      if (meta && shellState === 'playing') {
        speakWithLipSync(`Welcome to the ${meta.label}! Isn't this cozy?`);
      }
      return next;
    });
  }, [shellState, speakWithLipSync]);

  const handleCycleTimeOfDay = useCallback(() => {
    setTimeOfDay((prev) => {
      const next = getNextTimeOfDay(prev);
      const light = computeCharacterLighting(next, environment);
      lipSyncControllerRef.current?.playProceduralSfx('purr');
      setEmotion(next === 'night' ? 'sleepy' : 'happy');
      if (shellState === 'playing') {
        speakWithLipSync(`Switched to ${light.label}! I love this glow.`);
      }
      return next;
    });
  }, [environment, shellState, speakWithLipSync]);

  const handleCycle3DEffect = useCallback(() => {
    setEffect3d((prev) => {
      const next = getNext3DEffect(prev);
      const meta = STAGE_3D_EFFECTS.find((e) => e.id === next);
      lipSyncControllerRef.current?.playProceduralSfx('purr');
      setEmotion('excited');
      if (meta && shellState === 'playing') {
        speakWithLipSync(`3D Mode is now ${meta.label}! Move your cursor to look around!`);
      }
      return next;
    });
  }, [shellState, speakWithLipSync]);

  const handleCareAction = useCallback(
    (action: CareActionType) => {
      if (shellState !== 'playing') return;
      setErrorBanner(null);

      triggerCanvasActionRef.current?.(action);

      const ctrl = lipSyncControllerRef.current;
      if (ctrl) {
        if (action === 'feed_salmon') ctrl.playProceduralSfx('crunch');
        else if (action === 'drink_milk') ctrl.playProceduralSfx('slurp');
        else if (action === 'tickle_belly') ctrl.playProceduralSfx('giggle');
        else if (action === 'play_guitar') ctrl.playProceduralSfx('guitar');
        else if (action === 'poke_paw') ctrl.playProceduralSfx('boing');
        else ctrl.playProceduralSfx('purr');
      }

      setStats((prev) => {
        const outcome = applyCareAction(prev, action);
        setEmotion(outcome.emotion);
        speakWithLipSync(outcome.spokenLine);
        return outcome.stats;
      });
    },
    [shellState, speakWithLipSync]
  );

  const handleMouseCaught = useCallback(() => {
    lipSyncControllerRef.current?.playProceduralSfx('squeak');
    setEmotion('excited');

    setStats((prev) => {
      const nextCaught = prev.miceCaught + 1;
      const nextPoints = prev.friendshipPoints + 35;
      const nextBest = Math.max(prev.bestScore, nextPoints);
      const updated: TomVitalityStats = {
        ...prev,
        miceCaught: nextCaught,
        happiness: Math.min(100, prev.happiness + 10),
        friendshipPoints: nextPoints,
        friendshipLevel: Math.floor(nextPoints / 100) + 1,
        bestScore: nextBest,
      };

      if (nextCaught >= 5) {
        setTimeout(() => {
          lipSyncControllerRef.current?.playProceduralSfx('fanfare');
          setMiniGameActive(false);
          document.body.dataset.state = 'gameover';
          setShellState('gameover');
        }, 420);
      } else {
        speakWithLipSync(`Gotcha! ${nextCaught} of 5 mice caught!`);
      }

      return updated;
    });
  }, [speakWithLipSync]);

  const handleSendMessage = useCallback(
    async (rawMessage: string) => {
      const clean = rawMessage.trim();
      if (!clean || isThinking) return;

      setErrorBanner(null);
      const userTurn: ChatTurnItem = {
        id: `u-${Date.now()}`,
        role: 'user',
        text: clean,
      };
      setChatLog((prev) => [...prev, userTurn]);

      // Classic Talking Tom Mimic Mode: repeats user's exact words instantaneously with zero network delay!
      if (mimicMode) {
        const mimicText = `${clean}! Hehehe!`;
        setEmotion('laughing');
        setChatLog((prev) => [
          ...prev,
          { id: `t-${Date.now()}`, role: 'tom', text: mimicText, emotion: 'laughing' },
        ]);
        setStats((prev) => recordConversationTurn(prev, clean.split(/\s+/).length));
        await speakWithLipSync(clean, { playbackRate: 0.92 });
        return;
      }

      // Fast Gemini 3.1 Flash Lite Conversational Q&A Mode
      setIsThinking(true);
      setEmotion('thinking');

      try {
        const historyPayload = chatLog.slice(-4).map((item) => ({
          role: item.role,
          text: item.text,
        }));

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: clean,
            history: historyPayload,
            personaId,
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || 'Could not reach Gemini studio.');
        }

        const data = await response.json();
        const replyText: string = data.reply;
        const replyEmotion: TomEmotion = data.emotion || 'happy';

        setIsThinking(false);
        setEmotion(replyEmotion);
        if (Array.isArray(data.followUps) && data.followUps.length > 0) {
          setFollowUps(data.followUps);
        }

        setChatLog((prev) => [
          ...prev,
          {
            id: `t-${Date.now()}`,
            role: 'tom',
            text: replyText,
            emotion: replyEmotion,
          },
        ]);

        const wordCount = replyText.trim().split(/\s+/).length;
        setStats((prev) => recordConversationTurn(prev, wordCount));

        await speakWithLipSync(replyText, {
          audioBase64: data.audioBase64,
          timeline: data.timeline,
          audioSource: data.audioSource,
          language: data.language,
        });
      } catch (err) {
        setIsThinking(false);
        setErrorBanner((err as Error)?.message || 'Connection hiccup—try asking again!');
        setEmotion('surprised');
      }
    },
    [chatLog, isThinking, mimicMode, personaId, speakWithLipSync, stats]
  );

  const handleToggleMicRecording = useCallback(async () => {
    if (isRecordingMic) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsRecordingMic(false);
      return;
    }

    setErrorBanner(null);

    const SpeechRec =
      (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: any }).webkitSpeechRecognition;

    if (SpeechRec) {
      try {
        const recognition = new SpeechRec();
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        setIsRecordingMic(true);
        recognition.onresult = (event: any) => {
          const transcript = event.results?.[0]?.[0]?.transcript;
          setIsRecordingMic(false);
          if (transcript && transcript.trim()) {
            handleSendMessage(transcript.trim());
          }
        };
        recognition.onerror = () => {
          setIsRecordingMic(false);
          setErrorBanner('Microphone access wasn’t available—type your message below!');
        };
        recognition.onend = () => {
          setIsRecordingMic(false);
        };
        recognition.start();
        return;
      } catch {
        // Fall through to MediaRecorder + /api/transcribe
      }
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorBanner('Microphone recording is not available in this browser—use the chat box!');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordedChunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordedChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64data = String(reader.result || '').split(',')[1];
          if (!base64data) return;
          setIsThinking(true);
          try {
            const res = await fetch('/api/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audioBase64: base64data,
                mimeType: blob.type || 'audio/webm',
              }),
            });
            const data = await res.json();
            if (data.transcript) {
              setIsThinking(false);
              handleSendMessage(data.transcript);
            } else {
              setIsThinking(false);
              setErrorBanner('Could not catch that—try speaking a little closer or typing below!');
            }
          } catch {
            setIsThinking(false);
            setErrorBanner('Voice transcription unavailable—please type your message!');
          }
        };
        reader.readAsDataURL(blob);
      };

      recorder.start();
      setIsRecordingMic(true);
    } catch {
      setErrorBanner('Microphone permission was denied—type your question in the chat bar!');
    }
  }, [handleSendMessage, isRecordingMic]);

  const handleRestartSession = useCallback(() => {
    lipSyncControllerRef.current?.stop();
    setStats(createInitialTomStats());
    setMiniGameActive(false);
    setEmotion('happy');
    setErrorBanner(null);
    document.body.dataset.state = 'playing';
    setShellState('playing');
    const greeting = TOM_PERSONAS[personaId].greeting;
    setChatLog([
      {
        id: `welcome-${Date.now()}`,
        role: 'tom',
        text: greeting,
        emotion: 'happy',
      },
    ]);
    speakWithLipSync(greeting);
  }, [personaId, speakWithLipSync]);

  // Global keyboard shortcuts when not typing in an input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInputFocused =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (shellState === 'title') {
        if ((e.key === 'Enter' || e.key === ' ') && !isInputFocused) {
          e.preventDefault();
          handleStartGame();
        }
        return;
      }

      if (e.key === 'Escape' || (!isInputFocused && (e.key === 'p' || e.key === 'P'))) {
        e.preventDefault();
        if (shellState === 'playing') {
          lipSyncControllerRef.current?.stop();
          document.body.dataset.state = 'paused';
          setShellState('paused');
        } else if (shellState === 'paused') {
          document.body.dataset.state = 'playing';
          setShellState('playing');
        }
        return;
      }

      if (isInputFocused || shellState !== 'playing') return;

      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        handleToggleFullscreen();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        setIsMuted((prev) => {
          const next = !prev;
          lipSyncControllerRef.current?.setMuted(next);
          return next;
        });
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleRestartSession();
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        handleCycleEnvironment();
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        handleCycleTimeOfDay();
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        handleCycle3DEffect();
      } else if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        setMimicMode((prev) => !prev);
      } else if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        setMiniGameActive((prev) => !prev);
      } else if (e.key === '1') {
        handleCareAction('feed_salmon');
      } else if (e.key === '2') {
        handleCareAction('drink_milk');
      } else if (e.key === '3') {
        handleCareAction('tickle_belly');
      } else if (e.key === '4') {
        handleCareAction('head_pat');
      } else if (e.key === '5') {
        handleCareAction('play_guitar');
      } else if (e.key === '6' || e.key === 'c' || e.key === 'C') {
        handleTriggerMeow();
      } else if (e.key === ' ') {
        e.preventDefault();
        handleSendMessage('Tell me a funny cat joke!');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handleCareAction,
    handleCycle3DEffect,
    handleCycleEnvironment,
    handleCycleTimeOfDay,
    handleRestartSession,
    handleSendMessage,
    handleStartGame,
    handleToggleFullscreen,
    handleTriggerMeow,
    shellState,
  ]);

  return (
    <main
      data-fullscreen={isFullscreen ? 'true' : 'false'}
      className="relative w-screen h-screen overflow-hidden bg-[#18121E] select-none"
    >
      <div className="fixed inset-0 z-0">
        <TomStageCanvas
          shellState={shellState}
          emotion={emotion}
          personaId={personaId}
          environment={environment}
          timeOfDay={timeOfDay}
          effect3d={effect3d}
          isThinking={isThinking}
          miniGameActive={miniGameActive}
          lipSyncController={lipSyncControllerRef.current!}
          triggerActionRef={triggerCanvasActionRef}
          onBodyPartInteract={handleCareAction}
          onMouseCaught={handleMouseCaught}
          onLipSyncFrame={setLipSyncState}
          onPointerParallax={(gx, gy) => setParallaxTilt({ x: gx, y: gy })}
        />
      </div>

      {shellState === 'title' && (
        <TitleScreenOverlay
          selectedPersona={personaId}
          onSelectPersona={handleSelectPersona}
          onStartGame={handleStartGame}
        />
      )}

      {shellState === 'playing' && (
        <GameHud
          stats={stats}
          emotion={emotion}
          personaId={personaId}
          environment={environment}
          timeOfDay={timeOfDay}
          effect3d={effect3d}
          parallaxTilt={parallaxTilt}
          mimicMode={mimicMode}
          miniGameActive={miniGameActive}
          isMuted={isMuted}
          isFullscreen={isFullscreen}
          isThinking={isThinking}
          isRecordingMic={isRecordingMic}
          activeTomSpeech={activeTomSpeech}
          followUps={followUps}
          chatLog={chatLog}
          lipSyncState={lipSyncState}
          errorBanner={errorBanner}
          onSelectPersona={handleSelectPersona}
          onCycleEnvironment={handleCycleEnvironment}
          onCycleTimeOfDay={handleCycleTimeOfDay}
          onCycle3DEffect={handleCycle3DEffect}
          onCareAction={handleCareAction}
          onTriggerMeow={handleTriggerMeow}
          onSendMessage={handleSendMessage}
          onToggleMimicMode={() => setMimicMode((prev) => !prev)}
          onToggleMiniGame={() => setMiniGameActive((prev) => !prev)}
          onToggleMicRecording={handleToggleMicRecording}
          onToggleMute={() =>
            setIsMuted((prev) => {
              const next = !prev;
              lipSyncControllerRef.current?.setMuted(next);
              return next;
            })
          }
          onToggleFullscreen={handleToggleFullscreen}
          onPause={() => {
            lipSyncControllerRef.current?.stop();
            document.body.dataset.state = 'paused';
            setShellState('paused');
          }}
          onRestart={handleRestartSession}
        />
      )}

      {(shellState === 'paused' || shellState === 'gameover') && (
        <StatusModals
          mode={shellState}
          stats={stats}
          onResume={() => {
            document.body.dataset.state = 'playing';
            setShellState('playing');
          }}
          onRestart={handleRestartSession}
          onReturnTitle={() => {
            lipSyncControllerRef.current?.stop();
            document.body.dataset.state = 'title';
            setShellState('title');
          }}
        />
      )}
    </main>
  );
}
