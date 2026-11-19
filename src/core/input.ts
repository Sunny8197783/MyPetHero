import { feel } from '../data';

/** 키보드 · 게임패드 · 가상 조이스틱 입력을 하나의 이동 벡터로 합친다. */
class Input {
  moveX = 0;
  moveY = 0;
  /** 가상 조이스틱(터치)이 쓰는 값. UI 컴포넌트가 채운다. */
  stickX = 0;
  stickY = 0;
  /** 테스트 봇이 넣는 값. */
  botX = 0;
  botY = 0;
  botActive = false;
  usingGamepad = false;
  isTouch = false;

  private readonly keys = new Set<string>();
  private readonly pressed = new Set<string>();
  private padConfirmHeld = false;
  private padPauseHeld = false;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('touchstart', () => (this.isTouch = true), { passive: true, once: true });
  }

  private padBlocked = false;
  /** 게임패드 목록. 권한 정책으로 막힌 프레임(임베드, 샌드박스)에서는 getGamepads 가 예외를 던지므로 한 번 실패하면 다시 묻지 않는다. */
  private gamepads(): ReadonlyArray<Gamepad | null> {
    if (this.padBlocked) return [];
    try {
      return navigator.getGamepads?.() ?? [];
    } catch {
      this.padBlocked = true;
      return [];
    }
  }

  /** 프레임마다 한 번 호출. */
  poll(): void {
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;

    const pads = this.gamepads();
    for (const pad of pads) {
      if (!pad) continue;
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      const dz = feel.input.deadzone;
      if (Math.hypot(ax, ay) > dz) {
        x += ax;
        y += ay;
        this.usingGamepad = true;
      }
      if (pad.buttons[14]?.pressed) x -= 1;
      if (pad.buttons[15]?.pressed) x += 1;
      if (pad.buttons[12]?.pressed) y -= 1;
      if (pad.buttons[13]?.pressed) y += 1;
      const confirm = !!pad.buttons[0]?.pressed;
      if (confirm && !this.padConfirmHeld) this.pressed.add('PadA');
      this.padConfirmHeld = confirm;
      const pause = !!pad.buttons[9]?.pressed;
      if (pause && !this.padPauseHeld) this.pressed.add('PadStart');
      this.padPauseHeld = pause;
    }
    x += this.stickX;
    y += this.stickY;
    if (this.botActive) {
      x = this.botX;
      y = this.botY;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this.moveX = x;
    this.moveY = y;
  }

  /** 이번 프레임에 새로 눌린 키인지. 읽으면 소모된다. */
  consume(...codes: string[]): boolean {
    for (const c of codes) {
      if (this.pressed.has(c)) {
        this.pressed.delete(c);
        return true;
      }
    }
    return false;
  }

  endFrame(): void {
    this.pressed.clear();
  }

  rumble(ms: number, strong: number, weak = strong * 0.5): void {
    const pads = this.gamepads();
    for (const pad of pads) {
      const actuator = (pad as (Gamepad & { vibrationActuator?: { playEffect?: (type: string, params: object) => Promise<unknown> } }) | null)
        ?.vibrationActuator;
      if (!actuator?.playEffect) continue;
      void actuator
        .playEffect('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) })
        .catch(() => undefined);
    }
  }
}

export const input = new Input();
