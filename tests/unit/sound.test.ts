import { describe, expect, it } from 'vitest';
import { SoundController } from '../../src/audio/sound';

describe('sound controller', () => {
  it('初期状態は無音', () => {
    const sound = new SoundController();

    expect(sound.areEffectsEnabled).toBe(false);
    expect(sound.isMusicEnabled).toBe(false);
    expect(typeof sound.isSupported).toBe('boolean');

    sound.dispose();
  });

  it('Web Audio不可でも設定変更と再生要求を壊さない', () => {
    const sound = new SoundController();

    expect(() => {
      sound.setEffectsEnabled(true);
      sound.setMusicEnabled(true);
      sound.setMusicActive(true);
      sound.playShot('player');
      sound.playGoal('cpu');
      sound.setMusicActive(false);
      sound.setMusicEnabled(false);
      sound.dispose();
    }).not.toThrow();
  });
});
