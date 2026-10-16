import { useEffect, useId, type ReactNode } from 'react';
import { contrastRatio } from '../lib/color';
import type { ColorSetting } from '../types';

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose?: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!onClose) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-back" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal${wide ? ' modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <h3 className="modal-title">{title}</h3>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Confirm({ title, message, confirmLabel = 'OK', danger, onConfirm, onCancel }: { title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel}>
            キャンセル
          </button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="confirm-msg">{message}</div>
    </Modal>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="field-ctl" id={id}>
        {children}
      </div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function SliderField({ label, value, min, max, step = 1, unit = '', onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <div className="field">
      <label>{label}</label>
      <div className="slider-row">
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
        <input
          type="number"
          className="num"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange(clamp(v));
          }}
          aria-label={`${label}の数値`}
        />
        <span className="unit">{unit}</span>
      </div>
    </div>
  );
}

/** 色 + 透明度(0〜100%)。スライダーと数値の両方で指定できる */
export function ColorOpacity({ label, value, onChange, opaqueOnly, textOn }: { label: string; value: ColorSetting; onChange: (v: ColorSetting) => void; opaqueOnly?: boolean; textOn?: { bg: ColorSetting[]; name: string } }) {
  const ratios = textOn ? textOn.bg.map((b) => contrastRatio(value, b)) : [];
  const worst = ratios.length ? Math.min(...ratios) : 21;
  return (
    <div className="coloropacity">
      <div className="co-label">{label}</div>
      <div className="co-row">
        <input type="color" value={value.color} onChange={(e) => onChange({ ...value, color: e.target.value })} aria-label={`${label}の色`} />
        <input type="text" className="hex" value={value.color} maxLength={7} onChange={(e) => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && e.target.value.length === 7 && onChange({ ...value, color: e.target.value.toLowerCase() })} aria-label={`${label}の色コード`} />
        {!opaqueOnly && (
          <>
            <input type="range" min={0} max={100} value={value.opacity} onChange={(e) => onChange({ ...value, opacity: Number(e.target.value) })} aria-label={`${label}の透明度`} />
            <input type="number" className="num" min={0} max={100} value={Math.round(value.opacity)} onChange={(e) => onChange({ ...value, opacity: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} aria-label={`${label}の不透明度の数値`} />
            <span className="unit">%</span>
          </>
        )}
      </div>
      {textOn && worst < 3 && <div className="warn">⚠ {textOn.name}の背景との差が小さく、文字が読みにくい可能性があります(コントラスト比 {worst.toFixed(1)})</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Banner({ kind, children }: { kind: 'error' | 'warn' | 'info' | 'ok'; children: ReactNode }) {
  return <div className={`banner banner-${kind}`}>{children}</div>;
}
