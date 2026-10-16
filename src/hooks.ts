import { useEffect, useRef, useState } from 'react';
import { flashPhase } from './lib/schedule';

/** 現在時刻。1秒ごとに更新し、タブ復帰・スリープ復帰・オンライン復帰でも即座に取り直す(値は常に端末時刻から計算) */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const id = setInterval(refresh, intervalMs);
    const onVis = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    window.addEventListener('online', refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [intervalMs]);
  return now;
}

/** 点滅の位相(0〜1)。active の間だけ更新する。位相は時刻から直接計算するので、再描画で乱れない */
export function useFlashPhase(active: boolean): number {
  const [phase, setPhase] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    if (!active) {
      setPhase(0);
      return;
    }
    let last = 0;
    const loop = (t: number) => {
      if (t - last > 60) {
        last = t;
        setPhase(flashPhase(Date.now()));
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [active]);
  return active ? phase : 0;
}
