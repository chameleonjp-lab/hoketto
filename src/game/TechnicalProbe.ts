import Phaser from 'phaser';

const WIDTH = 360;
const HEIGHT = 640;

class TechnicalProbeScene extends Phaser.Scene {
  private readonly playerColor = 0x35d6c2;
  private readonly cpuColor = 0xff7a59;

  public constructor() {
    super('technical-probe');
  }

  public create(): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(0x10182a, 1);
    graphics.fillRect(0, 0, WIDTH, HEIGHT);
    graphics.lineStyle(4, this.cpuColor, 1);
    graphics.strokeRect(20, 20, WIDTH - 40, HEIGHT - 40);
    graphics.lineStyle(2, 0xc8d1e5, 0.4);
    graphics.lineBetween(20, HEIGHT / 2, WIDTH - 20, HEIGHT / 2);

    graphics.fillStyle(this.cpuColor, 1);
    graphics.fillCircle(WIDTH / 2, 60, 18);
    graphics.fillStyle(this.playerColor, 1);
    graphics.fillCircle(WIDTH / 2, HEIGHT - 60, 18);

    graphics.fillStyle(0xffd166, 1);
    graphics.fillCircle(WIDTH / 2, HEIGHT / 2, 14);
    graphics.lineStyle(4, 0xf6f8ff, 0.9);
    graphics.strokeCircle(WIDTH / 2, HEIGHT / 2, 24);

    this.add
      .text(24, 30, 'CPU', {
        color: '#f6f8ff',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
      })
      .setOrigin(0, 0.5);
    this.add
      .text(24, HEIGHT - 30, 'PLAYER', {
        color: '#f6f8ff',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
      })
      .setOrigin(0, 0.5);
    this.add
      .text(WIDTH / 2, HEIGHT / 2 + 40, 'P0 座標試作', {
        color: '#f6f8ff',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '16px',
      })
      .setOrigin(0.5);
  }
}

export function mountTechnicalProbe(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: WIDTH,
    height: HEIGHT,
    backgroundColor: '#10182a',
    scene: TechnicalProbeScene,
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
