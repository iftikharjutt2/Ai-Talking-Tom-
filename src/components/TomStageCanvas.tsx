import React, { useEffect, useRef } from 'react';
import {
  STAGE_3D_EFFECTS,
  computeCharacter3DOffsets,
  computeCharacterLighting,
  project3DPoint,
  type CareActionType,
  type Character3DLayerOffsets,
  type CharacterLightingParams,
  type GameShellState,
  type Stage3DEffectId,
  type StageEnvironmentId,
  type TimeOfDayId,
  type TomEmotion,
  type TomPersonaId,
} from '../game/tomState';
import type { AudioLipSyncController, LiveLipSyncSnapshot } from '../game/soundEngine';
import type { VisemeParams } from '../game/lipSyncEngine';

export interface TomStageCanvasProps {
  shellState: GameShellState;
  emotion: TomEmotion;
  personaId: TomPersonaId;
  environment: StageEnvironmentId;
  timeOfDay: TimeOfDayId;
  effect3d: Stage3DEffectId;
  isThinking: boolean;
  miniGameActive: boolean;
  lipSyncController: AudioLipSyncController;
  triggerActionRef: React.MutableRefObject<((action: CareActionType) => void) | null>;
  onBodyPartInteract: (action: CareActionType) => void;
  onMouseCaught: () => void;
  onLipSyncFrame?: (snapshot: LiveLipSyncSnapshot) => void;
  onPointerParallax?: (gazeX: number, gazeY: number) => void;
}

interface PooledParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
  color: string;
  shape: 'heart' | 'note' | 'star' | 'crumb' | 'spark';
  rotation: number;
  vRot: number;
}

interface AmbientMote3D {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  baseRadius: number;
  phase: number;
}

interface ToyMouseEntity {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  archetype: 'sprinter' | 'orbiter' | 'zigzagger';
  phaseTimer: number;
  hitFlash: number;
}

const PARTICLE_POOL_SIZE = 64;
const AMBIENT_MOTE_COUNT = 26;

