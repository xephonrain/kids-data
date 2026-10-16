import { useEffect, useState, type CSSProperties } from 'react';
import { getImageUrl } from '../data/images';
import { rgba } from '../lib/color';
import type { ImageDisplay } from '../types';

/** 画像パス → 表示URL(非同期) */
export function useImageUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (path) {
      if (path.startsWith('blob:') || path.startsWith('data:')) setUrl(path);
      else void getImageUrl(path).then((u) => alive && setUrl(u));
    }
    return () => {
      alive = false;
    };
  }, [path]);
  return url;
}

interface Props {
  display: ImageDisplay | null;
  fallbackText?: string;
  /** 画像URLを直接渡す(編集中のプレビュー用)。省略時は display.imagePath から取得 */
  srcOverride?: string | null;
  panelColor?: string;
  style?: CSSProperties;
}

/** 活動イラストの表示。丸型/四角型・倍率・位置・方式・枠を適用する。メイン画面と設定画面で同じ見た目になる */
export function ImageFrame({ display, fallbackText, srcOverride, panelColor = '#f6f4fd', style }: Props) {
  const loaded = useImageUrl(srcOverride === undefined ? display?.imagePath : null);
  const src = srcOverride !== undefined ? srcOverride : loaded;
  const d = display;
  const circle = (d?.shape ?? 'circle') === 'circle';
  const bw = d ? d.borderWidth : 8;

  return (
    <div style={{ containerType: 'size', width: '100%', height: '100%', display: 'grid', placeItems: 'center', ...style }}>
      <div
        style={{
          aspectRatio: '1 / 1',
          height: '100%',
          maxWidth: '100%',
          maxHeight: '100%',
          // 枠の太さは基準サイズ400pxに対する割合で持つ → 表示サイズが変わっても見た目の比率が同じ
          boxSizing: 'border-box',
          border: `${(bw / 400) * 100}cqmin solid ${d ? rgba(d.borderColor, d.borderOpacity) : 'transparent'}`,
          borderRadius: circle ? '50%' : '9%',
          overflow: 'hidden',
          position: 'relative',
          background: panelColor,
          ...(circle ? {} : {}),
        }}
      >
        {src ? (
          <img
            src={src}
            alt={fallbackText ?? ''}
            draggable={false}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: d?.fit ?? 'cover',
              transform: `translate(${(d?.offsetX ?? 0) * 100}%, ${(d?.offsetY ?? 0) * 100}%) scale(${d?.scale ?? 1})`,
              transformOrigin: 'center',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          />
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: '10%', textAlign: 'center', fontWeight: 800, fontSize: '9cqmin', color: '#8a83c9', lineHeight: 1.2, wordBreak: 'break-all' }}>
            {fallbackText || '🖼'}
          </div>
        )}
      </div>
    </div>
  );
}
