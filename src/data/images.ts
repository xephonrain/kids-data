// 活動画像: 端末のIndexedDBに保存し、GitHub接続中はデータ用リポジトリ(kids-timer/images/)とも同期する。
// 追加時に長辺1024pxへ縮小してWebPで保存する(以降は加工せず、表示倍率・位置だけを保存する)。
// 画像のパスは一意(local/<uuid>.webp)で中身は変わらないので、端末間で同じパスをそのまま使える。

/** 端末に無い画像をGitHubから取得する関数(接続中のみ設定される) */
type ImageSource = (path: string) => Promise<Blob | null>;
let imageSource: ImageSource | null = null;
export function setImageSource(src: ImageSource | null): void {
  imageSource = src;
}

const MAX_SIDE = 1024;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 縮小前の入力上限

// ---- IndexedDB(画像キャッシュ) ----
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('kids-timer', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('images');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key: string): Promise<Blob | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const r = db.transaction('images').objectStore('images').get(key);
      r.onsuccess = () => resolve((r.result as Blob) ?? null);
      r.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}
async function idbPut(key: string, blob: Blob): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction('images', 'readwrite');
      tx.objectStore('images').put(blob, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* キャッシュできなくても動作に影響なし */
  }
}
async function idbDelete(key: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction('images', 'readwrite');
      tx.objectStore('images').delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* noop */
  }
}

// ---- 表示用URL ----
const urlCache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

/** 画像パス → 表示用URL。端末内を優先し、なければGitHubから取得(オフラインならnull) */
export function getImageUrl(path: string): Promise<string | null> {
  const hit = urlCache.get(path);
  if (hit) return Promise.resolve(hit);
  const running = inflight.get(path);
  if (running) return running;
  const p = (async () => {
    let blob = await idbGet(path);
    if (!blob && imageSource) {
      try {
        blob = await imageSource(path);
      } catch {
        blob = null; // オフラインなど。次に表示するときに再試行する
      }
      if (blob) await idbPut(path, blob);
    }
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urlCache.set(path, url);
    return url;
  })().finally(() => inflight.delete(path));
  inflight.set(path, p);
  return p;
}

/** 使っている画像を先に端末へ保存しておく(オフライン対策) */
export async function prefetchImages(paths: string[]): Promise<void> {
  await Promise.all(paths.filter(Boolean).map((p) => getImageUrl(p).catch(() => null)));
}

// ---- 縮小 ----
export async function resizeImage(file: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('画像を処理できませんでした');
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const webp = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', 0.88));
  if (webp && webp.type === 'image/webp') return webp;
  const png = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (!png) throw new Error('画像を変換できませんでした');
  return png;
}

function extOf(blob: Blob): string {
  return blob.type === 'image/png' ? 'png' : blob.type === 'image/jpeg' ? 'jpg' : 'webp';
}

/** 端末内の画像(GitHubへ送るときに使う) */
export function readLocalImage(path: string): Promise<Blob | null> {
  return idbGet(path);
}

/** 画像を縮小して端末に保存し、パス(local/<uuid>.webp)を返す。GitHubへの送信は同期処理が行う */
export async function uploadImage(_userId: string, file: Blob): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('画像が大きすぎます(10MBまで)');
  if (!file.type.startsWith('image/')) throw new Error('画像ファイルを選んでください');
  const blob = await resizeImage(file);
  const path = `local/${crypto.randomUUID()}.${extOf(blob)}`;
  await idbPut(path, blob);
  return path;
}

export async function deleteImage(path: string): Promise<void> {
  const u = urlCache.get(path);
  if (u) {
    URL.revokeObjectURL(u);
    urlCache.delete(path);
  }
  await idbDelete(path);
}

/** バックアップ用: 画像をdata URLで取得 */
export async function imageToDataUrl(path: string): Promise<string | null> {
  const url = await getImageUrl(path);
  if (!url) return null;
  const blob = await (await fetch(url)).blob();
  return await new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => resolve(null);
    r.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return await (await fetch(dataUrl)).blob();
}
