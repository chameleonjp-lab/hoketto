import { describe, expect, it } from "vitest";
import {
  detectDeviceMode,
  deviceModeLabel,
  getReadinessPresentation,
} from "../../src/app/gamePresentation";

describe("game presentation", () => {
  it("端末の入力特性からスマホとPCの案内を切り替える", () => {
    expect(
      detectDeviceMode({
        coarsePointer: true,
        finePointer: false,
        touchPoints: 5,
      }),
    ).toBe("touch");
    expect(
      detectDeviceMode({
        coarsePointer: false,
        finePointer: true,
        touchPoints: 0,
      }),
    ).toBe("desktop");
    expect(
      detectDeviceMode({
        coarsePointer: false,
        finePointer: false,
        touchPoints: 1,
      }),
    ).toBe("touch");
    expect(
      detectDeviceMode({
        coarsePointer: false,
        finePointer: false,
        touchPoints: 0,
      }),
    ).toBe("desktop");
    expect(deviceModeLabel("touch")).toBe("スマホ操作");
    expect(deviceModeLabel("desktop")).toBe("PC操作");
  });

  it("充電完了は発射可能、充電中は残り時間とゲージ割合を文字でも示す", () => {
    expect(getReadinessPresentation("ready", 0, 1)).toMatchObject({
      state: "ready",
      title: "撃てます",
      progress: 100,
    });
    expect(getReadinessPresentation("charging", 0.84, 0.2)).toMatchObject({
      state: "charging",
      title: "充電中",
      detail: "次の一発まであと0.9秒。ゲージが満ちるまで待ちます。",
      progress: 20,
    });
    expect(getReadinessPresentation("stopped", 0, 0)).toMatchObject({
      state: "stopped",
      title: "停止中",
      progress: 0,
    });
  });
});
