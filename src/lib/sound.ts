// 効果音(public/sounds/*.wav)。HTMLAudio で鳴らす。
//
// iPhone(Safari / ホーム画面アプリ)は、画面をタッチしたときにしか音を出せない。
// ただし「タッチで一度でも再生した audio 要素」は、その後タッチなし(タイマーなど)でも
// 再生できる(src を入れ替えても、その要素は許可されたまま)。
// そこで音声要素を1つだけ作り、最初のタッチで無音を再生して許可をもらい、
// 以降はその同じ要素で src を入れ替えて効果音を鳴らす。
// マナーモード(消音スイッチ)がオンのときは、iPhoneでは鳴りません。

export type SoundName = 'done' | 'switch' | 'flash';

let audio: HTMLAudioElement | null = null;
let silentUrl: string | null = null;
let unlocked = false;

function silentWavUrl(): string {
  if (silentUrl) return silentUrl;
  const sr = 8000;
  const n = 800; // 0.1秒の無音
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  w(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, n * 2, true);
  silentUrl = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  return silentUrl;
}

function el(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  if (!audio) {
    audio = new Audio();
    audio.preload = 'auto';
  }
  return audio;
}

const url = (name: SoundName) => `${import.meta.env.BASE_URL}sounds/${name}.wav`;

function unlock() {
  if (unlocked) return;
  const a = el();
  if (!a) return;
  a.src = silentWavUrl();
  const p = a.play();
  if (p && typeof p.then === 'function') {
    p.then(() => {
      unlocked = true;
    }).catch(() => undefined); // 失敗したら、次のタッチでもう一度試す
  } else unlocked = true;
}

let installed = false;
/** どこでも最初にタッチ・クリックされたときに、音を出せる状態にする(許可できるまで毎回試す) */
export function installAudioUnlock(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) window.addEventListener(ev, unlock, true);
}

export function playSound(name: SoundName, volume = 0.8): void {
  const a = el();
  if (!a) return;
  try {
    a.pause();
    a.src = url(name);
    a.volume = volume;
    a.currentTime = 0;
    void a.play().catch(() => undefined);
  } catch {
    /* ignore */
  }
}
