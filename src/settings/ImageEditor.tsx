import { useRef, useState } from 'react';
import { ImageFrame, useImageUrl } from '../components/ImageFrame';
import { Banner, ColorOpacity, Segmented, SliderField } from '../components/ui';
import { uploadImage } from '../data/images';
import type { Fit, ImageDisplay, Shape } from '../types';

interface Props {
  value: ImageDisplay;
  name: string;
  userId: string;
  onChange: (patch: Partial<ImageDisplay>) => void;
  /** このエディタ内でアップロードした未保存の画像パスを親が覚えておくためのコールバック */
  onUploaded?: (path: string) => void;
}

/**
 * 画像の編集。元画像は加工せず、形・倍率・位置・表示方法・枠だけを保存する。
 * ドラッグで移動、スライダーで拡大縮小、「画像全体」「枠いっぱい」を選べる。
 */
export function ImageEditor({ value, name, userId, onChange, onUploaded }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; w: number } | null>(null);
  const src = useImageUrl(value.imagePath);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const path = await uploadImage(userId, file);
      onUploaded?.(path);
      onChange({ imagePath: path, scale: 1, offsetX: 0, offsetY: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : '画像を追加できませんでした');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => onChange({ scale: 1, offsetX: 0, offsetY: 0 });

  return (
    <div>
      <div
        ref={stage}
        className="editor-stage"
        onPointerDown={(e) => {
          if (!value.imagePath) return;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          const w = stage.current?.getBoundingClientRect().width ?? 300;
          drag.current = { x: e.clientX, y: e.clientY, ox: value.offsetX, oy: value.offsetY, w };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const clamp = (v: number) => Math.max(-2, Math.min(2, v));
          onChange({ offsetX: clamp(d.ox + (e.clientX - d.x) / d.w), offsetY: clamp(d.oy + (e.clientY - d.y) / d.w) });
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        aria-label="画像のプレビュー。ドラッグで位置を調整できます"
      >
        <ImageFrame display={value} fallbackText={name} srcOverride={value.imagePath ? src : null} />
      </div>
      <p className="hint" style={{ textAlign: 'center', marginTop: -6 }}>
        {value.imagePath ? 'ドラッグで位置を動かせます' : '画像をえらんでください'}
      </p>

      <div className="row" style={{ marginBottom: 12 }}>
        <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
          {busy ? 'アップロード中…' : value.imagePath ? '画像をかえる' : '画像をえらぶ'}
          <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
        {value.imagePath && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              onChange({ imagePath: null });
            }}
          >
            画像をはずす
          </button>
        )}
        <button type="button" className="btn" onClick={reset} disabled={!value.imagePath}>
          位置・大きさをもどす
        </button>
      </div>
      {error && <Banner kind="error">{error}</Banner>}

      <div className="field">
        <label>形</label>
        <Segmented<Shape> label="形" value={value.shape} onChange={(shape) => onChange({ shape })} options={[{ value: 'circle', label: '● 丸型' }, { value: 'square', label: '■ 四角型' }]} />
      </div>
      <div className="field">
        <label>画像の表示方法</label>
        <Segmented<Fit> label="表示方法" value={value.fit} onChange={(fit) => onChange({ fit })} options={[{ value: 'contain', label: '画像ぜんぶを入れる' }, { value: 'cover', label: '枠いっぱいに切り抜く' }]} />
      </div>
      <SliderField label="大きさ(拡大・縮小)" value={value.scale} min={0.2} max={4} step={0.05} unit="倍" onChange={(scale) => onChange({ scale })} />
      <ColorOpacity label="枠の色と透明度" value={{ color: value.borderColor, opacity: value.borderOpacity }} onChange={(c) => onChange({ borderColor: c.color, borderOpacity: c.opacity })} />
      <SliderField label="枠の太さ" value={value.borderWidth} min={0} max={40} unit="" onChange={(borderWidth) => onChange({ borderWidth })} />
    </div>
  );
}

