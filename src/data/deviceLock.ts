// 「パスワードを使わない」設定は端末ごと(この端末のlocalStorageだけ)。
// 他の端末には同期されないので、端末ごとに入り切りできる。

import { useSyncExternalStore } from 'react';

const KEY = 'kt:lockoff:v1';
const EVENT = 'kt:lockoff';

export function isLockOff(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setLockOff(v: boolean): void {
  try {
    if (v) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* 保存できない環境では、ロックを無効にしない(安全側) */
  }
  window.dispatchEvent(new Event(EVENT));
}

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
  };
};

/** この端末でパスワードを使わない設定か */
export function useLockOff(): boolean {
  return useSyncExternalStore(subscribe, isLockOff, () => false);
}