export const TomStageCanvas: React.FC<TomStageCanvasProps> = ({
  shellState,
  emotion,
  personaId,
  environment,
  timeOfDay,
  effect3d,
  isThinking,
  miniGameActive,
  lipSyncController,
  triggerActionRef,
  onBodyPartInteract,
  onMouseCaught,
  onLipSyncFrame,
  onPointerParallax,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const stateRef = useRef({
    shellState,
    emotion,
    personaId,
    environment,
    timeOfDay,
    effect3d,
    isThinking,
    miniGameActive,
    onBodyPartInteract,
    onMouseCaught,
    onLipSyncFrame,
    onPointerParallax,
  });

  useEffect(() => {
    stateRef.current = {
      shellState,
      emotion,
      personaId,
      environment,
      timeOfDay,
      effect3d,
      isThinking,
      miniGameActive,
      onBodyPartInteract,
      onMouseCaught,
      onLipSyncFrame,
      onPointerParallax,
    };
  }, [
    shellState,
    emotion,
    personaId,
    environment,
    timeOfDay,
    effect3d,
    isThinking,
    miniGameActive,
    onBodyPartInteract,
    onMouseCaught,
    onLipSyncFrame,
    onPointerParallax,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = canvas.clientWidth || window.innerWidth;
    let height = canvas.clientHeight || window.innerHeight;
    let dpr = Math.min(2, window.devicePixelRatio || 1);

    const updateCanvasSize = () => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      width = Math.max(320, rect.width || window.innerWidth);
      height = Math.max(320, rect.height || window.innerHeight);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    };

    updateCanvasSize();
    const resizeObserver = new ResizeObserver(() => updateCanvasSize());
    resizeObserver.observe(canvas);

    // Pre-allocate Zero-GC 3D Particle Pool
    const particles: PooledParticle[] = Array.from({ length: PARTICLE_POOL_SIZE }, () => ({
      active: false,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      size: 10,
      alpha: 1,
      life: 0,
      maxLife: 1,
      color: '#F59E0B',
      shape: 'spark',
      rotation: 0,
      vRot: 0,
    }));

    // Pre-allocate Zero-GC 3D Atmospheric Depth Motes
    const ambientMotes: AmbientMote3D[] = Array.from({ length: AMBIENT_MOTE_COUNT }, (_, idx) => ({
      x: ((idx * 97) % 760) - 380,
      y: ((idx * 61) % 480) - 240,
      z: ((idx * 53) % 280) - 140,
      vx: (idx % 2 === 0 ? 1 : -1) * (8 + (idx % 7) * 2),
      vy: -6 - (idx % 5) * 2.5,
      vz: ((idx % 3) - 1) * 9,
      baseRadius: 2.2 + (idx % 4) * 1.1,
      phase: idx * 0.7,
    }));

    let particleCursor = 0;
    const spawnParticles = (
      x: number,
      y: number,
      count: number,
      shape: PooledParticle['shape'],
      color: string,
      speedScale = 1
    ) => {
      for (let i = 0; i < count; i++) {
        const p = particles[particleCursor];
        particleCursor = (particleCursor + 1) % PARTICLE_POOL_SIZE;
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;
        const speed = (65 + Math.random() * 140) * speedScale;
        p.active = true;
        p.x = x + (Math.random() - 0.5) * 36;
        p.y = y + (Math.random() - 0.5) * 36;
        p.z = 20 + Math.random() * 60;
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed - 40;
        p.vz = (Math.random() - 0.3) * 110;
        p.size = 9 + Math.random() * 9;
        p.alpha = 1;
        p.life = 0;
        p.maxLife = 0.65 + Math.random() * 0.55;
        p.color = color;
        p.shape = shape;
        p.rotation = (Math.random() - 0.5) * 0.6;
        p.vRot = (Math.random() - 0.5) * 4;
      }
    };

    const rig = {
      time: 0,
      pointerX: width * 0.55,
      pointerY: height * 0.42,
      gazeX: 0.14,
      gazeY: -0.08,
      scaleX: 1,
      scaleY: 1,
      jumpOffsetY: 0,
      jumpVelY: 0,
      headTilt: 0,
      earTwitchLeft: 0,
      earTwitchRight: 0,
      blinkTimer: 2.8,
      blinkProgress: 0,
      tailPhase: 0,
      guitarTimer: 0,
      eatingTimer: 0,
      drinkingTimer: 0,
      tickleTimer: 0,
      hitFlash: 0,
      hitstopTimer: 0,
      cameraTrauma: 0,
      restMeowCooldown: 3.6,
      restMeowBubbleTimer: 0,
      restMeowText: 'Meow! 🐾',
      mouth: {
        viseme: 'SIL',
        jawOpen: 0,
        mouthWidth: 1,
        lipRound: 0,
        tongueUp: 0,
        teethShow: 0,
      } as VisemeParams,
    };

    const toyMouse: ToyMouseEntity = {
      active: false,
      x: width * 0.35,
      y: height * 0.72,
      vx: 160,
      vy: 90,
      angle: 0,
      archetype: 'sprinter',
      phaseTimer: 0,
      hitFlash: 0,
    };

    const archetypes: ToyMouseEntity['archetype'][] = ['sprinter', 'orbiter', 'zigzagger'];
    let archetypeIdx = 0;

    triggerActionRef.current = (action: CareActionType) => {
      const tomCenterX = stateRef.current.shellState === 'title' ? width * 0.64 : width * 0.5;
      const tomCenterY = height * 0.48;

      if (action === 'feed_salmon') {
        rig.eatingTimer = 1.6;
        rig.scaleX = 1.14;
        rig.scaleY = 0.88;
        spawnParticles(tomCenterX, tomCenterY - 10, 14, 'crumb', '#FB923C', 1.1);
        spawnParticles(tomCenterX, tomCenterY - 70, 8, 'heart', '#F43F5E', 0.9);
      } else if (action === 'drink_milk') {
        rig.drinkingTimer = 1.5;
        rig.scaleX = 0.9;
        rig.scaleY = 1.12;
        spawnParticles(tomCenterX, tomCenterY - 20, 12, 'spark', '#38BDF8', 1.0);
      } else if (action === 'tickle_belly') {
        rig.tickleTimer = 1.8;
        rig.scaleX = 1.18;
        rig.scaleY = 0.84;
        rig.cameraTrauma = 0.25;
        spawnParticles(tomCenterX, tomCenterY + 20, 16, 'star', '#FACC15', 1.2);
      } else if (action === 'head_pat') {
        rig.earTwitchLeft = 0.6;
        rig.earTwitchRight = 0.6;
        rig.scaleX = 1.08;
        rig.scaleY = 0.92;
        spawnParticles(tomCenterX, tomCenterY - 110, 12, 'heart', '#FB7185', 0.95);
      } else if (action === 'play_guitar') {
        rig.guitarTimer = 2.4;
        rig.jumpVelY = -240;
        rig.scaleX = 0.86;
        rig.scaleY = 1.16;
        spawnParticles(tomCenterX, tomCenterY - 40, 18, 'note', '#A855F7', 1.3);
      } else if (action === 'poke_paw') {
        rig.jumpVelY = -310;
        rig.scaleX = 0.85;
        rig.scaleY = 1.18;
        rig.hitFlash = 0.06;
        rig.hitstopTimer = 0.04;
        rig.cameraTrauma = 0.35;
        spawnParticles(tomCenterX, tomCenterY + 40, 14, 'spark', '#34D399', 1.15);
      }
    };

    const screenToCanvas = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    };

    let lastPointerEventMs = 0;
    const handlePointerMove = (e: PointerEvent) => {
      const pt = screenToCanvas(e.clientX, e.clientY);
      rig.pointerX = pt.x;
      rig.pointerY = pt.y;
      lastPointerEventMs = performance.now();
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (stateRef.current.shellState !== 'playing') return;
      const pt = screenToCanvas(e.clientX, e.clientY);
      rig.pointerX = pt.x;
      rig.pointerY = pt.y;
      lastPointerEventMs = performance.now();

      if (stateRef.current.miniGameActive && toyMouse.active) {
        const dxMouse = pt.x - toyMouse.x;
        const dyMouse = pt.y - toyMouse.y;
        if (Math.hypot(dxMouse, dyMouse) < 58) {
          toyMouse.hitFlash = 0.12;
          rig.hitstopTimer = 0.05;
          rig.cameraTrauma = 0.45;
          rig.jumpVelY = -260;
          rig.scaleX = 1.22;
          rig.scaleY = 0.78;
          spawnParticles(toyMouse.x, toyMouse.y, 20, 'star', '#F59E0B', 1.35);
          archetypeIdx = (archetypeIdx + 1) % archetypes.length;
          toyMouse.archetype = archetypes[archetypeIdx];
          toyMouse.x = width * (0.22 + Math.random() * 0.56);
          toyMouse.y = height * (0.58 + Math.random() * 0.22);
          stateRef.current.onMouseCaught();
          return;
        }
      }

      const tomX = width * 0.5;
      const tomY = height * 0.47 + rig.jumpOffsetY;
      const scale = Math.min(width / 960, height / 760) * 1.05;
      const clampedScale = Math.max(0.62, Math.min(1.22, scale));

      const localX = (pt.x - tomX) / clampedScale;
      const localY = (pt.y - tomY) / clampedScale;

      if (Math.hypot(localX, localY + 85) < 95) {
        stateRef.current.onBodyPartInteract('head_pat');
        return;
      }
      if (Math.hypot(localX, localY - 35) < 72) {
        stateRef.current.onBodyPartInteract('tickle_belly');
        return;
      }
      if (Math.hypot(localX, localY - 125) < 95) {
        stateRef.current.onBodyPartInteract('poke_paw');
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    canvas.addEventListener('pointerdown', handlePointerDown);

    let lastFrameMs = performance.now();
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let isDisposed = false;
    let lastUiBroadcastMs = 0;

    const scheduleNextFrame = () => {
      if (isDisposed) return;
      timerId = setTimeout(() => {
        if (isDisposed) return;
        renderLoop(performance.now());
      }, 28);
    };

    const renderLoop = (nowMs: number) => {
      if (isDisposed) return;

      const rawDt = (nowMs - lastFrameMs) / 1000;
      lastFrameMs = nowMs;
      const dt = Math.min(Math.max(0.001, rawDt), 0.05);

      const isPaused = stateRef.current.shellState === 'paused';
      if (isPaused) {
        scheduleNextFrame();
        return;
      }

      if (rig.hitstopTimer > 0) {
        rig.hitstopTimer = Math.max(0, rig.hitstopTimer - dt);
      }
      const simDt = rig.hitstopTimer > 0 ? 0 : dt;

      rig.time += simDt;
      rig.tailPhase += simDt * (stateRef.current.emotion === 'excited' ? 6.5 : 3.2);
      rig.cameraTrauma = Math.max(0, rig.cameraTrauma - dt * 1.8);
      rig.hitFlash = Math.max(0, rig.hitFlash - dt);
      rig.eatingTimer = Math.max(0, rig.eatingTimer - simDt);
      rig.drinkingTimer = Math.max(0, rig.drinkingTimer - simDt);
      rig.tickleTimer = Math.max(0, rig.tickleTimer - simDt);
      rig.guitarTimer = Math.max(0, rig.guitarTimer - simDt);
      rig.earTwitchLeft = Math.max(0, rig.earTwitchLeft - simDt * 3);
      rig.earTwitchRight = Math.max(0, rig.earTwitchRight - simDt * 3);

      const dampFactor = 1 - Math.exp(-12 * simDt);
      rig.scaleX += (1 - rig.scaleX) * dampFactor;
      rig.scaleY += (1 - rig.scaleY) * dampFactor;

      if (rig.jumpOffsetY < 0 || rig.jumpVelY !== 0) {
        rig.jumpOffsetY += rig.jumpVelY * simDt;
        rig.jumpVelY += 980 * simDt;
        if (rig.jumpOffsetY >= 0) {
          rig.jumpOffsetY = 0;
          rig.jumpVelY = 0;
          rig.scaleX = 1.22;
          rig.scaleY = 0.78;
        }
      }

      rig.blinkTimer -= simDt;
      if (rig.blinkTimer <= 0) {
        rig.blinkProgress += simDt * 9;
        if (rig.blinkProgress >= Math.PI) {
          rig.blinkProgress = 0;
          rig.blinkTimer = 2.4 + Math.random() * 3.2;
        }
      }

      const lipSnapshot = lipSyncController.sampleCurrentFrame();
      const lipLerp = 1 - Math.exp(-24 * dt);
      rig.mouth.viseme = lipSnapshot.viseme;
      rig.mouth.jawOpen += (lipSnapshot.params.jawOpen - rig.mouth.jawOpen) * lipLerp;
      rig.mouth.mouthWidth += (lipSnapshot.params.mouthWidth - rig.mouth.mouthWidth) * lipLerp;
      rig.mouth.lipRound += (lipSnapshot.params.lipRound - rig.mouth.lipRound) * lipLerp;
      rig.mouth.tongueUp += (lipSnapshot.params.tongueUp - rig.mouth.tongueUp) * lipLerp;
      rig.mouth.teethShow += (lipSnapshot.params.teethShow - rig.mouth.teethShow) * lipLerp;

      const tomAnchorX =
        stateRef.current.shellState === 'title' && width >= 900 ? width * 0.65 : width * 0.5;
      const tomAnchorY = height * 0.46;

      rig.restMeowBubbleTimer = Math.max(0, rig.restMeowBubbleTimer - simDt);

      if (!lipSnapshot.isSpeaking) {
        if (rig.eatingTimer > 0) {
          rig.mouth.jawOpen = 0.45 + 0.35 * Math.abs(Math.sin(rig.time * 16));
          rig.mouth.mouthWidth = 1.05;
        } else if (rig.tickleTimer > 0) {
          rig.mouth.jawOpen = 0.65 + 0.2 * Math.sin(rig.time * 20);
          rig.mouth.mouthWidth = 1.3;
          rig.mouth.teethShow = 0.7;
        } else if (
          !stateRef.current.isThinking &&
          rig.drinkingTimer <= 0 &&
          rig.guitarTimer <= 0
        ) {
          // Rest Mode: Tom periodically says a cute "Meow!" when idle
          rig.restMeowCooldown -= simDt;
          if (rig.restMeowCooldown <= 0) {
            const meowPhrases = ['Meow! 🐾', 'Mrrr-meow~', 'Purr... Meow!', 'Mew-meow! 🐱'];
            rig.restMeowText =
              meowPhrases[Math.floor(Math.random() * meowPhrases.length)];
            rig.restMeowBubbleTimer = 1.5;
            rig.restMeowCooldown = 5.2 + Math.random() * 2.4;
            rig.earTwitchLeft = 0.55;
            rig.earTwitchRight = 0.55;
            spawnParticles(tomAnchorX + 42, tomAnchorY - 125, 5, 'note', '#FBBF24', 0.75);
            if (stateRef.current.shellState === 'playing') {
              lipSyncController.playRestMeow('Meow!');
            }
          }
        }
      } else {
        // Reset rest-meow timer whenever Tom is actively speaking an answer
        rig.restMeowCooldown = Math.max(rig.restMeowCooldown, 4.5);
      }

      if (rig.restMeowBubbleTimer > 0 && !lipSnapshot.isSpeaking) {
        const meowEnv = Math.sin(
          (1 - rig.restMeowBubbleTimer / 1.5) * Math.PI
        );
        rig.mouth.jawOpen = Math.max(rig.mouth.jawOpen, Math.max(0, meowEnv * 0.62));
        rig.mouth.lipRound = Math.max(rig.mouth.lipRound, Math.max(0, meowEnv * 0.48));
      }

      // Gentle autonomous 3D figure-8 camera orbit when pointer hasn't moved recently
      const idleOrbitActive = nowMs - lastPointerEventMs > 2200;
      const targetX =
        stateRef.current.miniGameActive && toyMouse.active
          ? toyMouse.x
          : idleOrbitActive
          ? tomAnchorX + Math.sin(rig.time * 1.15) * (width * 0.16)
          : rig.pointerX;
      const targetY =
        stateRef.current.miniGameActive && toyMouse.active
          ? toyMouse.y
          : idleOrbitActive
          ? tomAnchorY - 60 + Math.cos(rig.time * 0.85) * (height * 0.1)
          : rig.pointerY;

      const desiredGazeX = Math.max(-1, Math.min(1, (targetX - tomAnchorX) / (width * 0.35)));
      const desiredGazeY = Math.max(-1, Math.min(1, (targetY - (tomAnchorY - 80)) / (height * 0.35)));
      rig.gazeX += (desiredGazeX - rig.gazeX) * (1 - Math.exp(-8 * simDt));
      rig.gazeY += (desiredGazeY - rig.gazeY) * (1 - Math.exp(-8 * simDt));

      if (nowMs - lastUiBroadcastMs > 65) {
        lastUiBroadcastMs = nowMs;
        stateRef.current.onLipSyncFrame?.(lipSnapshot);
        stateRef.current.onPointerParallax?.(rig.gazeX, rig.gazeY);
      }

      toyMouse.active = stateRef.current.miniGameActive;
      if (toyMouse.active && simDt > 0) {
        toyMouse.phaseTimer += simDt;
        toyMouse.hitFlash = Math.max(0, toyMouse.hitFlash - dt);
        const minX = width * 0.16;
        const maxX = width * 0.84;
        const minY = height * 0.56;
        const maxY = height * 0.78;

        if (toyMouse.archetype === 'sprinter') {
          toyMouse.x += toyMouse.vx * 1.45 * simDt;
          toyMouse.y += toyMouse.vy * 1.1 * simDt;
        } else if (toyMouse.archetype === 'orbiter') {
          const cx = width * 0.5;
          const cy = height * 0.67;
          const orbitR = Math.min(width * 0.26, 220);
          toyMouse.x = cx + Math.cos(toyMouse.phaseTimer * 2.6) * orbitR;
          toyMouse.y = cy + Math.sin(toyMouse.phaseTimer * 3.9) * (orbitR * 0.32);
          toyMouse.vx = -Math.sin(toyMouse.phaseTimer * 2.6);
          toyMouse.vy = Math.cos(toyMouse.phaseTimer * 3.9);
        } else {
          toyMouse.x += toyMouse.vx * simDt;
          toyMouse.y += Math.sin(toyMouse.phaseTimer * 9) * 190 * simDt;
        }

        if (toyMouse.x < minX) {
          toyMouse.x = minX;
          toyMouse.vx = Math.abs(toyMouse.vx);
        } else if (toyMouse.x > maxX) {
          toyMouse.x = maxX;
          toyMouse.vx = -Math.abs(toyMouse.vx);
        }
        if (toyMouse.y < minY) {
          toyMouse.y = minY;
          toyMouse.vy = Math.abs(toyMouse.vy);
        } else if (toyMouse.y > maxY) {
          toyMouse.y = maxY;
          toyMouse.vy = -Math.abs(toyMouse.vy);
        }
        toyMouse.angle = Math.atan2(toyMouse.vy, toyMouse.vx);
      }

      const lighting = computeCharacterLighting(
        stateRef.current.timeOfDay,
        stateRef.current.environment
      );
      const offsets3D = computeCharacter3DOffsets(
        rig.gazeX,
        rig.gazeY,
        stateRef.current.effect3d
      );

      ctx.save();
      ctx.scale(dpr, dpr);

      const shakeMag = rig.cameraTrauma * rig.cameraTrauma * 14;
      if (shakeMag > 0.2) {
        ctx.translate(
          (Math.random() - 0.5) * shakeMag,
          (Math.random() - 0.5) * shakeMag
        );
      }

      // 1. Draw 3D Parallax Room, Perspective Floor Grid, Volumetric God-Rays & 3D Raised Stage Pedestal
      drawEnvironmentStage3D(
        ctx,
        width,
        height,
        rig.time,
        stateRef.current.environment,
        stateRef.current.timeOfDay,
        stateRef.current.effect3d,
        lighting,
        offsets3D,
        rig.mouth.jawOpen,
        lipSnapshot.isSpeaking
      );

      // 2. Draw Far-Depth 3D Atmospheric Motes (z < 0, behind Tom)
      drawAmbient3DMotes(
        ctx,
        ambientMotes,
        simDt,
        rig.time,
        width * 0.5,
        height * 0.48,
        offsets3D,
        lighting.rimLightColor,
        'behind'
      );

      const charScale = Math.max(0.64, Math.min(1.18, Math.min(width / 920, height / 740)));

      // 3. Real-Time 3D Floor Reflection under Tom (strongest in Stage Mirror 3D & Holo-Prism 3D)
      const effectCfg =
        STAGE_3D_EFFECTS.find((e) => e.id === stateRef.current.effect3d) || STAGE_3D_EFFECTS[0];
      if (effectCfg.floorReflectionAlpha > 0.15) {
        ctx.save();
        const reflectY = height * 0.69 + 46;
        ctx.translate(tomAnchorX + offsets3D.torsoOffsetX * 0.4, reflectY);
        ctx.scale(charScale * rig.scaleX * 0.94, -charScale * rig.scaleY * 0.28);
        ctx.globalAlpha = effectCfg.floorReflectionAlpha * 0.38;
        drawTalkingTomCharacter3D(
          ctx,
          rig,
          stateRef.current.emotion,
          stateRef.current.personaId,
          stateRef.current.isThinking,
          lipSnapshot.isSpeaking,
          lighting,
          offsets3D,
          stateRef.current.effect3d,
          true
        );
        ctx.restore();
      }

      // 4. Draw Main 3D Volumetric Talking Tom Character
      ctx.save();
      ctx.translate(tomAnchorX, tomAnchorY + rig.jumpOffsetY);
      ctx.scale(charScale * rig.scaleX, charScale * rig.scaleY);
      drawTalkingTomCharacter3D(
        ctx,
        rig,
        stateRef.current.emotion,
        stateRef.current.personaId,
        stateRef.current.isThinking,
        lipSnapshot.isSpeaking,
        lighting,
        offsets3D,
        stateRef.current.effect3d,
        false
      );
      ctx.restore();

      // 5. Draw Near-Depth 3D Foreground Motes (z >= 0, floating in front of Tom with DOF scale)
      drawAmbient3DMotes(
        ctx,
        ambientMotes,
        0,
        rig.time,
        width * 0.5,
        height * 0.48,
        offsets3D,
        lighting.rimLightColor,
        'front'
      );

      // Subtle atmospheric time-of-day tint wash over scene
      ctx.fillStyle = lighting.ambientTintRgba;
      ctx.fillRect(0, 0, width, height);

      if (toyMouse.active) {
        drawToyMouse3D(ctx, toyMouse, rig.time);
      }

      // 6. 3D Perspective Action Particles
      for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
        const p = particles[i];
        if (!p.active) continue;
        p.life += simDt;
        if (p.life >= p.maxLife) {
          p.active = false;
          continue;
        }
        p.x += p.vx * simDt;
        p.y += p.vy * simDt;
        p.z += p.vz * simDt;
        p.vy += 210 * simDt;
        p.rotation += p.vRot * simDt;
        p.alpha = 1 - p.life / p.maxLife;

        drawPooledParticle3D(ctx, p, width * 0.5, height * 0.5, offsets3D);
      }

      ctx.restore();
      scheduleNextFrame();
    };

    renderLoop(performance.now());

    return () => {
      isDisposed = true;
      if (timerId !== null) clearTimeout(timerId);
      resizeObserver.disconnect();
      window.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [lipSyncController, triggerActionRef]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="tom-stage-canvas"
      data-environment={environment}
      data-time-of-day={timeOfDay}
      data-effect-3d={effect3d}
      aria-label="Interactive 3D Talking Tom character stage. Move cursor to orbit 3D camera, click Tom's head to pat, belly to tickle, or paws to high-five."
      className="block w-full h-full cursor-pointer select-none"
    />
  );
};

function drawAmbient3DMotes(
  ctx: CanvasRenderingContext2D,
  motes: AmbientMote3D[],
  dt: number,
  time: number,
  centerX: number,
  centerY: number,
  offsets3D: Character3DLayerOffsets,
  rimColor: string,
  pass: 'behind' | 'front'
) {
  ctx.save();
  for (let i = 0; i < motes.length; i++) {
    const m = motes[i];
    if (dt > 0) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.z += m.vz * dt;
      if (m.x > 460) m.x = -460;
      if (m.x < -460) m.x = 460;
      if (m.y < -280) m.y = 280;
      if (m.y > 280) m.y = -280;
      if (m.z > 160) m.z = -160;
      if (m.z < -160) m.z = 160;
    }

    const isFront = m.z >= 0;
    if ((pass === 'front' && !isFront) || (pass === 'behind' && isFront)) {
      continue;
    }

    const proj = project3DPoint(
      m.x,
      m.y,
      m.z,
      centerX,
      centerY,
      offsets3D.cameraYaw,
      offsets3D.cameraPitch,
      520
    );

    const pulse = 0.65 + 0.35 * Math.sin(time * 2.4 + m.phase);
    const radius = Math.max(1.2, m.baseRadius * proj.scale);
    ctx.globalAlpha = proj.depthAlpha * pulse * (isFront ? 0.55 : 0.32);
    ctx.fillStyle = rimColor;
    ctx.beginPath();
    ctx.arc(proj.screenX, proj.screenY, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawSkyWindowContent3D(
  ctx: CanvasRenderingContext2D,
  winX: number,
  winY: number,
  winW: number,
  winH: number,
  time: number,
  timeOfDay: TimeOfDayId,
  offsets3D: Character3DLayerOffsets
) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(winX, winY, winW, winH, 16);
  ctx.clip();

  const skyGrad = ctx.createLinearGradient(0, winY, 0, winY + winH);
  if (timeOfDay === 'morning') {
    skyGrad.addColorStop(0, '#38BDF8');
    skyGrad.addColorStop(0.65, '#FDE047');
    skyGrad.addColorStop(1, '#FB923C');
  } else if (timeOfDay === 'day') {
    skyGrad.addColorStop(0, '#0284C7');
    skyGrad.addColorStop(1, '#7DD3FC');
  } else if (timeOfDay === 'sunset') {
    skyGrad.addColorStop(0, '#4C1D95');
    skyGrad.addColorStop(0.55, '#E11D48');
    skyGrad.addColorStop(1, '#F59E0B');
  } else {
    skyGrad.addColorStop(0, '#090D1F');
    skyGrad.addColorStop(1, '#1E1B4B');
  }
  ctx.fillStyle = skyGrad;
  ctx.fillRect(winX, winY, winW, winH);

  // Far-plane 3D parallax offset inside window
  const skyShiftX = -offsets3D.cameraYaw * 42;
  const skyShiftY = -offsets3D.cameraPitch * 32;

  if (timeOfDay === 'night') {
    const moonX = winX + winW * 0.7 + skyShiftX;
    const moonY = winY + winH * 0.3 + skyShiftY;
    ctx.fillStyle = '#FDE68A';
    ctx.beginPath();
    ctx.arc(moonX, moonY, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#090D1F';
    ctx.beginPath();
    ctx.arc(moonX - 6, moonY - 4, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FDE68A';
    for (let s = 0; s < 5; s++) {
      const sx = winX + 24 + ((s * 31) % Math.max(40, winW - 45)) + skyShiftX * 0.6;
      const sy = winY + 28 + ((s * 43) % Math.max(40, winH - 50)) + skyShiftY * 0.6;
      const r = 1.5 + Math.sin(time * 2.5 + s) * 1.1;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(0.6, r), 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    const sunY =
      (timeOfDay === 'day'
        ? winY + winH * 0.28
        : timeOfDay === 'morning'
        ? winY + winH * 0.62
        : winY + winH * 0.72) + skyShiftY;
    const sunX = winX + winW * 0.65 + skyShiftX;
    ctx.fillStyle = timeOfDay === 'sunset' ? '#FDE047' : '#FEF08A';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 18, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3D Recessed Window Sill Inner Depth Wall
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
  ctx.lineWidth = 10;
  ctx.strokeRect(winX + offsets3D.cameraYaw * 12, winY + offsets3D.cameraPitch * 12, winW, winH);

  ctx.restore();
}

function drawPerspectiveFloorGrid3D(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  floorY: number,
  vanishX: number,
  vanishY: number,
  lineColor: string
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, floorY, w, h - floorY);
  ctx.clip();

  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1.6;

  // Radial perspective rays from vanishing point across floor
  const rayCount = 14;
  for (let i = -rayCount; i <= rayCount; i++) {
    const bottomX = w * 0.5 + i * (w * 0.11);
    ctx.beginPath();
    ctx.moveTo(vanishX, vanishY);
    ctx.lineTo(bottomX, h + 20);
    ctx.stroke();
  }

  // Horizontal foreshortened depth lines (exponentially spaced for true 1/z perspective)
  const depthSteps = [0.06, 0.15, 0.27, 0.43, 0.64, 0.88];
  for (const t of depthSteps) {
    const y = floorY + (h - floorY) * t;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  ctx.restore();
}

function drawVolumetricGodRays3D(
  ctx: CanvasRenderingContext2D,
  sourceX: number,
  sourceY: number,
  floorX: number,
  floorY: number,
  rayColorHex: string,
  intensity: number
) {
  if (intensity <= 0.05) return;
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const spread = 55 + i * 38;
    const grad = ctx.createLinearGradient(sourceX, sourceY, floorX, floorY + 90);
    grad.addColorStop(0, `${rayColorHex}33`);
    grad.addColorStop(0.55, `${rayColorHex}18`);
    grad.addColorStop(1, `${rayColorHex}00`);
    ctx.fillStyle = grad;

    ctx.beginPath();
    ctx.moveTo(sourceX - 28, sourceY);
    ctx.lineTo(sourceX + 28, sourceY);
    ctx.lineTo(floorX + spread + (i - 1) * 40, floorY + 95);
    ctx.lineTo(floorX - spread + (i - 1) * 40, floorY + 95);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function draw3DRaisedStagePedestal(
  ctx: CanvasRenderingContext2D,
  rugX: number,
  rugY: number,
  rugRx: number,
  rugRy: number,
  topOuterColor: string,
  topInnerColor: string,
  rimStrokeColor: string,
  sideWallColor: string,
  effect3d: Stage3DEffectId,
  time: number,
  jawOpen: number,
  isSpeaking: boolean
) {
  const pedestalThickness = 18;

  ctx.save();
  // 1. Deep 3D floor contact ambient occlusion shadow beneath pedestal
  ctx.fillStyle = 'rgba(5, 4, 12, 0.58)';
  ctx.beginPath();
  ctx.ellipse(
    rugX,
    rugY + pedestalThickness + 9,
    rugRx * 1.05,
    rugRy * 1.06,
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();

  // 2. 3D Extruded Cylinder Side Wall
  const sideGrad = ctx.createLinearGradient(rugX - rugRx, rugY, rugX + rugRx, rugY);
  sideGrad.addColorStop(0, '#1E1B2E');
  sideGrad.addColorStop(0.35, sideWallColor);
  sideGrad.addColorStop(0.7, '#F59E0B');
  sideGrad.addColorStop(1, '#1E1B2E');

  ctx.fillStyle = sideGrad;
  ctx.beginPath();
  ctx.ellipse(rugX, rugY + pedestalThickness, rugRx, rugRy, 0, 0, Math.PI);
  ctx.lineTo(rugX - rugRx, rugY);
  ctx.ellipse(rugX, rugY, rugRx, rugRy, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fill();

  // 3. Top Beveled Surface of 3D Stage Platform
  ctx.beginPath();
  ctx.ellipse(rugX, rugY, rugRx, rugRy, 0, 0, Math.PI * 2);
  ctx.fillStyle = topOuterColor;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = rimStrokeColor;
  ctx.stroke();

  // Inner plush inlaid disc with 3D radial shading
  const innerGrad = ctx.createRadialGradient(
    rugX - rugRx * 0.2,
    rugY - rugRy * 0.2,
    12,
    rugX,
    rugY,
    rugRx * 0.85
  );
  innerGrad.addColorStop(0, topInnerColor);
  innerGrad.addColorStop(1, topOuterColor);

  ctx.beginPath();
  ctx.ellipse(rugX, rugY, rugRx * 0.84, rugRy * 0.79, 0, 0, Math.PI * 2);
  ctx.fillStyle = innerGrad;
  ctx.fill();

  // 4. Hologram Prism 3D Mode: Concentric 3D Energy Rings & Voice-Reactive 3D Waves
  if (effect3d === 'hologram_prism') {
    for (let r = 0; r < 3; r++) {
      const wavePhase = ((time * 0.9 + r * 0.33) % 1);
      const liftY = -wavePhase * (isSpeaking ? 68 + jawOpen * 55 : 28);
      const scaleR = 0.55 + wavePhase * 0.5;
      ctx.strokeStyle =
        r % 2 === 0
          ? `rgba(56, 189, 248, ${(1 - wavePhase) * 0.75})`
          : `rgba(244, 63, 94, ${(1 - wavePhase) * 0.65})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(
        rugX,
        rugY + liftY,
        rugRx * scaleR,
        rugRy * scaleR,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawEnvironmentStage3D(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  environment: StageEnvironmentId,
  timeOfDay: TimeOfDayId,
  effect3d: Stage3DEffectId,
  lighting: CharacterLightingParams,
  offsets3D: Character3DLayerOffsets,
  jawOpen: number,
  isSpeaking: boolean
) {
  const wallParallaxX = -offsets3D.cameraYaw * 36;
  const wallParallaxY = -offsets3D.cameraPitch * 24;
  const floorY = h * 0.64 + wallParallaxY * 0.4;

  const vanishX = w * 0.5 + wallParallaxX * 1.6;
  const vanishY = floorY - 95 + wallParallaxY;

  const rugX = (w >= 900 ? w * 0.54 : w * 0.5) + offsets3D.torsoOffsetX * 0.5;
  const rugY = h * 0.69 + offsets3D.torsoOffsetY * 0.4;
  const rugRx = Math.min(340, w * 0.36);
  const rugRy = Math.min(82, h * 0.1);

  const effectCfg = STAGE_3D_EFFECTS.find((e) => e.id === effect3d) || STAGE_3D_EFFECTS[0];

  if (environment === 'garden') {
    // ================= SUNNY PATIO GARDEN ENVIRONMENT (3D) =================
    const skyGrad = ctx.createLinearGradient(0, 0, 0, floorY);
    if (timeOfDay === 'morning') {
      skyGrad.addColorStop(0, '#0284C7');
      skyGrad.addColorStop(0.6, '#7DD3FC');
      skyGrad.addColorStop(1, '#FDE68A');
    } else if (timeOfDay === 'day') {
      skyGrad.addColorStop(0, '#0369A1');
      skyGrad.addColorStop(0.6, '#38BDF8');
      skyGrad.addColorStop(1, '#BAE6FD');
    } else if (timeOfDay === 'sunset') {
      skyGrad.addColorStop(0, '#311042');
      skyGrad.addColorStop(0.5, '#BE123C');
      skyGrad.addColorStop(1, '#F59E0B');
    } else {
      skyGrad.addColorStop(0, '#070B19');
      skyGrad.addColorStop(0.6, '#1E1B4B');
      skyGrad.addColorStop(1, '#312E81');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, floorY);

    const celestialX = w * 0.82 + wallParallaxX * 1.3;
    const celestialY =
      (timeOfDay === 'day'
        ? h * 0.18
        : timeOfDay === 'morning'
        ? h * 0.32
        : timeOfDay === 'sunset'
        ? h * 0.42
        : h * 0.2) + wallParallaxY * 1.1;

    ctx.save();
    if (timeOfDay === 'night') {
      ctx.fillStyle = '#FEF08A';
      ctx.beginPath();
      ctx.arc(celestialX, celestialY, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0D132A';
      ctx.beginPath();
      ctx.arc(celestialX - 10, celestialY - 6, 24, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const sunGlow = ctx.createRadialGradient(
        celestialX,
        celestialY,
        10,
        celestialX,
        celestialY,
        96
      );
      sunGlow.addColorStop(0, 'rgba(254, 240, 138, 0.95)');
      sunGlow.addColorStop(0.4, 'rgba(253, 224, 71, 0.35)');
      sunGlow.addColorStop(1, 'rgba(253, 224, 71, 0)');
      ctx.fillStyle = sunGlow;
      ctx.beginPath();
      ctx.arc(celestialX, celestialY, 96, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FEF9C3';
      ctx.beginPath();
      ctx.arc(celestialX, celestialY, 28, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Multi-Layer 3D Parallax Hills
    ctx.fillStyle =
      timeOfDay === 'night'
        ? '#064E3B'
        : timeOfDay === 'sunset'
        ? '#115E59'
        : '#15803D';
    ctx.beginPath();
    ctx.moveTo(0, floorY);
    ctx.quadraticCurveTo(
      w * 0.25 + wallParallaxX * 0.8,
      floorY - 90,
      w * 0.55 + wallParallaxX * 0.8,
      floorY - 28
    );
    ctx.quadraticCurveTo(w * 0.8 + wallParallaxX * 0.8, floorY - 74, w, floorY - 15);
    ctx.lineTo(w, floorY);
    ctx.closePath();
    ctx.fill();

    // 3D Wooden Picket Garden Fence with thickness bevel
    ctx.fillStyle = timeOfDay === 'night' ? '#451A03' : '#78350F';
    ctx.fillRect(0, floorY - 38, w, 8);
    ctx.fillRect(0, floorY - 18, w, 8);
    const picketStep = 48;
    for (let px = 12 + (wallParallaxX * 0.5); px < w; px += picketStep) {
      ctx.fillStyle = timeOfDay === 'night' ? '#271001' : '#451A03';
      ctx.fillRect(px + 4, floorY - 52, 16, 52);
      ctx.fillStyle = timeOfDay === 'night' ? '#451A03' : '#92400E';
      ctx.fillRect(px, floorY - 52, 16, 52);
    }

    // Lush 3D Lawn Floor
    const lawnGrad = ctx.createLinearGradient(0, floorY, 0, h);
    if (timeOfDay === 'night') {
      lawnGrad.addColorStop(0, '#064E3B');
      lawnGrad.addColorStop(1, '#022C22');
    } else if (timeOfDay === 'sunset') {
      lawnGrad.addColorStop(0, '#166534');
      lawnGrad.addColorStop(1, '#052E16');
    } else {
      lawnGrad.addColorStop(0, '#22C55E');
      lawnGrad.addColorStop(1, '#15803D');
    }
    ctx.fillStyle = lawnGrad;
    ctx.fillRect(0, floorY, w, h - floorY);

    drawPerspectiveFloorGrid3D(
      ctx,
      w,
      h,
      floorY,
      vanishX,
      vanishY,
      'rgba(255, 255, 255, 0.08)'
    );

    drawVolumetricGodRays3D(
      ctx,
      celestialX,
      celestialY,
      rugX,
      rugY,
      lighting.rimLightColor,
      effectCfg.godRaysIntensity
    );

    draw3DRaisedStagePedestal(
      ctx,
      rugX,
      rugY,
      rugRx,
      rugRy,
      timeOfDay === 'night' ? '#334155' : '#64748B',
      timeOfDay === 'night' ? '#475569' : '#94A3B8',
      timeOfDay === 'night' ? '#64748B' : '#CBD5E1',
      '#334155',
      effect3d,
      time,
      jawOpen,
      isSpeaking
    );
    return;
  }

  if (environment === 'bedroom') {
    // ================= COZY STARLIGHT BEDROOM ENVIRONMENT (3D) =================
    const wallGrad = ctx.createLinearGradient(0, 0, 0, floorY);
    if (timeOfDay === 'day' || timeOfDay === 'morning') {
      wallGrad.addColorStop(0, '#312E81');
      wallGrad.addColorStop(1, '#4338CA');
    } else if (timeOfDay === 'sunset') {
      wallGrad.addColorStop(0, '#2E1065');
      wallGrad.addColorStop(1, '#581C87');
    } else {
      wallGrad.addColorStop(0, '#0F1026');
      wallGrad.addColorStop(1, '#1E1B4B');
    }
    ctx.fillStyle = wallGrad;
    ctx.fillRect(0, 0, w, h);

    const winW = Math.min(165, w * 0.14);
    const winH = Math.min(195, h * 0.24);
    const winX = w - winW - Math.max(48, w * 0.08) + wallParallaxX;
    const winY = h * 0.13 + wallParallaxY;

    drawSkyWindowContent3D(ctx, winX, winY, winW, winH, time, timeOfDay, offsets3D);
    ctx.save();
    ctx.strokeStyle = '#4C1D95';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.roundRect(winX, winY, winW, winH, 16);
    ctx.stroke();
    ctx.restore();

    const standX = w - Math.max(150, w * 0.18) + wallParallaxX * 0.65;
    const standY = floorY - 76;
    ctx.save();
    // 3D Extruded Nightstand Side Depth
    ctx.fillStyle = '#2E1065';
    ctx.beginPath();
    ctx.roundRect(standX - 10, standY + 4, 72, 76, 8);
    ctx.fill();

    ctx.fillStyle = '#4C1D95';
    ctx.strokeStyle = '#2E1065';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(standX, standY, 72, 76, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#FBBF24';
    ctx.beginPath();
    ctx.arc(standX + 36, standY + 34, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(standX + 31, standY - 22, 10, 22);
    ctx.fillStyle = timeOfDay === 'night' ? '#FDE68A' : '#FEF3C7';
    ctx.beginPath();
    ctx.moveTo(standX + 14, standY - 20);
    ctx.lineTo(standX + 58, standY - 20);
    ctx.lineTo(standX + 48, standY - 52);
    ctx.lineTo(standX + 24, standY - 52);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    const floorGrad = ctx.createLinearGradient(0, floorY, 0, h);
    floorGrad.addColorStop(0, '#1E1B4B');
    floorGrad.addColorStop(1, '#090D16');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, floorY, w, h - floorY);

    drawPerspectiveFloorGrid3D(
      ctx,
      w,
      h,
      floorY,
      vanishX,
      vanishY,
      'rgba(129, 140, 248, 0.12)'
    );

    ctx.fillStyle = '#312E81';
    ctx.fillRect(0, floorY - 10, w, 10);

    drawVolumetricGodRays3D(
      ctx,
      winX + winW * 0.5,
      winY + winH * 0.5,
      rugX,
      rugY,
      lighting.rimLightColor,
      effectCfg.godRaysIntensity
    );

    draw3DRaisedStagePedestal(
      ctx,
      rugX,
      rugY,
      rugRx,
      rugRy,
      '#0D9488',
      '#14B8A6',
      '#5EEAD4',
      '#115E59',
      effect3d,
      time,
      jawOpen,
      isSpeaking
    );
    return;
  }

  // ================= DEFAULT: COZY LIVING ROOM 3D STUDIO =================
  const wallGrad = ctx.createLinearGradient(0, 0, 0, h * 0.72);
  if (timeOfDay === 'day' || timeOfDay === 'morning') {
    wallGrad.addColorStop(0, '#2B243D');
    wallGrad.addColorStop(1, '#43375E');
  } else if (timeOfDay === 'sunset') {
    wallGrad.addColorStop(0, '#36192B');
    wallGrad.addColorStop(1, '#52253B');
  } else {
    wallGrad.addColorStop(0, '#171324');
    wallGrad.addColorStop(1, '#29203A');
  }
  ctx.fillStyle = wallGrad;
  ctx.fillRect(0, 0, w, h);

  // Soft 3D stage spotlight behind Tom
  const spotX = w * 0.5 + wallParallaxX * 0.5;
  const spotY = h * 0.42 + wallParallaxY * 0.5;
  const spotGrad = ctx.createRadialGradient(spotX, spotY, 30, spotX, spotY, Math.max(w, h) * 0.48);
  spotGrad.addColorStop(0, lighting.spotlightRgba);
  spotGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = spotGrad;
  ctx.fillRect(0, 0, w, h);

  // Picture window on upper-right wall with 3D parallax
  const winW = Math.min(175, w * 0.15);
  const winH = Math.min(205, h * 0.25);
  const winX = w - winW - Math.max(48, w * 0.08) + wallParallaxX;
  const winY = h * 0.14 + wallParallaxY;

  drawSkyWindowContent3D(ctx, winX, winY, winW, winH, time, timeOfDay, offsets3D);

  ctx.save();
  // 3D Outer Frame Shadow & Extrusion
  ctx.strokeStyle = '#451A03';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.roundRect(winX + 4, winY + 5, winW, winH, 16);
  ctx.stroke();

  ctx.strokeStyle = '#78350F';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(winX, winY, winW, winH, 16);
  ctx.stroke();

  ctx.strokeStyle = '#92400E';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(winX + winW / 2, winY);
  ctx.lineTo(winX + winW / 2, winY + winH);
  ctx.moveTo(winX, winY + winH / 2);
  ctx.lineTo(winX + winW, winY + winH / 2);
  ctx.stroke();
  ctx.restore();

  // 3D Extruded Wooden Bookshelf on upper-left wall
  const shelfX = Math.max(42, w * 0.06) + wallParallaxX * 0.9;
  const shelfY = h * 0.23 + wallParallaxY * 0.9;
  const shelfW = Math.min(190, w * 0.16);
  ctx.save();
  // 3D Underside depth bevel of shelf
  ctx.fillStyle = '#361E12';
  ctx.beginPath();
  ctx.roundRect(shelfX + 5, shelfY + 6, shelfW, 10, 5);
  ctx.fill();

  ctx.fillStyle = '#7C4A27';
  ctx.beginPath();
  ctx.roundRect(shelfX, shelfY, shelfW, 10, 5);
  ctx.fill();

  const bookColors = ['#F59E0B', '#10B981', '#EC4899', '#38BDF8'];
  bookColors.forEach((col, idx) => {
    const bx = shelfX + 16 + idx * 26;
    const bh = 34 - (idx % 2) * 5;
    const by = shelfY - bh;
    // 3D side depth of each book
    ctx.fillStyle = '#1E1B2E';
    ctx.beginPath();
    ctx.roundRect(bx + 5, by + 2, 18, bh - 2, 3);
    ctx.fill();

    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.roundRect(bx, by, 18, bh, 3);
    ctx.fill();
  });
  ctx.restore();

  // Warm 3D Perspective Wooden Floorboard Horizon
  const floorGrad = ctx.createLinearGradient(0, floorY, 0, h);
  floorGrad.addColorStop(0, '#452719');
  floorGrad.addColorStop(0.4, '#361E12');
  floorGrad.addColorStop(1, '#1A0D07');
  ctx.fillStyle = floorGrad;
  ctx.fillRect(0, floorY, w, h - floorY);

  drawPerspectiveFloorGrid3D(
    ctx,
    w,
    h,
    floorY,
    vanishX,
    vanishY,
    'rgba(245, 158, 11, 0.11)'
  );

  ctx.fillStyle = '#5C3422';
  ctx.fillRect(0, floorY - 10, w, 10);

  // Volumetric 3D God-Rays streaming from Window onto 3D Stage
  drawVolumetricGodRays3D(
    ctx,
    winX + winW * 0.5,
    winY + winH * 0.5,
    rugX,
    rugY,
    lighting.rimLightColor,
    effectCfg.godRaysIntensity
  );

  // Studio Spotlight 3D Mode: Dual overhead volumetric stage cones
  if (effect3d === 'studio_spotlight') {
    drawVolumetricGodRays3D(ctx, w * 0.26, 0, rugX - 30, rugY, '#38BDF8', 0.85);
    drawVolumetricGodRays3D(ctx, w * 0.74, 0, rugX + 30, rugY, '#F59E0B', 0.85);
  }

  // 3D Raised Cylindrical Stage Platform under Tom
  draw3DRaisedStagePedestal(
    ctx,
    rugX,
    rugY,
    rugRx,
    rugRy,
    '#991B1B',
    '#DC2626',
    '#F59E0B',
    '#7F1D1D',
    effect3d,
    time,
    jawOpen,
    isSpeaking
  );
}

function drawTalkingTomCharacter3D(
  ctx: CanvasRenderingContext2D,
  rig: {
    time: number;
    gazeX: number;
    gazeY: number;
    earTwitchLeft: number;
    earTwitchRight: number;
    blinkProgress: number;
    tailPhase: number;
    guitarTimer: number;
    eatingTimer: number;
    drinkingTimer: number;
    tickleTimer: number;
    hitFlash: number;
    mouth: VisemeParams;
  },
  emotion: TomEmotion,
  personaId: TomPersonaId,
  isThinking: boolean,
  isSpeaking: boolean,
  lighting: CharacterLightingParams,
  offsets3D: Character3DLayerOffsets,
  effect3d: Stage3DEffectId,
  isReflectionPass: boolean
) {
  const breathBob = Math.sin(rig.time * 2.8) * 3.5;
  const talkHeadBob = isSpeaking ? Math.sin(rig.time * 15) * (rig.mouth.jawOpen * 4.5) : 0;

  if (!isReflectionPass) {
    // Multi-layered 3D Soft Ambient Occlusion Contact Shadow on Stage Pedestal
    ctx.save();
    const shadowGrad = ctx.createRadialGradient(
      lighting.shadowOffsetX + offsets3D.torsoOffsetX * 0.5,
      162,
      12,
      lighting.shadowOffsetX + offsets3D.torsoOffsetX * 0.5,
      162,
      102
    );
    shadowGrad.addColorStop(0, `rgba(6, 3, 12, ${Math.min(0.75, lighting.shadowAlpha + 0.18)})`);
    shadowGrad.addColorStop(0.6, `rgba(10, 5, 15, ${lighting.shadowAlpha * 0.7})`);
    shadowGrad.addColorStop(1, 'rgba(10, 5, 15, 0)');
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.ellipse(
      lighting.shadowOffsetX + offsets3D.torsoOffsetX * 0.5,
      162,
      102,
      26,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
  }

  // 1. Z-Layer -35: Animated 3D Cylindrical Tail (shifts opposite to foreground snout!)
  ctx.save();
  ctx.translate(56 + offsets3D.tailOffsetX, 122 + offsets3D.tailOffsetY);
  const tailSwing = Math.sin(rig.tailPhase) * 0.28;
  ctx.rotate(tailSwing);
  ctx.lineCap = 'round';
  ctx.lineWidth = 26;
  ctx.strokeStyle = '#1E293B';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(55, -10, 95, -65, 72, -115);
  ctx.stroke();

  ctx.lineWidth = 22;
  ctx.strokeStyle = lighting.furShadowHex;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(55, -10, 95, -65, 72, -115);
  ctx.stroke();

  // 3D Cylindrical Highlight along tail spine
  ctx.lineWidth = 8;
  ctx.strokeStyle = lighting.furHighlightHex;
  ctx.beginPath();
  ctx.moveTo(6, -4);
  ctx.bezierCurveTo(52, -14, 88, -64, 70, -112);
  ctx.stroke();

  ctx.lineWidth = 20;
  ctx.strokeStyle = lighting.bellyHex;
  ctx.beginPath();
  ctx.moveTo(76, -98);
  ctx.lineTo(72, -115);
  ctx.stroke();
  ctx.restore();

  // 2. Z-Layer +8: 3D Spherical Hind Feet / Paws
  const drawFoot3D = (fx: number, fy: number) => {
    ctx.save();
    ctx.translate(fx + offsets3D.torsoOffsetX * 0.8, fy + offsets3D.torsoOffsetY * 0.5);
    const footGrad = ctx.createRadialGradient(-8, -8, 4, 0, 2, 34);
    footGrad.addColorStop(0, '#FFFFFF');
    footGrad.addColorStop(0.55, lighting.furHighlightHex);
    footGrad.addColorStop(1, lighting.furShadowHex);

    ctx.fillStyle = footGrad;
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 35, 21, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-10, 5);
    ctx.lineTo(-10, 16);
    ctx.moveTo(10, 5);
    ctx.lineTo(10, 16);
    ctx.stroke();
    ctx.restore();
  };
  drawFoot3D(-46, 152);
  drawFoot3D(46, 152);

  // 3. Z-Layer +10: 3D Volumetric Torso / Plush Belly with Rim Light & Cast Head Shadow
  ctx.save();
  ctx.translate(offsets3D.torsoOffsetX, breathBob * 0.5 + offsets3D.torsoOffsetY);
  const bodyLightX = Math.sin(lighting.lightSourceAngle) * 28 + offsets3D.headOffsetX * 0.6;
  const bodyGrad = ctx.createRadialGradient(bodyLightX, 18, 12, 0, 62, 95);
  bodyGrad.addColorStop(0, '#FFFFFF');
  bodyGrad.addColorStop(0.25, lighting.furHighlightHex);
  bodyGrad.addColorStop(0.65, lighting.furMidHex);
  bodyGrad.addColorStop(1, '#334155');

  ctx.fillStyle = rig.hitFlash > 0 ? '#FFFFFF' : bodyGrad;
  ctx.strokeStyle = '#1E293B';
  ctx.lineWidth = 3.5;

  ctx.beginPath();
  ctx.ellipse(0, 62, 69, 89, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 3D Rim Light Crescent along Torso Edge
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 62, 67, 87, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle =
    effect3d === 'hologram_prism' ? '#38BDF8' : lighting.rimLightColor;
  ctx.globalAlpha = lighting.rimLightAlpha * 0.85;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.ellipse(offsets3D.rimShiftX, 62 + offsets3D.rimShiftY, 67, 87, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // 3D Spherical Cream-Gray Belly Patch
  const bellyGrad = ctx.createRadialGradient(
    offsets3D.muzzleOffsetX * 0.35,
    48,
    8,
    0,
    68,
    64
  );
  bellyGrad.addColorStop(0, '#FFFFFF');
  bellyGrad.addColorStop(0.7, lighting.bellyHex);
  bellyGrad.addColorStop(1, lighting.furHighlightHex);

  ctx.fillStyle = bellyGrad;
  ctx.beginPath();
  ctx.ellipse(offsets3D.torsoOffsetX * 0.3, 68, 45, 64, 0, 0, Math.PI * 2);
  ctx.fill();

  // Deep 3D Ambient Occlusion Shadow cast by Head onto Upper Chest
  const neckShadowGrad = ctx.createRadialGradient(
    offsets3D.headOffsetX * 0.6,
    -6,
    6,
    offsets3D.headOffsetX * 0.6,
    2,
    56
  );
  neckShadowGrad.addColorStop(0, 'rgba(15, 23, 42, 0.48)');
  neckShadowGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = neckShadowGrad;
  ctx.beginPath();
  ctx.ellipse(offsets3D.headOffsetX * 0.5, 4, 52, 26, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tabby Side Stripes on Torso
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (let s = -1; s <= 1; s++) {
    const sy = 45 + s * 22;
    ctx.beginPath();
    ctx.moveTo(-62, sy);
    ctx.lineTo(-48, sy + 4);
    ctx.moveTo(62, sy);
    ctx.lineTo(48, sy + 4);
    ctx.stroke();
  }

  // 4. Z-Layer +22: 3D Articulated Arms & Spherical Hands
  const leftArmAngle = isThinking
    ? -0.85
    : isSpeaking
    ? -0.25 + Math.sin(rig.time * 10) * 0.16
    : rig.tickleTimer > 0
    ? -0.7 + Math.sin(rig.time * 22) * 0.3
    : 0.15;

  const rightArmAngle =
    rig.guitarTimer > 0
      ? 0.6 + Math.sin(rig.time * 26) * 0.35
      : isSpeaking
      ? 0.25 - Math.sin(rig.time * 10 + 1) * 0.16
      : rig.tickleTimer > 0
      ? 0.7 - Math.sin(rig.time * 22) * 0.3
      : -0.15;

  const drawArm3D = (side: -1 | 1, angle: number) => {
    ctx.save();
    ctx.translate(
      side * 58 + offsets3D.pawsOffsetX * 0.45,
      12 + offsets3D.pawsOffsetY * 0.45
    );
    ctx.rotate(angle);

    // Arm drop shadow onto torso
    ctx.fillStyle = 'rgba(15, 23, 42, 0.28)';
    ctx.beginPath();
    ctx.roundRect(side === -1 ? -14 : -18, 5, 32, 76, 16);
    ctx.fill();

    const armGrad = ctx.createLinearGradient(-16, 0, 16, 0);
    armGrad.addColorStop(0, lighting.furHighlightHex);
    armGrad.addColorStop(0.55, lighting.furMidHex);
    armGrad.addColorStop(1, lighting.furShadowHex);

    ctx.fillStyle = armGrad;
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(side === -1 ? -18 : -14, 0, 32, 76, 16);
    ctx.fill();
    ctx.stroke();

    // 3D Spherical Paw Hand
    const handX = side === -1 ? -2 : 2;
    const pawGrad = ctx.createRadialGradient(handX - 5, 66, 3, handX, 72, 19);
    pawGrad.addColorStop(0, '#FFFFFF');
    pawGrad.addColorStop(0.7, lighting.bellyHex);
    pawGrad.addColorStop(1, '#94A3B8');
    ctx.fillStyle = pawGrad;
    ctx.beginPath();
    ctx.arc(handX, 72, 18.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };

  drawArm3D(-1, leftArmAngle);
  drawArm3D(1, rightArmAngle);

  // Persona 3D Neck Accessory with Metallic Specular Shine
  if (personaId === 'wise_professor') {
    ctx.fillStyle = '#DC2626';
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(-24, -25);
    ctx.lineTo(-24, -3);
    ctx.closePath();
    ctx.moveTo(0, -14);
    ctx.lineTo(24, -25);
    ctx.lineTo(24, -3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#991B1B';
    ctx.beginPath();
    ctx.arc(0, -14, 6.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (personaId === 'cozy_storyteller') {
    ctx.fillStyle = '#D97706';
    ctx.beginPath();
    ctx.roundRect(-48, -24, 96, 20, 10);
    ctx.fill();
    ctx.fillRect(18, -10, 18, 38);
  } else if (personaId === 'dramatic_poet') {
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, -6, 32, 0.2, Math.PI - 0.2);
    ctx.stroke();
    ctx.fillStyle = '#FBBF24';
    ctx.beginPath();
    ctx.arc(0, 26, 11, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#E11D48';
    ctx.beginPath();
    ctx.roundRect(-45, -22, 90, 15, 7.5);
    ctx.fill();

    // 3D Gold Collar Bell with Specular Glint
    const bellGrad = ctx.createRadialGradient(-3, -15, 1, 0, -12, 10);
    bellGrad.addColorStop(0, '#FEF9C3');
    bellGrad.addColorStop(0.5, '#FBBF24');
    bellGrad.addColorStop(1, '#92400E');
    ctx.fillStyle = bellGrad;
    ctx.strokeStyle = '#78350F';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -12, 9.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  if (rig.guitarTimer > 0) {
    ctx.save();
    ctx.translate(0, 58);
    ctx.rotate(-0.22);
    ctx.fillStyle = '#EF4444';
    ctx.strokeStyle = '#FEF08A';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-45, -25);
    ctx.lineTo(25, -40);
    ctx.lineTo(10, 0);
    ctx.lineTo(40, 25);
    ctx.lineTo(-40, 25);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#78350F';
    ctx.fillRect(20, -14, 75, 12);
    ctx.restore();
  }

  ctx.restore(); // End torso group

  // ================= 5. Z-LAYER +25..+35: 3D HEAD, SNOUT & ANATOMICAL LIP-SYNC RIG =================
  ctx.save();
  const headX = offsets3D.headOffsetX;
  const headY = -86 + breathBob + talkHeadBob + offsets3D.headOffsetY;
  ctx.translate(headX, headY);

  const headTilt =
    (isThinking ? 0.14 : 0) +
    rig.gazeX * 0.07 +
    (emotion === 'curious' ? 0.1 : 0);
  ctx.rotate(headTilt);

  // Z-Layer -15 (relative to head): 3D Articulated Cat Ears with Parallax & Inner Concha Depth
  const drawCatEar3D = (side: -1 | 1, twitch: number) => {
    ctx.save();
    ctx.translate(
      side * 58 + (offsets3D.earsOffsetX - offsets3D.headOffsetX),
      -62 + (offsets3D.earsOffsetY - offsets3D.headOffsetY)
    );
    ctx.rotate(side * (0.22 + twitch * 0.25));

    const earGrad = ctx.createLinearGradient(-20, -48, 20, 22);
    earGrad.addColorStop(0, lighting.furHighlightHex);
    earGrad.addColorStop(0.5, lighting.furMidHex);
    earGrad.addColorStop(1, '#334155');

    ctx.fillStyle = earGrad;
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(-26, 22);
    ctx.quadraticCurveTo(-8, -46, 4, -48);
    ctx.quadraticCurveTo(24, -42, 28, 22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Recessed 3D Pink Inner Ear Cavity
    const innerEarGrad = ctx.createLinearGradient(0, -32, 0, 16);
    innerEarGrad.addColorStop(0, '#BE123C');
    innerEarGrad.addColorStop(0.4, '#FB7185');
    innerEarGrad.addColorStop(1, '#FDA4AF');
    ctx.fillStyle = innerEarGrad;
    ctx.beginPath();
    ctx.moveTo(-14, 16);
    ctx.quadraticCurveTo(-4, -30, 3, -32);
    ctx.quadraticCurveTo(15, -28, 16, 16);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  drawCatEar3D(-1, rig.earTwitchLeft);
  drawCatEar3D(1, rig.earTwitchRight);

  // Main 3D Spherical Cranium & Fluffy Cheek Jowls
  const lightShiftX = Math.sin(lighting.lightSourceAngle) * 24 + rig.gazeX * 14;
  const lightShiftY = -24 + rig.gazeY * 10;
  const headGrad = ctx.createRadialGradient(lightShiftX, lightShiftY, 10, 0, 0, 96);
  headGrad.addColorStop(0, '#FFFFFF');
  headGrad.addColorStop(0.22, lighting.furHighlightHex);
  headGrad.addColorStop(0.68, lighting.furMidHex);
  headGrad.addColorStop(1, '#334155');

  ctx.fillStyle = rig.hitFlash > 0 ? '#FFFFFF' : headGrad;
  ctx.strokeStyle = '#1E293B';
  ctx.lineWidth = 3.5;

  const cheekSpread = 85 + (rig.mouth.mouthWidth - 1) * 14;
  ctx.beginPath();
  ctx.ellipse(0, -4, cheekSpread, 73, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 3D Rim-Light Halo on Cranium Silhouette
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, -4, cheekSpread - 2, 71, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle =
    effect3d === 'hologram_prism' ? '#38BDF8' : lighting.rimLightColor;
  ctx.globalAlpha = lighting.rimLightAlpha * 0.9;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.ellipse(
    offsets3D.rimShiftX,
    -4 + offsets3D.rimShiftY,
    cheekSpread - 2,
    71,
    0,
    0,
    Math.PI * 2
  );
  ctx.stroke();
  ctx.restore();

  // Forehead Tabby 'M' Stripes shifted gently with 3D head curvature
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 4.5;
  ctx.lineCap = 'round';
  const browShiftX = rig.gazeX * 4.5;
  ctx.beginPath();
  ctx.moveTo(-24 + browShiftX, -46);
  ctx.lineTo(-14 + browShiftX, -60);
  ctx.lineTo(0 + browShiftX, -48);
  ctx.lineTo(14 + browShiftX, -60);
  ctx.lineTo(24 + browShiftX, -46);
  ctx.stroke();

  // 3D Recessed Eye Sockets & Glossy Spherical Emerald Eyes
  const drawEye3D = (side: -1 | 1) => {
    ctx.save();
    // Subtle 3D foreshortening when Tom turns left or right
    const eyePerspectiveScaleX = 1 - side * rig.gazeX * 0.08;
    ctx.translate(side * 31 + rig.gazeX * 4, -18 + rig.gazeY * 3);
    ctx.scale(eyePerspectiveScaleX, 1);

    // 3D Orbital Socket Shadow
    ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 23, 27, 0, 0, Math.PI * 2);
    ctx.fill();

    // 3D Spherical Sclera
    const scleraGrad = ctx.createRadialGradient(-5, -6, 3, 0, 0, 24);
    scleraGrad.addColorStop(0, '#FFFFFF');
    scleraGrad.addColorStop(0.75, '#F1F5F9');
    scleraGrad.addColorStop(1, '#CBD5E1');

    ctx.fillStyle = scleraGrad;
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.ellipse(0, 0, 21, 25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const px = rig.gazeX * 6.5;
    const py = rig.gazeY * 6.5;
    const irisGrad = ctx.createRadialGradient(px - 3, py - 3, 2, px, py, 15);
    irisGrad.addColorStop(0, '#6EE7B7');
    irisGrad.addColorStop(0.55, '#10B981');
    irisGrad.addColorStop(1, '#064E3B');
    ctx.fillStyle = irisGrad;
    ctx.beginPath();
    ctx.ellipse(px, py, 13.8, 16.8, 0, 0, Math.PI * 2);
    ctx.fill();

    const pupilScale =
      emotion === 'excited' || emotion === 'surprised' ? 1.25 : 1.0;
    ctx.fillStyle = '#050811';
    ctx.beginPath();
    ctx.ellipse(px, py, 6.5 * pupilScale, 10.5 * pupilScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Dual 3D Cornea Specular Glints
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(px - 4.5, py - 6.5, 4.2, 0, Math.PI * 2);
    ctx.arc(px + 4.5, py + 5.5, 2.0, 0, Math.PI * 2);
    ctx.fill();

    const blinkClosure =
      rig.blinkProgress > 0
        ? Math.sin(rig.blinkProgress)
        : emotion === 'sleepy'
        ? 0.55
        : emotion === 'laughing'
        ? 0.85
        : 0;

    if (blinkClosure > 0.02) {
      ctx.fillStyle = lighting.furMidHex;
      ctx.beginPath();
      ctx.ellipse(0, -25 + blinkClosure * 25, 22, 25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-21, -25 + blinkClosure * 48);
      ctx.quadraticCurveTo(0, -18 + blinkClosure * 48, 21, -25 + blinkClosure * 48);
      ctx.stroke();
    }

    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 4.2;
    ctx.lineCap = 'round';
    const browTilt =
      emotion === 'surprised' || emotion === 'excited'
        ? -8
        : emotion === 'curious' && side === 1
        ? -7
        : emotion === 'sassy' && side === -1
        ? -6
        : 0;
    ctx.beginPath();
    ctx.moveTo(-18, -28 + browTilt);
    ctx.quadraticCurveTo(0, -36 + browTilt, 18, -27);
    ctx.stroke();

    ctx.restore();
  };

  drawEye3D(-1);
  drawEye3D(1);

  if (personaId === 'wise_professor') {
    ctx.save();
    ctx.translate(rig.gazeX * 5, rig.gazeY * 3);
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.arc(-31, -18, 24, 0, Math.PI * 2);
    ctx.moveTo(-7, -18);
    ctx.lineTo(7, -18);
    ctx.arc(31, -18, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // ================= PROTRUDING 3D MUZZLE, SNOUT & SYNCHRONIZED PHONEME MOUTH =================
  ctx.save();
  // Snout protrudes forward in 3D space relative to cranium!
  const snoutShiftX = offsets3D.muzzleOffsetX - offsets3D.headOffsetX;
  const snoutShiftY = offsets3D.muzzleOffsetY - offsets3D.headOffsetY;
  ctx.translate(snoutShiftX, snoutShiftY);

  const { jawOpen, mouthWidth, lipRound, tongueUp, teethShow } = rig.mouth;
  const jawDropPx = jawOpen * 32;

  // 3D Chin & Lower Jaw Volume with under-muzzle shadow
  const chinGrad = ctx.createRadialGradient(0, 26, 4, 0, 34 + jawDropPx * 0.55, 42);
  chinGrad.addColorStop(0, '#FFFFFF');
  chinGrad.addColorStop(0.65, lighting.bellyHex);
  chinGrad.addColorStop(1, '#94A3B8');

  ctx.fillStyle = chinGrad;
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.ellipse(0, 34 + jawDropPx * 0.55, 38 * mouthWidth, 24 + jawDropPx * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (jawOpen > 0.03) {
    const baseRx = 26 * mouthWidth * (1 - lipRound * 0.36);
    const baseRy = Math.max(3, 5 + jawDropPx * 0.72);
    const mouthCenterY = 26 + jawDropPx * 0.35;

    ctx.save();
    ctx.beginPath();
    if (lipRound > 0.6) {
      ctx.ellipse(0, mouthCenterY + 4, baseRx * 0.85, baseRy * 0.95, 0, 0, Math.PI * 2);
    } else {
      ctx.moveTo(-baseRx, mouthCenterY - 2);
      ctx.quadraticCurveTo(0, mouthCenterY - 6, baseRx, mouthCenterY - 2);
      ctx.bezierCurveTo(
        baseRx * 0.9,
        mouthCenterY + baseRy * 1.6,
        -baseRx * 0.9,
        mouthCenterY + baseRy * 1.6,
        -baseRx,
        mouthCenterY - 2
      );
    }
    ctx.closePath();

    // 3D Inner Oral Cavity Depth Gradient
    const cavityGrad = ctx.createRadialGradient(0, mouthCenterY, 2, 0, mouthCenterY + 8, baseRx);
    cavityGrad.addColorStop(0, '#310410');
    cavityGrad.addColorStop(1, '#680822');
    ctx.fillStyle = cavityGrad;
    ctx.fill();
    ctx.clip();

    const tongueYOffset = mouthCenterY + baseRy * (0.95 - tongueUp * 0.55);
    const tongueGrad = ctx.createRadialGradient(
      0,
      tongueYOffset + 2,
      2,
      0,
      tongueYOffset + 8,
      baseRx * 0.8
    );
    tongueGrad.addColorStop(0, '#FDA4AF');
    tongueGrad.addColorStop(0.6, '#FB7185');
    tongueGrad.addColorStop(1, '#E11D48');
    ctx.fillStyle = tongueGrad;
    ctx.beginPath();
    ctx.ellipse(0, tongueYOffset + 8, baseRx * 0.78, baseRy * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#BE123C';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, tongueYOffset - 2);
    ctx.lineTo(0, tongueYOffset + 12);
    ctx.stroke();

    if (teethShow > 0.15) {
      ctx.fillStyle = '#FFFFFF';
      const toothDrop = Math.min(8, teethShow * 8);
      ctx.fillRect(-baseRx * 0.55, mouthCenterY - 6, baseRx * 1.1, toothDrop);

      ctx.beginPath();
      ctx.moveTo(-baseRx * 0.58, mouthCenterY - 2);
      ctx.lineTo(-baseRx * 0.44, mouthCenterY + toothDrop + 4);
      ctx.lineTo(-baseRx * 0.32, mouthCenterY - 2);
      ctx.moveTo(baseRx * 0.58, mouthCenterY - 2);
      ctx.lineTo(baseRx * 0.44, mouthCenterY + toothDrop + 4);
      ctx.lineTo(baseRx * 0.32, mouthCenterY - 2);
      ctx.fill();
    }

    ctx.restore();

    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (lipRound > 0.6) {
      ctx.ellipse(0, mouthCenterY + 4, baseRx * 0.85, baseRy * 0.95, 0, 0, Math.PI * 2);
    } else {
      ctx.moveTo(-baseRx, mouthCenterY - 2);
      ctx.quadraticCurveTo(0, mouthCenterY - 6, baseRx, mouthCenterY - 2);
      ctx.bezierCurveTo(
        baseRx * 0.9,
        mouthCenterY + baseRy * 1.6,
        -baseRx * 0.9,
        mouthCenterY + baseRy * 1.6,
        -baseRx,
        mouthCenterY - 2
      );
    }
    ctx.stroke();
  }

  // 3D Spherical Whisker Muzzle Pads
  const padSpread = 22 + (mouthWidth - 1) * 8;
  const padGradLeft = ctx.createRadialGradient(-padSpread - 4, 11, 2, -padSpread, 16, 25);
  padGradLeft.addColorStop(0, '#FFFFFF');
  padGradLeft.addColorStop(0.7, lighting.bellyHex);
  padGradLeft.addColorStop(1, '#94A3B8');

  ctx.fillStyle = padGradLeft;
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(-padSpread, 16, 25, 16.5, -0.1, 0, Math.PI * 2);
  ctx.ellipse(padSpread, 16, 25, 16.5, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 3D Glossy Pink Nose with Specular Highlight
  const noseGrad = ctx.createRadialGradient(-4, 4, 1, 0, 8, 15);
  noseGrad.addColorStop(0, '#FFE4E6');
  noseGrad.addColorStop(0.45, '#FB7185');
  noseGrad.addColorStop(1, '#9F1239');
  ctx.fillStyle = noseGrad;
  ctx.strokeStyle = '#881337';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-14, 2);
  ctx.quadraticCurveTo(0, -4, 14, 2);
  ctx.quadraticCurveTo(10, 15, 0, 17);
  ctx.quadraticCurveTo(-10, 15, -14, 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 3D Specular Nose Glint
  ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
  ctx.beginPath();
  ctx.ellipse(-4, 4, 4.5, 2.2, -0.2, 0, Math.PI * 2);
  ctx.fill();

  // 3D Foreshortened Whiskers
  const whiskerFlex = jawOpen * 0.18 + Math.sin(rig.time * 4) * 0.03;
  ctx.strokeStyle = '#F8FAFC';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  for (const side of [-1, 1] as const) {
    const whiskerPerspectiveScale = 1 + side * rig.gazeX * 0.14;
    for (let wIdx = -1; wIdx <= 1; wIdx++) {
      ctx.save();
      ctx.translate(side * 42, 16 + wIdx * 5);
      ctx.rotate(side * (wIdx * 0.14 - whiskerFlex));
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(
        side * 28 * whiskerPerspectiveScale,
        -3,
        side * 58 * whiskerPerspectiveScale,
        3
      );
      ctx.stroke();
      ctx.restore();
    }
  }

  ctx.restore(); // End protruding 3D snout group

  if (isThinking && !isReflectionPass) {
    ctx.fillStyle = 'rgba(254, 243, 199, 0.92)';
    ctx.beginPath();
    ctx.arc(72, -55, 6, 0, Math.PI * 2);
    ctx.arc(88, -74, 10, 0, Math.PI * 2);
    ctx.arc(110, -96, 15, 0, Math.PI * 2);
    ctx.fill();
  } else if (rig.restMeowBubbleTimer > 0 && !isReflectionPass) {
    ctx.save();
    const popAlpha = Math.min(1, rig.restMeowBubbleTimer * 2.2);
    const floatLift = (1.5 - rig.restMeowBubbleTimer) * 14;
    ctx.globalAlpha = popAlpha;
    ctx.translate(88, -82 - floatLift);

    ctx.fillStyle = '#24162B';
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-52, -20, 112, 36, 14);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#FEF3C7';
    ctx.font = 'bold 14px "Fredoka", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(rig.restMeowText, 4, -2);
    ctx.restore();
  }

  ctx.restore(); // End head group
}

function drawToyMouse3D(
  ctx: CanvasRenderingContext2D,
  mouse: ToyMouseEntity,
  time: number
) {
  ctx.save();
  ctx.translate(mouse.x, mouse.y);
  ctx.rotate(mouse.angle);

  // 3D Ground shadow under toy mouse
  ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
  ctx.beginPath();
  ctx.ellipse(0, 8, 22, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(245, 158, 11, 0.75)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, 28 + Math.sin(time * 8) * 4, 0, Math.PI * 2);
  ctx.stroke();

  const mouseGrad = ctx.createRadialGradient(4, -4, 2, 0, 0, 20);
  mouseGrad.addColorStop(0, '#FDA4AF');
  mouseGrad.addColorStop(0.5, '#F43F5E');
  mouseGrad.addColorStop(1, '#881337');

  ctx.fillStyle = mouse.hitFlash > 0 ? '#FFFFFF' : mouseGrad;
  ctx.strokeStyle = '#881337';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, 20, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#FDA4AF';
  ctx.beginPath();
  ctx.arc(8, -10, 6, 0, Math.PI * 2);
  ctx.arc(8, 10, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#FB7185';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-20, 0);
  ctx.quadraticCurveTo(-32, Math.sin(time * 24) * 10, -44, 0);
  ctx.stroke();

  ctx.restore();
}

function drawPooledParticle3D(
  ctx: CanvasRenderingContext2D,
  p: PooledParticle,
  centerX: number,
  centerY: number,
  offsets3D: Character3DLayerOffsets
) {
  const proj = project3DPoint(
    p.x - centerX,
    p.y - centerY,
    p.z,
    centerX,
    centerY,
    offsets3D.cameraYaw * 0.5,
    offsets3D.cameraPitch * 0.5,
    520
  );

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
  ctx.translate(proj.screenX, proj.screenY);
  ctx.scale(proj.scale, proj.scale);
  ctx.rotate(p.rotation);
  ctx.fillStyle = p.color;

  if (p.shape === 'heart') {
    const s = p.size * 0.6;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.4);
    ctx.bezierCurveTo(-s, -s * 0.5, -s * 1.6, s * 0.6, 0, s * 1.6);
    ctx.bezierCurveTo(s * 1.6, s * 0.6, s, -s * 0.5, 0, s * 0.4);
    ctx.fill();
  } else if (p.shape === 'note') {
    ctx.beginPath();
    ctx.arc(-4, 4, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-1, -10, 3, 14);
    ctx.fillRect(-1, -10, 8, 4);
  } else if (p.shape === 'star') {
    const r = p.size * 0.7;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, p.size * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
