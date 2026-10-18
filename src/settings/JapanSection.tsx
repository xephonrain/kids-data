import { useRef, useState } from 'react';
import { ImageFrame } from '../components/ImageFrame';
import { Banner, Confirm } from '../components/ui';
import { deleteImage, uploadImage } from '../data/images';
import { useStore } from '../data/store';
import { plainImage } from '../lib/checklist';
import { loadCheckDay, saveCheckDay } from '../data/localCache';
import { PREFS, PREF_COUNT, mapState, prefByCode, type Pref } from '../lib/japan';
import { dateKey } from '../lib/time';

export function JapanSection() {
  const { data, update, userId } = useStore();
  const st = mapState(data.mapLog);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const last = data.mapLog[data.mapLog.length - 1];
  const lastPref = last ? prefByCode(last.prefCode) : undefined;
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const target = useRef<Pref | null>(null);

  const pick = (p: Pref) => {
    target.current = p;
    fileRef.current?.click();
  };

  const onFile = async (files: FileList | null) => {
    const p = target.current;
    const f = files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!p || !f) return;
    try {
      const path = await uploadImage(userId, f);
      const old = data.prefImages[p.id];
      if (update((d) => ({ ...d, prefImages: { ...d.prefImages, [p.id]: path } }))) {
        if (old) void deleteImage(old).catch(() => undefined);
        setMsg({ kind: 'ok', text: `${p.name}の絵を登録しました` });
      } else {
        void deleteImage(path).catch(() => undefined);
        setMsg({ kind: 'error', text: 'ロックされているため登録できませんでした' });
      }
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : '登録できませんでした' });
    }
  };

  const clear = (p: Pref) => {
    const old = data.prefImages[p.id];
    if (update((d) => ({ ...d, prefImages: Object.fromEntries(Object.entries(d.prefImages).filter(([k]) => k !== p.id)) }))) {
      if (old) void deleteImage(old).catch(() => undefined);
    }
  };

  return (
    <div className="panel">
      <h2>日本地図(ごほうび)</h2>
      <p className="muted" style={{ marginBottom: 12 }}>
        チェックシートを全部終えるたびに、白い日本地図を北海道から順に1県ずつぬっていきます。ぬった県の名産やとくしょくが表示されます。47県ぬり終えると、次は地図が白にもどって2しゅうめです。
      </p>
      <p style={{ marginBottom: 8 }}>
        いまの進み具合: <b>{st.filled.length} / {PREF_COUNT}</b> 県{st.round > 1 ? `(${st.round}しゅうめ)` : ''} ・ これまでのごほうび {data.mapLog.length}回 ・ 次は <b>{st.complete ? `${PREFS[0].name}(白にもどる)` : st.next.name}</b>
      </p>
      <div className="row-end" style={{ marginTop: 0, marginBottom: 10 }}>
        <button className="btn btn-sm" disabled={!last} onClick={() => setConfirmUndo(true)}>
          ひとつ もどす{lastPref ? `(${lastPref.name})` : ''}
        </button>
        <button className="btn btn-sm" disabled={data.mapLog.length === 0} onClick={() => setConfirmReset(true)}>
          地図を白にもどす
        </button>
      </div>
      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      <h3>県ごとの絵(おこのみで)</h3>
      <p className="muted" style={{ marginBottom: 8 }}>
        初期設定では、県ごとの絵文字を使います。名産のイラストなど、好きな絵を登録すると、そちらが表示されます(画像生成ツールで作った絵もOK)。
      </p>
      <input ref={fileRef} type="file" accept="image/*" hidden data-testid="pref-file" onChange={(e) => void onFile(e.target.files)} />
      <div className="list">
        {PREFS.map((p) => {
          const img = data.prefImages[p.id];
          const done = st.filled.includes(p.code);
          return (
            <div key={p.id} className="list-item" data-pref={p.id}>
              <div className="thumb">{img ? <ImageFrame display={plainImage(img)} fallbackText={p.emoji} panelColor="transparent" /> : <span style={{ fontSize: 28 }}>{p.emoji}</span>}</div>
              <div className="name">
                {p.code}. {p.name}
                {done ? ' ✅' : ''}
                <div className="hint">{p.items.join(' ')}</div>
                <div className="hint">{p.feature}</div>
              </div>
              <button className="btn btn-sm" onClick={() => pick(p)}>
                {img ? '絵を変える' : '絵を登録'}
              </button>
              {img && (
                <button className="btn btn-sm" onClick={() => clear(p)}>
                  絵を外す
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="muted" style={{ marginTop: 12 }}>
        地図データ: <a href="https://github.com/VictorCazanave/svg-maps" target="_blank" rel="noreferrer">@svg-maps/japan</a> (Victor Cazanave, CC BY 4.0)
      </p>

      {confirmUndo && last && (
        <Confirm
          title="ひとつ もどしますか？"
          confirmLabel="もどす"
          message={<p>最後にぬった「{lastPref?.name}」を白にもどします。{last.dateKey === dateKey(new Date()) ? 'きょうの同じリストは、もう一度ごほうびをもらえるようになります(この端末の分)。' : ''}</p>}
          onCancel={() => setConfirmUndo(false)}
          onConfirm={() => {
            if (update((d) => ({ ...d, mapLog: d.mapLog.slice(0, -1) })) && last.dateKey === dateKey(new Date())) {
              // きょうのごほうびを取り消した場合は、もらい直せるようにする
              const day = loadCheckDay(last.dateKey);
              const { [last.sheetId]: _drop, ...rest } = day.reward;
              saveCheckDay({ ...day, reward: rest });
            }
            setConfirmUndo(false);
          }}
        />
      )}
      {confirmReset && (
        <Confirm
          title="地図を白にもどしますか？"
          danger
          confirmLabel="白にもどす"
          message={<p>ぬった記録({data.mapLog.length}回ぶん)を消して、北海道からやり直します。県ごとの絵は残ります。</p>}
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => {
            update((d) => ({ ...d, mapLog: [] }));
            setConfirmReset(false);
          }}
        />
      )}
    </div>
  );
}
