// 効果音(public/sounds/*.wav)。HTMLAudio で鳴らす。
// iPhone(Safari / ホーム画面アプリ)は「画面をタッチした後」でないと音を出せない。
// 最初のタッチ(どこでも)で、全部の音を無音で一度だけ再生して「解除」しておくと、
// その後は自動切り替えのような、タッチと関係ない場面でも鳴らせる。
// マナーモード(消音スイッチ)がオンのときは、iPhoneでは鳴りません。

export type SoundName = 'done' | 'switch' | 'flash';

const NAMES: SoundName[] = ['done', 'switch', 'flash'];
const els = new Map<SoundName, HTMLAudioElement>();
let unlockedAll = false;

function el(name: SoundName): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  let a = els.get(name);
  if (!a) {
    a = new Audio(`${import.meta.env.BASE_URL}sounds/${name}.wav`);
    a.preload = 'auto';
    els.set(name, a);
  }
  return a;
}

function unlock() {
  if (unlockedAll) return;
  let pending = NAMES.length;
  let failed = false;
  for (const n of NAMES) {
    const a = el(n);
    if (!a) {
      pending--;
      continue;
    }
    a.muted = true;
    const p = a.play();
    const done = () => {
      a.pause();
      a.currentTime = 0;
      a.muted = false;
      if (--pending === 0 && !failed) unlockedAll = true;
    };
    if (p && typeof p.then === 'function') {
      p.then(done).catch(() => {
        failed = true;
        a.muted = false;
        pending--;
      });
    } else done();
  }
}

let installed = false;
/** どこでも最初にタッチ・クリックされたときに、音を出せる状態にする(解除できるまで毎回試す) */
export function installAudioUnlock(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  for (const n of NAMES) el(n)?.load();
  for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) window.addEventListener(ev, unlock, true);
}

export function playSound(name: SoundName, volume = 0.8): void {
  const a = el(name);
  if (!a) return;
  try {
    a.muted = false;
    a.volume = volume;
    a.currentTime = 0;
    void a.play().catch(() => undefined);
  } catch {
    /* ignore */
  }
}
