import Phaser from 'phaser';
import type { Point } from '../domain/types';
import { PointerInputController, type PointerInputEvent } from './pointerInput';
import {
  BULLET_RADIUS,
  FIXED_HZ,
  SHOT_COOLDOWN_TICKS,
  STRAIGHT_BENCH_HEIGHT,
  STRAIGHT_BENCH_WIDTH,
  createStraightBenchState,
  firePlayerShot,
  getCpuTurret,
  getCpuTurretReadiness,
  getPlayerTurret,
  getPlayerTurretReadiness,
  secondsRemaining,
  stepStraightBench,
  type TurretReadiness,
  type StraightBenchState,
} from './straightBench';
import { MATCH_SECONDS } from '../domain/match';

const WIDTH = STRAIGHT_BENCH_WIDTH;
const HEIGHT = STRAIGHT_BENCH_HEIGHT;
const BOARD_MARGIN = 24;

export interface TechnicalProbeResult {
  readonly playerScore: number;
  readonly cpuScore: number;
  readonly seed: number;
  readonly winner: 'PLAYER' | 'CPU' | 'DRAW';
}

export interface TechnicalProbeOptions {
  readonly seed?: number;
  readonly durationSeconds?: number;
  readonly onResult?: (result: TechnicalProbeResult) => void;
}

class TechnicalProbeScene extends Phaser.Scene {
  private readonly playerColor = 0x00b8a9;
  private readonly cpuColor = 0xe24d35;
  private readonly puckColor = 0xf8fcff;
  private readonly boardColor = 0x07151d;
  private readonly lineColor = 0xc8d1e5;
  private graphics!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private noticeText!: Phaser.GameObjects.Text;
  private readonly inputController = new PointerInputController({
    board: {
      left: BOARD_MARGIN,
      top: BOARD_MARGIN,
      right: WIDTH - BOARD_MARGIN,
      bottom: HEIGHT - BOARD_MARGIN,
    },
    viewport: { width: WIDTH, height: HEIGHT },
    exclusionPixels: BOARD_MARGIN,
  });
  private state: StraightBenchState;
  private aimPoint: Point | null = null;
  private accumulatorSeconds = 0;
  private resultReported = false;
  private readonly options: TechnicalProbeOptions;

  public constructor(options: TechnicalProbeOptions = {}) {
    super('technical-probe');
    this.options = options;
    this.state = createStraightBenchState(
      options.seed ?? 20260814,
      options.durationSeconds ?? MATCH_SECONDS,
    );
  }

  public create(): void {
    this.graphics = this.add.graphics();
    this.hudText = this.add.text(0, 0, '', {
      color: '#f4fafc',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px',
      fontStyle: 'bold',
    });
    this.statusText = this.add.text(0, 0, '', {
      color: '#c8d1e5',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '11px',
    });
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
    this.render();
  }

  public update(_time: number, delta: number): void {
    this.accumulatorSeconds += Math.min(delta, 100) / 1000;
    const fixedSeconds = 1 / FIXED_HZ;
    let steps = 0;
    while (this.accumulatorSeconds >= fixedSeconds && steps < 12) {
      this.state = stepStraightBench(this.state, 1);
      this.accumulatorSeconds -= fixedSeconds;
      steps += 1;
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

  private pointFromPointer(pointer: Phaser.Input.Pointer): Point {
    return { x: pointer.x, y: pointer.y };
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.state.match.phase === 'RESULT') return;
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

  private applyInputEvent(event: PointerInputEvent): void {
    if (event.kind === 'aim-start' || event.kind === 'aim-update') {
      this.aimPoint = event.point;
      return;
    }
    if (event.kind === 'fire') {
      this.state = firePlayerShot(this.state, event.point);
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
    this.drawTurret(graphics, getCpuTurret(), this.cpuColor, false);
    this.drawTurret(graphics, getPlayerTurret(), this.playerColor, true);

    if (this.aimPoint && this.inputController.getState().phase === 'AIMING') {
      const turret = getPlayerTurret();
      graphics.lineStyle(2, this.playerColor, 0.85);
      graphics.lineBetween(turret.x, turret.y, this.aimPoint.x, this.aimPoint.y);
      graphics.strokeCircle(this.aimPoint.x, this.aimPoint.y, 12);
    }

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
      graphics.fillStyle(this.puckColor, 1);
      graphics.fillCircle(puck.position.x, puck.position.y, puck.radius);
      graphics.lineStyle(2, 0x102832, 1);
      graphics.strokeCircle(puck.position.x, puck.position.y, puck.radius);
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

    const phase = this.state.match.phase;
    let notice = '';
    if (phase === 'GOAL_PAUSE') notice = 'GOAL';
    if (phase === 'OVERTIME_NOTICE') notice = '延長15秒・先に1点';
    if (phase === 'OVERTIME') notice = '延長・先に1点';
    if (phase === 'RESULT') {
      notice = '結果を表示中';
    }
    if (
      this.inputController.getState().phase === 'CHARGING' &&
      (phase === 'PLAYING' || phase === 'OVERTIME')
    ) {
      notice = '充電中';
    }
    if (this.canAim()) notice = '撃てる：盤面を触って狙う';
    this.noticeText.setText(notice);
    this.noticeText.setVisible(notice.length > 0);
  }

  private drawGoal(graphics: Phaser.GameObjects.Graphics, side: 'top' | 'bottom'): void {
    const y = side === 'top' ? BOARD_MARGIN : HEIGHT - BOARD_MARGIN;
    const goalColor = side === 'top' ? this.cpuColor : this.playerColor;
    graphics.lineStyle(6, goalColor, 0.9);
    graphics.lineBetween(BOARD_MARGIN, y, 122, y);
    graphics.lineBetween(238, y, WIDTH - BOARD_MARGIN, y);
    graphics.lineStyle(3, goalColor, 0.65);
    graphics.lineBetween(122, y, 238, y);
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
    graphics.lineStyle(3, 0xf4fafc, 0.75);
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
    backgroundColor: '#07151d',
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
