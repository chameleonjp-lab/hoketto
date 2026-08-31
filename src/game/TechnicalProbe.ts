import Phaser from 'phaser';
import { getBoardDefinition, type PlayableBoardId } from '../config/boards';
import type { Point } from '../domain/types';
import { PointerInputController, type PointerInputEvent } from './pointerInput';
import { KeyboardInputController, type KeyboardInputEvent } from './keyboardInput';
import {
  BULLET_RADIUS,
  FIXED_HZ,
  NO_SCORE_EXPANSION_SECONDS,
  NO_SCORE_NOTICE_SECONDS,
  NO_SCORE_PULSE_SECONDS,
  PUCK_RADIUS,
  SHOT_COOLDOWN_TICKS,
  STRAIGHT_BENCH_HEIGHT,
  STRAIGHT_BENCH_WIDTH,
  createStraightBenchState,
  beginStraightBenchResume,
  firePlayerShot,
  getCpuTurret,
  getCpuTurretReadiness,
  getGoalOpeningBounds,
  getPlayerTurret,
  getPlayerTurretReadiness,
  secondsRemaining,
  stepStraightBench,
  suspendStraightBench,
  invalidateStraightBench,
  type TurretReadiness,
  type CpuDifficulty,
  type StraightBenchState,
} from './straightBench';
import { MATCH_SECONDS, type SuspensionReason } from '../domain/match';
import {
  SystemLifecycleController,
  type SystemLifecycleEvent,
  type SystemLifecycleReason,
} from './systemLifecycle';
import { advanceFixedStepClock, createFixedStepClockState } from './fixedStepClock';

const WIDTH = STRAIGHT_BENCH_WIDTH;
const HEIGHT = STRAIGHT_BENCH_HEIGHT;
const BOARD_MARGIN = 24;
const RENDER_RESTORE_TIMEOUT_MS = 5_000;

export interface TechnicalProbeResult {
  readonly playerScore: number;
  readonly cpuScore: number;
  readonly seed: number;
  readonly winner: 'PLAYER' | 'CPU' | 'DRAW';
}

export interface TechnicalProbeReadiness {
  readonly playerReadiness: TurretReadiness;
  readonly cpuReadiness: TurretReadiness;
  readonly chargeRatio: number;
  readonly cooldownSeconds: number;
}

export type TechnicalProbePausePhase = 'playing' | 'paused' | 'resuming' | 'invalid';

export interface TechnicalProbePauseState {
  readonly phase: TechnicalProbePausePhase;
  readonly reason?: SuspensionReason;
  readonly canResume: boolean;
}

export interface TechnicalProbeOptions {
  readonly seed?: number;
  readonly durationSeconds?: number;
  readonly difficulty?: CpuDifficulty;
  readonly board?: PlayableBoardId;
  readonly onResult?: (result: TechnicalProbeResult) => void;
  readonly onShot?: (owner: 'player' | 'cpu') => void;
  readonly onReadinessChange?: (status: TechnicalProbeReadiness) => void;
  readonly onGoal?: (
    team: 'player' | 'cpu',
    scores: { readonly playerScore: number; readonly cpuScore: number },
  ) => void;
  readonly onPauseChange?: (state: TechnicalProbePauseState) => void;
}

class TechnicalProbeScene extends Phaser.Scene {
  private readonly playerColor = 0x00b8a9;
  private readonly cpuColor = 0xe24d35;
  private readonly puckColor = 0xf8fcff;
  private readonly boardColor = 0x000000;
  private readonly lineColor = 0xdbe7f5;
  private graphics!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private cpuGoalText!: Phaser.GameObjects.Text;
  private playerGoalText!: Phaser.GameObjects.Text;
  private coreText!: Phaser.GameObjects.Text;
  private noticeText!: Phaser.GameObjects.Text;
  private canvas!: HTMLCanvasElement;
  private readonly inputController = new PointerInputController({
    board: {
      left: BOARD_MARGIN,
      top: BOARD_MARGIN,
      right: WIDTH - BOARD_MARGIN,
      bottom: HEIGHT - BOARD_MARGIN,
    },
    viewport: { width: WIDTH, height: HEIGHT },
    exclusionPixels: BOARD_MARGIN,
    forward: { origin: getPlayerTurret(), minimumDistance: 32, axis: 'up' },
  });
  private readonly keyboardController = new KeyboardInputController({
    board: {
      left: BOARD_MARGIN,
      top: BOARD_MARGIN,
      right: WIDTH - BOARD_MARGIN,
      bottom: HEIGHT - BOARD_MARGIN,
    },
    viewport: { width: WIDTH, height: HEIGHT },
    exclusionPixels: BOARD_MARGIN,
    forward: { origin: getPlayerTurret(), minimumDistance: 32, axis: 'up' },
  });
  private state: StraightBenchState;
  private aimPoint: Point | null = null;
  private fixedStepClock = createFixedStepClockState();
  private resultReported = false;
  private lastPhase: StraightBenchState['match']['phase'] = 'PLAYING';
  private readonly options: TechnicalProbeOptions;
  private readonly systemLifecycle = new SystemLifecycleController();
  private resizeObserver: ResizeObserver | null = null;
  private resizeFrame: number | null = null;
  private lastCanvasSize: { readonly width: number; readonly height: number } | null = null;
  private renderRecoveryTimer: number | null = null;
  private lastReadinessKey: string | null = null;

