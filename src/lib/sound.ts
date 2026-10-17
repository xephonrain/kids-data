// 効果音(public/sounds/*.wav)。Web Audioで鳴らす。
// iPhoneは「画面をさわった後」でないと音を出せないので、最初のタッチで準備(unlock)する。
// マナーモード(消音スイッチ)がオンのときは、iPhoneでは鳴りません。

import { useEffect, useState } from 'react';

export type SoundName = 'done' | 'switch' | 'flash';

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

/** 音を出せる状態か(iPhoneは、画面をタッチするまで・アプリを閉じて開き直すたびに、止まっている) */
export function isAudioRunning(): boolean {
  return ctx?.state === 'running';
}

function unlock() {
  const c = getCtx();
  if (!c) return;
  if (c.state !== 'running') {
    void c.resume().catch(() => undefined);
    // 無音を1回鳴らして iOS のロックを解除する
    try {
      const s = c.createBufferSource();
      s.buffer = c.createBuffer(1, 1, 22050);
      s.connect(c.destination);
      s.start(0);
    } catch {
      /* ignore */
    }
  }
  void load('done');
  void load('switch');
  void load('flash');
}

let installed = false;
/** タッチ・クリックのたびに、音を出せる状態か確かめて準備する(iPhoneはアプリを開き直すと止まるため、ずっと監視する) */
export function installAudioUnlock(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) window.addEventListener(ev, unlock, true);
  document.addEventListener('visibilitychange', () => {
    // バックグラウンドから戻ったとき、止まっていたら次のタッチで再開できるようにする
    if (document.visibilityState === 'visible' && ctx && ctx.state !== 'running') void ctx.resume().catch(() => undefined);
  });
}

/** 音を出せるようになったか(画面の案内表示用)。タッチされるまで false */
export function useAudioReady(): boolean {
  const [ready, setReady] = useState(isAudioRunning());
  useEffect(() => {
    const id = window.setInterval(() => setReady(isAudioRunning()), 700);
    return () => window.clearInterval(id);
  }, []);
  return ready;
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
