// 効果音(public/sounds/*.wav)。Web Audioで鳴らす。
// iPhoneは「画面をさわった後」でないと音を出せないので、最初のタッチで準備(unlock)する。
// マナーモード(消音スイッチ)がオンのときは、iPhoneでは鳴りません。

export type SoundName = 'done' | 'switch';

let ctx: AudioContext | null = null;
const buffers = new Map<SoundName, Promise<AudioBuffer | null>>();

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    ctx = null;
  }
  return ctx;
}

function load(name: SoundName): Promise<AudioBuffer | null> {
  let p = buffers.get(name);
  if (!p) {
    p = (async () => {
      const c = getCtx();
      if (!c) return null;
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}sounds/${name}.wav`);
        if (!res.ok) return null;
        return await c.decodeAudioData(await res.arrayBuffer());
      } catch {
        return null;
      }
    })();
    buffers.set(name, p);
  }
  return p;
}

let unlocked = false;
/** 最初のタッチ・クリックで音を出せる状態にする(一度だけ) */
export function installAudioUnlock(): void {
  if (unlocked || typeof window === 'undefined') return;
  const handler = () => {
    const c = getCtx();
    if (!c) return;
    void c.resume().catch(() => undefined);
    // 無音を1回鳴らして iOS のロックを解除する
    try {
      const b = c.createBuffer(1, 1, 22050);
      const s = c.createBufferSource();
      s.buffer = b;
      s.connect(c.destination);
      s.start(0);
    } catch {
      /* ignore */
    }
    void load('done');
    void load('switch');
    unlocked = true;
    window.removeEventListener('pointerdown', handler, true);
    window.removeEventListener('keydown', handler, true);
  };
  window.addEventListener('pointerdown', handler, true);
  window.addEventListener('keydown', handler, true);
}

export function playSound(name: SoundName, volume = 0.8): void {
  const c = getCtx();
  if (!c) return;
  void load(name).then((buf) => {
    if (!buf) return;
    void c.resume().catch(() => undefined);
    try {
      const src = c.createBufferSource();
      const gain = c.createGain();
      gain.gain.value = volume;
      src.buffer = buf;
      src.connect(gain).connect(c.destination);
      src.start(0);
    } catch {
      /* ignore */
    }
  });
}
