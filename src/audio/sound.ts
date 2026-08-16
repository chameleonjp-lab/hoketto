export type SoundOwner = 'player' | 'cpu';

export type SoundTeam = 'player' | 'cpu';

export interface SoundSettings {
  readonly effectsEnabled: boolean;
  readonly musicEnabled: boolean;
}

interface AudioWindow extends Window {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

const MAX_SIMULTANEOUS_EFFECTS = 8;

function getAudioContextConstructor(): (new () => AudioContext) | null {
  if (typeof window === 'undefined') return null;
  const audioWindow = window as AudioWindow;
  return audioWindow.AudioContext ?? audioWindow.webkitAudioContext ?? null;
}

export class SoundController {
  private context: AudioContext | null = null;
  private musicOscillator: OscillatorNode | null = null;
  private musicGain: GainNode | null = null;
  private activeEffects = 0;
  private effectsEnabled = false;
  private musicEnabled = false;
  private musicActive = false;

  public get isSupported(): boolean {
    return getAudioContextConstructor() !== null;
  }

  public get areEffectsEnabled(): boolean {
    return this.effectsEnabled;
  }

  public get isMusicEnabled(): boolean {
    return this.musicEnabled;
  }

  public setEffectsEnabled(enabled: boolean): void {
    this.effectsEnabled = enabled;
    if (enabled) this.ensureContext();
  }

  public applySettings(settings: SoundSettings): void {
    this.effectsEnabled = settings.effectsEnabled;
    this.musicEnabled = settings.musicEnabled;
    this.syncMusic();
  }

  public setMusicEnabled(enabled: boolean): void {
    this.musicEnabled = enabled;
    this.syncMusic();
  }

  public setMusicActive(active: boolean): void {
    this.musicActive = active;
    this.syncMusic();
  }

  public playShot(owner: SoundOwner): void {
    if (!this.effectsEnabled) return;
    this.playTone(owner === 'player' ? 220 : 165, owner === 'player' ? 120 : 95, 0.08);
  }

  public playHit(owner: SoundOwner): void {
    if (!this.effectsEnabled) return;
    this.playTone(owner === 'player' ? 560 : 420, owner === 'player' ? 320 : 260, 0.1);
  }

  public playGoal(team: SoundTeam): void {
    if (!this.effectsEnabled) return;
    const baseFrequency = team === 'player' ? 440 : 330;
    this.playTone(baseFrequency, baseFrequency * 1.25, 0.16);
    this.playTone(baseFrequency * 1.25, baseFrequency * 1.5, 0.18, 0.08);
  }

  public dispose(): void {
    this.stopMusic();
    if (this.context) {
      void this.context.close().catch(() => undefined);
      this.context = null;
    }
  }

  private ensureContext(): AudioContext | null {
    const AudioContextConstructor = getAudioContextConstructor();
    if (!AudioContextConstructor) return null;

    try {
      this.context ??= new AudioContextConstructor();
    } catch {
      return null;
    }

    if (this.context.state === 'suspended') {
      try {
        void this.context.resume().catch(() => undefined);
      } catch {
        // Some browsers can reject resume synchronously before user activation.
      }
    }
    return this.context;
  }

  private startMusic(): void {
    if (this.musicOscillator) return;
    const context = this.ensureContext();
    if (!context) return;

    let oscillator: OscillatorNode | null = null;
    let gain: GainNode | null = null;
    try {
      oscillator = context.createOscillator();
      gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(110, context.currentTime);
      gain.gain.setValueAtTime(0.015, context.currentTime);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      this.musicOscillator = oscillator;
      this.musicGain = gain;
    } catch {
      try {
        oscillator?.disconnect();
        gain?.disconnect();
      } catch {
        // The browser may have partially constructed the node graph.
      }
    }
  }

  private syncMusic(): void {
    if (this.musicEnabled && this.musicActive) {
      this.startMusic();
    } else {
      this.stopMusic();
    }
  }

  private stopMusic(): void {
    if (!this.musicOscillator) return;
    try {
      this.musicOscillator.stop();
    } catch {
      // The oscillator may already have been stopped by the browser.
    }
    try {
      this.musicOscillator.disconnect();
      this.musicGain?.disconnect();
    } catch {
      // The browser may have already disconnected one of the nodes.
    }
    this.musicOscillator = null;
    this.musicGain = null;
  }

  private playTone(
    startFrequency: number,
    endFrequency: number,
    durationSeconds: number,
    offsetSeconds = 0,
  ): void {
    if (this.activeEffects >= MAX_SIMULTANEOUS_EFFECTS) return;
    const context = this.ensureContext();
    if (!context) return;

    const startAt = context.currentTime + offsetSeconds;
    const endAt = startAt + durationSeconds;
    let oscillator: OscillatorNode | null = null;
    let gain: GainNode | null = null;
    try {
      oscillator = context.createOscillator();
      gain = context.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(startFrequency, startAt);
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, endAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.08, startAt + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
      oscillator.connect(gain);
      gain.connect(context.destination);
      this.activeEffects += 1;
      oscillator.addEventListener(
        'ended',
        () => {
          this.activeEffects = Math.max(0, this.activeEffects - 1);
          try {
            oscillator?.disconnect();
            gain?.disconnect();
          } catch {
            // The browser may have already disconnected one of the nodes.
          }
        },
        { once: true },
      );
      oscillator.start(startAt);
      oscillator.stop(endAt + 0.02);
    } catch {
      this.activeEffects = Math.max(0, this.activeEffects - 1);
      try {
        oscillator?.disconnect();
        gain?.disconnect();
      } catch {
        // The browser may have partially constructed the node graph.
      }
    }
  }
}