  public constructor(options: TechnicalProbeOptions = {}) {
    super('technical-probe');
    this.options = options;
    this.state = createStraightBenchState(
      options.seed ?? 20260814,
      options.durationSeconds ?? MATCH_SECONDS,
      options.difficulty ?? 'practice',
      options.board ?? 'straight-bench',
    );
  }

  public create(): void {
    this.canvas = this.game.canvas;
    this.lastCanvasSize = this.getCanvasSize();
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute(
      'aria-label',
      'ホケットの試合盤面。矢印キーで狙い、EnterまたはSpaceで発射します。',
    );
    this.canvas.addEventListener('focus', this.handleCanvasFocus);
    this.canvas.addEventListener('blur', this.handleCanvasBlur);
    this.canvas.addEventListener('webglcontextlost', this.handleRenderContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.handleRenderContextRestored);
    this.attachSystemLifecycleListeners();
    this.events.once('shutdown', this.handleShutdown, this);
    this.graphics = this.add.graphics();
    this.hudText = this.add.text(0, 0, '', {
      color: '#f4fafc',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
    });
    this.statusText = this.add.text(0, 0, '', {
      color: '#dbe7f5',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '13px',
    });
    this.cpuGoalText = this.add.text(WIDTH / 2, BOARD_MARGIN + 14, '相手ゴール', {
      color: '#ffb4a9',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '12px',
      fontStyle: 'bold',
    });
    this.cpuGoalText.setOrigin(0.5);
    this.playerGoalText = this.add.text(
      WIDTH / 2,
      HEIGHT - BOARD_MARGIN - 14,
      '自分ゴール',
      {
        color: '#9ff8ed',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
        fontStyle: 'bold',
      },
    );
    this.playerGoalText.setOrigin(0.5);
    this.coreText = this.add.text(0, 0, '', {
      color: '#07151d',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px',
      fontStyle: 'bold',
    });
    this.coreText.setOrigin(0.5);
    this.coreText.setVisible(false);
    this.noticeText = this.add.text(WIDTH / 2, HEIGHT / 2, '', {
      color: '#f4fafc',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: WIDTH - 48 },
    });
    this.noticeText.setOrigin(0.5);
    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.on('pointermove', this.handlePointerMove, this);
    this.input.on('pointerup', this.handlePointerUp, this);
    this.input.on('pointerupoutside', this.handlePointerUpOutside, this);
    this.input.on('pointercancel', this.handlePointerCancel, this);
    this.input.keyboard?.on('keydown', this.handleKeyboardDown, this);
    this.syncKeyboardState();
    this.emitPauseState();
    this.render();
  }

  public update(_time: number, delta: number): void {
    const phase = this.state.match.phase;
    if (phase === 'SUSPENDED' || phase === 'RESULT' || phase === 'INVALID') {
      this.fixedStepClock = createFixedStepClockState();
    } else {
      const fixedStepAdvance = advanceFixedStepClock(this.fixedStepClock, delta, FIXED_HZ);
      this.fixedStepClock = fixedStepAdvance.state;
      for (let step = 0; step < fixedStepAdvance.steps; step += 1) {
        this.advanceFixedTick();
      }
      if (fixedStepAdvance.shouldSuspend) this.suspendForPerformance();
    }

    if (this.inputController.getState().phase === 'AIMING' && !this.canAim()) {
      this.applyInputEvent(this.inputController.stateChanged('match-state-change'));
      this.aimPoint = null;
    }
    if (this.canAim() && this.inputController.getState().phase === 'CHARGING') {
      this.inputController.setCharging(false);
    } else if (!this.canAim() && this.inputController.getState().phase === 'READY') {
      this.inputController.setCharging(true);
    }
    if (this.lastPhase === 'COUNTDOWN' && this.state.match.phase !== 'COUNTDOWN') {
      this.emitPauseState();
    }
    this.lastPhase = this.state.match.phase;
    this.syncKeyboardState();
    this.reportResultIfNeeded();
    this.render();
  }

  private reportResultIfNeeded(): void {
    if (this.resultReported || this.state.match.phase !== 'RESULT') return;
    this.resultReported = true;
    const winner =
      this.state.match.playerScore === this.state.match.cpuScore
        ? 'DRAW'
        : this.state.match.playerScore > this.state.match.cpuScore
          ? 'PLAYER'
          : 'CPU';
    const result: TechnicalProbeResult = {
      playerScore: this.state.match.playerScore,
      cpuScore: this.state.match.cpuScore,
      seed: this.state.match.seed,
      winner,
    };
    window.setTimeout(() => this.options.onResult?.(result), 0);
  }

  private canAim(): boolean {
    return (
      (this.state.match.phase === 'PLAYING' || this.state.match.phase === 'OVERTIME') &&
      this.state.cooldownTicks === 0
    );
  }

  private advanceFixedTick(): void {
    const previous = this.state;
    const previousBulletIds = new Set(previous.bullets.map((bullet) => bullet.id));
    this.state = stepStraightBench(previous, 1);

    let observedCpuShot = false;
    for (const bullet of this.state.bullets) {
      if (!previousBulletIds.has(bullet.id)) {
        this.options.onShot?.(bullet.owner);
        observedCpuShot ||= bullet.owner === 'cpu';
      }
    }
    if (this.state.nextBulletId > previous.nextBulletId && !observedCpuShot) {
      this.options.onShot?.('cpu');
    }
    if (this.state.match.playerScore > previous.match.playerScore) {
      this.options.onGoal?.('player', {
        playerScore: this.state.match.playerScore,
        cpuScore: this.state.match.cpuScore,
      });
    }
    if (this.state.match.cpuScore > previous.match.cpuScore) {
      this.options.onGoal?.('cpu', {
        playerScore: this.state.match.playerScore,
        cpuScore: this.state.match.cpuScore,
      });
    }
  }

  private pointFromPointer(pointer: Phaser.Input.Pointer): Point {
    return { x: pointer.x, y: pointer.y };
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.state.match.phase === 'RESULT' || this.state.match.phase === 'SUSPENDED') return;
    this.applyInputEvent(
      this.inputController.pointerDown(pointer.id, this.pointFromPointer(pointer)),
    );
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    this.applyInputEvent(
      this.inputController.pointerMove(pointer.id, this.pointFromPointer(pointer)),
    );
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    this.applyInputEvent(
      this.inputController.pointerUp(pointer.id, this.pointFromPointer(pointer)),
    );
  }

  private handlePointerUpOutside(pointer: Phaser.Input.Pointer): void {
    this.applyInputEvent(this.inputController.pointerCancel(pointer.id, 'outside-input-area'));
    this.aimPoint = null;
  }

  private handlePointerCancel(pointer: Phaser.Input.Pointer): void {
    this.applyInputEvent(this.inputController.pointerCancel(pointer.id));
    this.aimPoint = null;
  }

  private handleCanvasFocus = (): void => {
    this.keyboardController.setFocused(true);
  };

  private handleCanvasBlur = (): void => {
    this.keyboardController.setFocused(false);
  };

  private attachSystemLifecycleListeners(): void {
    this.applySystemLifecycleEvent(
      this.systemLifecycle.setVisibility(document.visibilityState !== 'hidden'),
    );
    this.applySystemLifecycleEvent(this.systemLifecycle.setPortrait(this.isPortrait()));
    this.applySystemLifecycleEvent(this.systemLifecycle.setResizeReady(this.hasUsableCanvasSize()));

    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('orientationchange', this.handleOrientationChange);
    window.addEventListener('pagehide', this.handlePageHide);
    window.addEventListener('pageshow', this.handlePageShow);
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', this.handleResize);
    } else {
      this.resizeObserver = new ResizeObserver(this.handleResize);
      this.resizeObserver.observe(this.canvas);
    }
  }

  private isPortrait(): boolean {
    return window.matchMedia
      ? window.matchMedia('(orientation: portrait)').matches
      : window.innerHeight >= window.innerWidth;
  }

  private hasUsableCanvasSize(): boolean {
    const { width, height } = this.getCanvasSize();
    return width > 0 && height > 0;
  }

  private getCanvasSize(): { readonly width: number; readonly height: number } {
    return {
      width: this.canvas.clientWidth,
      height: this.canvas.clientHeight,
    };
  }

  private handleVisibilityChange = (): void => {
    this.applySystemLifecycleEvent(
      this.systemLifecycle.setVisibility(document.visibilityState !== 'hidden'),
    );
  };

  private handleOrientationChange = (): void => {
    this.applySystemLifecycleEvent(this.systemLifecycle.setPortrait(this.isPortrait()));
  };

  private handlePageHide = (event: PageTransitionEvent): void => {
    if (event.persisted) {
      this.applySystemLifecycleEvent(this.systemLifecycle.setVisibility(false));
    }
  };

  private handlePageShow = (): void => {
    this.applySystemLifecycleEvent(
      this.systemLifecycle.setVisibility(document.visibilityState !== 'hidden'),
    );
    this.applySystemLifecycleEvent(this.systemLifecycle.setPortrait(this.isPortrait()));
    this.applySystemLifecycleEvent(this.systemLifecycle.setResizeReady(this.hasUsableCanvasSize()));
  };

  private handleResize = (): void => {
    const nextSize = this.getCanvasSize();
    if (
      this.lastCanvasSize?.width === nextSize.width &&
      this.lastCanvasSize?.height === nextSize.height
    ) {
      return;
    }
    this.lastCanvasSize = nextSize;
    this.applySystemLifecycleEvent(this.systemLifecycle.setResizeReady(false));
    if (this.resizeFrame !== null) window.cancelAnimationFrame(this.resizeFrame);
    this.resizeFrame = window.requestAnimationFrame(this.finishResize);
  };

  private finishResize = (): void => {
    this.resizeFrame = null;
    this.lastCanvasSize = this.getCanvasSize();
    this.applySystemLifecycleEvent(this.systemLifecycle.setPortrait(this.isPortrait()));
    this.applySystemLifecycleEvent(this.systemLifecycle.setResizeReady(this.hasUsableCanvasSize()));
  };

  private handleRenderContextLost = (event: Event): void => {
    event.preventDefault();
    this.clearRenderRecoveryTimer();
    this.applySystemLifecycleEvent(this.systemLifecycle.setRenderReady(false));
    this.renderRecoveryTimer = window.setTimeout(
      this.handleRenderRecoveryTimeout,
      RENDER_RESTORE_TIMEOUT_MS,
    );
  };

  private handleRenderContextRestored = (): void => {
    this.clearRenderRecoveryTimer();
    this.applySystemLifecycleEvent(this.systemLifecycle.setRenderReady(true));
    this.render();
  };

  private handleRenderRecoveryTimeout = (): void => {
    this.renderRecoveryTimer = null;
    if (
      this.state.match.phase !== 'SUSPENDED' ||
      this.state.match.suspensionReason !== 'render-loss' ||
      this.systemLifecycle.getState().renderReady
    ) {
      return;
    }
    this.state = invalidateStraightBench(this.state, 'render-restore-timeout');
    this.keyboardController.setPaused(true);
    this.emitPauseState();
    this.render();
  };

  private clearRenderRecoveryTimer(): void {
    if (this.renderRecoveryTimer !== null) {
      window.clearTimeout(this.renderRecoveryTimer);
      this.renderRecoveryTimer = null;
    }
  }

  private applySystemLifecycleEvent(event: SystemLifecycleEvent): void {
    if (event.kind === 'suspend') {
      this.suspendForSystem(event.reason);
      return;
    }
    if (event.kind === 'resume-available' || event.kind === 'resume-blocked') {
      this.emitPauseState();
    }
  }

  private suspendForSystem(reason: SystemLifecycleReason): void {
    if (this.state.match.phase === 'RESULT' || this.state.match.phase === 'INVALID') return;
    this.applyInputEvent(this.inputController.stateChanged(`system-${reason}`));
    this.aimPoint = null;
    this.state = suspendStraightBench(this.state, reason);
    this.fixedStepClock = createFixedStepClockState();
    this.keyboardController.setPaused(true);
    this.emitPauseState();
  }

  private suspendForPerformance(): void {
    if (
      this.state.match.phase === 'RESULT' ||
      this.state.match.phase === 'INVALID' ||
      this.state.match.phase === 'SUSPENDED'
    ) {
      return;
    }
    this.applyInputEvent(this.inputController.stateChanged('performance-lag'));
    this.aimPoint = null;
    this.state = suspendStraightBench(this.state, 'lag');
    this.fixedStepClock = createFixedStepClockState();
    this.keyboardController.setPaused(true);
    this.emitPauseState();
  }

  private emitPauseState(): void {
    const phase: TechnicalProbePausePhase =
      this.state.match.phase === 'INVALID'
        ? 'invalid'
        : this.state.match.phase === 'SUSPENDED'
          ? 'paused'
          : this.state.match.phase === 'COUNTDOWN'
            ? 'resuming'
            : 'playing';
    this.options.onPauseChange?.({
      phase,
      reason: this.state.match.suspensionReason,
      canResume: phase === 'paused' && this.canResumeFromPause(),
    });
  }

  private canResumeFromPause(): boolean {
    return this.state.match.phase === 'SUSPENDED' && this.systemLifecycle.isReady();
  }

  private emitReadinessChange(): void {
    const playerReadiness = getPlayerTurretReadiness(this.state);
    const cpuReadiness = getCpuTurretReadiness(this.state);
    const cooldownTicks = playerReadiness === 'charging' ? this.state.cooldownTicks : 0;
    const chargeRatio =
      playerReadiness === 'ready'
        ? 1
        : playerReadiness === 'charging'
          ? 1 - cooldownTicks / SHOT_COOLDOWN_TICKS
          : 0;
    const key = `${playerReadiness}:${cpuReadiness}:${cooldownTicks}`;
    if (key === this.lastReadinessKey) return;
    this.lastReadinessKey = key;
    this.options.onReadinessChange?.({
      playerReadiness,
      cpuReadiness,
      chargeRatio: Math.max(0, Math.min(1, chargeRatio)),
      cooldownSeconds: cooldownTicks / FIXED_HZ,
    });
  }

  private handleShutdown = (): void => {
    this.input.keyboard?.off('keydown', this.handleKeyboardDown, this);
    this.canvas.removeEventListener('focus', this.handleCanvasFocus);
    this.canvas.removeEventListener('blur', this.handleCanvasBlur);
    this.canvas.removeEventListener('webglcontextlost', this.handleRenderContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleRenderContextRestored);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('orientationchange', this.handleOrientationChange);
    window.removeEventListener('pagehide', this.handlePageHide);
    window.removeEventListener('pageshow', this.handlePageShow);
    window.removeEventListener('resize', this.handleResize);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.resizeFrame !== null) window.cancelAnimationFrame(this.resizeFrame);
    this.resizeFrame = null;
    this.clearRenderRecoveryTimer();
  };

  private handleKeyboardDown(event: KeyboardEvent): void {
    const isAimKey = event.key.startsWith('Arrow');
    const isActionKey = event.key === 'Enter' || event.key === ' ' || event.key === 'Escape';
    if (!isAimKey && !isActionKey) return;

    if (isAimKey && this.inputController.getState().phase === 'AIMING') {
      this.applyInputEvent(this.inputController.stateChanged('keyboard-input'));
      this.aimPoint = null;
    }
    const inputEvent = this.keyboardController.keyDown(event);
    if (inputEvent.kind !== 'ignored') event.preventDefault();
    this.applyKeyboardInputEvent(inputEvent);
  }

  private applyKeyboardInputEvent(event: KeyboardInputEvent): void {
    if (event.kind === 'aim-update') return;
    if (event.kind === 'pause-request') {
      this.togglePause();
      return;
    }
    if (event.kind === 'resume-request') {
      this.resumeFromPause();
      return;
    }
    if (event.kind === 'fire') {
      if (this.inputController.getState().phase === 'AIMING') return;
      const nextState = firePlayerShot(this.state, event.point);
      if (nextState !== this.state) this.options.onShot?.('player');
      this.state = nextState;
      return;
    }
  }

  private syncKeyboardState(): void {
    if (this.state.match.phase === 'SUSPENDED') {
      this.keyboardController.setPaused(true);
      return;
    }
    this.keyboardController.setPaused(false);
    const active = this.state.match.phase === 'PLAYING' || this.state.match.phase === 'OVERTIME';
    this.keyboardController.setActive(active);
    if (active) this.keyboardController.setCharging(!this.canAim());
  }

  public togglePause(): void {
    if (this.state.match.phase === 'SUSPENDED') {
      this.resumeFromPause();
      return;
    }
    if (
      this.state.match.phase === 'RESULT' ||
      this.state.match.phase === 'INVALID' ||
      this.state.match.phase === 'COUNTDOWN'
    ) {
      return;
    }
    this.applyInputEvent(this.inputController.stateChanged('manual-pause'));
    this.aimPoint = null;
    this.state = suspendStraightBench(this.state, 'manual');
    this.fixedStepClock = createFixedStepClockState();
    this.keyboardController.setPaused(true);
    this.emitPauseState();
  }

  private resumeFromPause(): void {
    if (this.state.match.phase !== 'SUSPENDED') return;
    if (!this.canResumeFromPause()) {
      this.emitPauseState();
      return;
    }
    if (this.systemLifecycle.getState().phase === 'SUSPENDED') {
      const lifecycleEvent = this.systemLifecycle.requestResume();
      if (lifecycleEvent.kind !== 'resume-requested') {
        this.emitPauseState();
        return;
      }
    }
    this.state = beginStraightBenchResume(this.state);
    this.fixedStepClock = createFixedStepClockState();
    this.keyboardController.setPaused(false);
    this.emitPauseState();
  }

  private applyInputEvent(event: PointerInputEvent): void {
    if (event.kind === 'aim-start' || event.kind === 'aim-update') {
      this.aimPoint = event.point;
      return;
    }
    if (event.kind === 'fire') {
      const nextState = firePlayerShot(this.state, event.point);
      if (nextState !== this.state) this.options.onShot?.('player');
      this.state = nextState;
      this.aimPoint = null;
      return;
    }
    if (event.kind === 'cancel' || event.kind === 'ignored' || event.kind === 'charging-notice') {
      if (event.kind !== 'ignored') this.aimPoint = null;
    }
  }

  private render(): void {
    const graphics = this.graphics;
    graphics.clear();
    graphics.fillStyle(this.boardColor, 1);
    graphics.fillRect(0, 0, WIDTH, HEIGHT);

    graphics.lineStyle(3, this.lineColor, 0.7);
    graphics.strokeRect(
      BOARD_MARGIN,
      BOARD_MARGIN,
      WIDTH - BOARD_MARGIN * 2,
      HEIGHT - BOARD_MARGIN * 2,
    );
    graphics.lineStyle(1, this.lineColor, 0.25);
    graphics.lineBetween(BOARD_MARGIN, HEIGHT / 2, WIDTH - BOARD_MARGIN, HEIGHT / 2);

    this.drawGoal(graphics, 'top');
    this.drawGoal(graphics, 'bottom');
    this.drawObstacles(graphics);
    this.drawNoScorePressure(graphics);
    this.drawTurret(graphics, getCpuTurret(), this.cpuColor, false);
    this.drawTurret(graphics, getPlayerTurret(), this.playerColor, true);

    const keyboardState = this.keyboardController.getState();
    const keyboardAimPoint = keyboardState.focused ? keyboardState.point : null;
    const visibleAimPoint = this.aimPoint ?? keyboardAimPoint;
    if (
      visibleAimPoint &&
      (this.inputController.getState().phase === 'AIMING' || keyboardAimPoint !== null)
    ) {
      const turret = getPlayerTurret();
      const keyboardAim = this.aimPoint === null && keyboardAimPoint !== null;
      graphics.lineStyle(2, this.playerColor, keyboardAim ? 0.6 : 0.85);
      graphics.lineBetween(turret.x, turret.y, visibleAimPoint.x, visibleAimPoint.y);
      graphics.strokeCircle(visibleAimPoint.x, visibleAimPoint.y, keyboardAim ? 14 : 12);
      if (keyboardAim) {
        graphics.lineBetween(
          visibleAimPoint.x - 20,
          visibleAimPoint.y,
          visibleAimPoint.x + 20,
          visibleAimPoint.y,
        );
        graphics.lineBetween(
          visibleAimPoint.x,
          visibleAimPoint.y - 20,
          visibleAimPoint.x,
          visibleAimPoint.y + 20,
        );
      }
    }

    this.coreText.setVisible(false);
    this.drawCoreReservation(graphics);

    for (const bullet of this.state.bullets) {
      const color = bullet.owner === 'cpu' ? this.cpuColor : this.playerColor;
      graphics.fillStyle(color, 1);
      if (bullet.owner === 'cpu') {
        graphics.fillTriangle(
          bullet.position.x,
          bullet.position.y - BULLET_RADIUS,
          bullet.position.x + BULLET_RADIUS,
          bullet.position.y,
          bullet.position.x,
          bullet.position.y + BULLET_RADIUS,
        );
        graphics.fillTriangle(
          bullet.position.x,
          bullet.position.y - BULLET_RADIUS,
          bullet.position.x - BULLET_RADIUS,
          bullet.position.y,
          bullet.position.x,
          bullet.position.y + BULLET_RADIUS,
        );
      } else {
        graphics.fillCircle(bullet.position.x, bullet.position.y, BULLET_RADIUS);
      }
      graphics.lineStyle(2, 0xf4fafc, 0.9);
      if (bullet.owner === 'cpu') {
        const outlineRadius = BULLET_RADIUS + 2;
        graphics.lineBetween(
          bullet.position.x,
          bullet.position.y - outlineRadius,
          bullet.position.x + outlineRadius,
          bullet.position.y,
        );
        graphics.lineBetween(
          bullet.position.x + outlineRadius,
          bullet.position.y,
          bullet.position.x,
          bullet.position.y + outlineRadius,
        );
        graphics.lineBetween(
          bullet.position.x,
          bullet.position.y + outlineRadius,
          bullet.position.x - outlineRadius,
          bullet.position.y,
        );
        graphics.lineBetween(
          bullet.position.x - outlineRadius,
          bullet.position.y,
          bullet.position.x,
          bullet.position.y - outlineRadius,
        );
      } else {
        graphics.strokeCircle(bullet.position.x, bullet.position.y, BULLET_RADIUS + 2);
      }
    }

    for (const puck of this.state.pucks) {
      if (!puck.active) continue;
      if (puck.points === 2) {
        this.drawCorePuck(graphics, puck.position.x, puck.position.y);
        this.coreText.setPosition(puck.position.x, puck.position.y);
        this.coreText.setText('2');
        this.coreText.setVisible(true);
        continue;
      }
      graphics.fillStyle(this.puckColor, 1);
      graphics.fillCircle(puck.position.x, puck.position.y, puck.radius);
      graphics.lineStyle(2, 0x102832, 1);
      graphics.strokeCircle(puck.position.x, puck.position.y, puck.radius);
    }

    if (this.state.match.phase === 'SUSPENDED') {
      graphics.fillStyle(this.boardColor, 0.92);
      graphics.fillRect(0, 0, WIDTH, HEIGHT);
      graphics.lineStyle(3, this.lineColor, 0.8);
      graphics.strokeRect(
        BOARD_MARGIN,
        BOARD_MARGIN,
        WIDTH - BOARD_MARGIN * 2,
        HEIGHT - BOARD_MARGIN * 2,
      );
    }

    const seconds = Math.max(0, Math.ceil(secondsRemaining(this.state)));
    this.hudText.setPosition(BOARD_MARGIN + 8, 4);
    this.hudText.setText(
      `相手 ◇ ${this.state.match.cpuScore}　｜　${seconds}秒　｜　自分 ○ ${this.state.match.playerScore}`,
    );
    this.statusText.setPosition(BOARD_MARGIN + 8, 20);
    this.statusText.setText(
      `相手: ${readinessLabel(getCpuTurretReadiness(this.state))}　｜　自分: ${readinessLabel(getPlayerTurretReadiness(this.state))}`,
    );
    this.emitReadinessChange();

    const phase = this.state.match.phase;
    const notices: string[] = [];
    if (phase === 'GOAL_PAUSE') notices.push('GOAL');
    if (phase === 'OVERTIME_NOTICE') notices.push('延長15秒・先に1点');
    if (phase === 'OVERTIME') notices.push('延長・先に1点');
    if (phase === 'SUSPENDED') {
      const lifecycleState = this.systemLifecycle.getState();
      if (!lifecycleState.visible) {
        notices.push('画面に戻ると再開できます');
      } else if (!lifecycleState.portrait) {
        notices.push('縦向きに戻してください');
      } else if (!lifecycleState.renderReady) {
        notices.push('描画を復元しています');
      } else if (!lifecycleState.resizeReady) {
        notices.push('画面の大きさを確認しています');
      } else if (this.state.match.suspensionReason === 'lag') {
        notices.push('処理遅延を検知したため停止しました');
      } else if (this.state.match.suspensionReason === 'manual') {
        notices.push('一時停止中');
      } else {
        notices.push('再開できます');
      }
      notices.push(
        this.canResumeFromPause() ? 'EnterまたはSpace、または再開ボタン' : '再開条件を確認中',
      );
    }
    if (phase === 'COUNTDOWN') {
      notices.push(`再開まで ${Math.ceil(this.state.match.resumeCountdownTicks / FIXED_HZ)}秒`);
    }
    if (phase === 'RESULT') notices.push('結果を表示中');
    if (phase === 'INVALID') notices.push('描画を復元できません。ホームへ戻ってやり直してください');
    if (phase === 'PLAYING') {
      const pressure = this.state.noScore;
      if (
        pressure.ticksSinceGoal >= NO_SCORE_NOTICE_SECONDS * FIXED_HZ &&
        pressure.ticksSinceGoal < NO_SCORE_EXPANSION_SECONDS * FIXED_HZ
      ) {
        notices.push('ゴール拡大予告：あと1秒');
      } else if (pressure.goalExpanded) {
        notices.push('ゴール拡大中');
      }
      if (
        pressure.ticksSinceGoal >= NO_SCORE_PULSE_SECONDS * FIXED_HZ - FIXED_HZ &&
        pressure.nextPulseTicks > 0 &&
        pressure.nextPulseTicks <= FIXED_HZ
      ) {
        notices.push(`中央パルス予告：あと${Math.ceil(pressure.nextPulseTicks / FIXED_HZ)}秒`);
      }
      if (pressure.pulseTicksRemaining > 0) notices.push('中央パルス');
    }
    if (this.state.core.phase === 'RESERVED') notices.push('2点コア予告：あと2秒');
    if (
      this.inputController.getState().phase === 'CHARGING' &&
      (phase === 'PLAYING' || phase === 'OVERTIME')
    ) {
      notices.push('充電中');
    }
    if (this.canAim()) {
      notices.push(
        this.keyboardController.getState().focused
          ? '撃てる：矢印で狙い、Enter／Spaceで発射'
          : '撃てる：盤面を触って狙う',
      );
    }
    const notice = notices.join('｜');
    this.noticeText.setText(notice);
    this.noticeText.setVisible(notice.length > 0);
  }

  private drawGoal(graphics: Phaser.GameObjects.Graphics, side: 'top' | 'bottom'): void {
    const y = side === 'top' ? BOARD_MARGIN : HEIGHT - BOARD_MARGIN;
    const goalColor = side === 'top' ? this.cpuColor : this.playerColor;
    const opening = getGoalOpeningBounds(this.state, side);
    graphics.lineStyle(6, goalColor, 0.9);
    graphics.lineBetween(BOARD_MARGIN, y, opening.minX, y);
    graphics.lineBetween(opening.maxX, y, WIDTH - BOARD_MARGIN, y);
    graphics.lineStyle(3, goalColor, 0.65);
    graphics.lineBetween(opening.minX, y, opening.maxX, y);
  }

  private drawObstacles(graphics: Phaser.GameObjects.Graphics): void {
    const board = getBoardDefinition(this.state.board);
    for (const box of board.staticBoxes) {
      graphics.fillStyle(0x102832, 1);
      graphics.fillRect(box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY);
      graphics.lineStyle(3, this.lineColor, 0.85);
      graphics.strokeRect(box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY);
    }
    for (const segment of board.staticSegments) {
      graphics.lineStyle(10, 0x102832, 1);
      graphics.lineBetween(segment.start.x, segment.start.y, segment.end.x, segment.end.y);
      graphics.lineStyle(4, 0xffd34e, 1);
      graphics.lineBetween(segment.start.x, segment.start.y, segment.end.x, segment.end.y);
    }
  }

  private drawNoScorePressure(graphics: Phaser.GameObjects.Graphics): void {
    const remaining = this.state.noScore.pulseTicksRemaining;
    if (remaining <= 0) return;
    const progress = 1 - remaining / Math.max(1, Math.round(0.35 * FIXED_HZ));
    const radius = 24 + progress * 130;
    graphics.lineStyle(4, 0xffd34e, Math.max(0, 1 - progress));
    graphics.strokeCircle(WIDTH / 2, HEIGHT / 2, radius);
  }

  private drawCoreReservation(graphics: Phaser.GameObjects.Graphics): void {
    if (this.state.core.phase !== 'RESERVED' || !this.state.core.position) return;
    const { x, y } = this.state.core.position;
    graphics.lineStyle(8, 0x102832, 1);
    graphics.strokeCircle(x, y, PUCK_RADIUS + 8);
    graphics.lineStyle(3, 0xffd34e, 1);
    graphics.strokeCircle(x, y, PUCK_RADIUS + 8);
    this.coreText.setPosition(x, y);
    this.coreText.setText('2');
    this.coreText.setVisible(true);
  }

  private drawCorePuck(graphics: Phaser.GameObjects.Graphics, x: number, y: number): void {
    const points = Array.from({ length: 6 }, (_, index) => {
      const angle = -Math.PI / 2 + (Math.PI / 3) * index;
      return new Phaser.Math.Vector2(
        x + Math.cos(angle) * PUCK_RADIUS,
        y + Math.sin(angle) * PUCK_RADIUS,
      );
    });
    graphics.fillStyle(0xffd34e, 1);
    graphics.fillPoints(points, true, true);
    graphics.lineStyle(2, 0x102832, 1);
    graphics.strokePoints(points, true, true);
  }

  private drawTurret(
    graphics: Phaser.GameObjects.Graphics,
    position: Point,
    color: number,
    player: boolean,
  ): void {
    graphics.lineStyle(4, color, 1);
    if (player) {
      graphics.fillStyle(color, 0.2);
      graphics.fillCircle(position.x, position.y, 18);
      graphics.strokeCircle(position.x, position.y, 18);
    } else {
      graphics.fillStyle(color, 0.2);
      graphics.fillRect(position.x - 18, position.y - 18, 36, 36);
      graphics.strokeRect(position.x - 18, position.y - 18, 36, 36);
    }
    const readiness = player
      ? getPlayerTurretReadiness(this.state)
      : getCpuTurretReadiness(this.state);
    const cooldownTicks = player ? this.state.cooldownTicks : this.state.cpuCooldownTicks;
    const thinking = readiness === 'thinking';
    const chargeRatio =
      readiness === 'stopped'
        ? 0.25
        : thinking
          ? 0.25
          : cooldownTicks === 0
            ? 1
            : 1 - cooldownTicks / SHOT_COOLDOWN_TICKS;
    const readinessColor =
      readiness === 'ready'
        ? color
        : readiness === 'charging'
          ? 0xffd34e
          : readiness === 'thinking'
            ? 0x8ca7c8
            : 0x7183a5;
    graphics.lineStyle(4, readinessColor, 0.95);
    graphics.strokeCircle(position.x, position.y, 26 * Math.max(0.25, chargeRatio));
  }
}

function readinessLabel(readiness: TurretReadiness): string {
  if (readiness === 'ready') return '撃てる';
  if (readiness === 'thinking') return '観測中';
  if (readiness === 'charging') return '充電中';
  return '停止';
}

export function mountTechnicalProbe(
  parent: HTMLElement,
  options: TechnicalProbeOptions = {},
): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: WIDTH,
    height: HEIGHT,
    backgroundColor: '#000000',
    scene: new TechnicalProbeScene(options),
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      antialias: true,
      pixelArt: false,
    },
  });
}

export function toggleTechnicalProbePause(game: Phaser.Game): void {
  const scene = game.scene.getScene('technical-probe');
  if (scene instanceof TechnicalProbeScene) scene.togglePause();
}
