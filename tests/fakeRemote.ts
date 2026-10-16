import { ConflictError, NetworkError, emptyPending, type CacheStorage, type Coll, type Pending, type Remote, type RemoteSnapshot } from '../src/data/sync';
import type { Activity, AppData, AppSettings, DateOverride, Preset, Theme } from '../src/types';

type Entity = Activity | Preset | DateOverride;

/** テスト用の「クラウド」。複数のエンジンから共有して、複数端末の動きを再現する */
export class FakeServer {
  tables: Record<Coll, Map<string, Entity>> = { activities: new Map(), presets: new Map(), overrides: new Map() };
  theme: Theme | null = null;
  settings: AppSettings | null = null;
  online = true;
  calls = { put: 0, remove: 0 };

  remote(): Remote {
    const check = () => {
      if (!this.online) throw new NetworkError();
    };
    return {
      fetchAll: async (): Promise<RemoteSnapshot> => {
        check();
        return {
          activities: [...this.tables.activities.values()].map((e) => structuredClone(e)) as Activity[],
          presets: [...this.tables.presets.values()].map((e) => structuredClone(e)) as Preset[],
          overrides: [...this.tables.overrides.values()].map((e) => structuredClone(e)) as DateOverride[],
          theme: this.theme ? structuredClone(this.theme) : null,
          settings: this.settings ? structuredClone(this.settings) : null,
        };
      },
      fetchOne: async (coll, id) => {
        check();
        const e = this.tables[coll].get(id);
        return e ? structuredClone(e) : null;
      },
      put: async (coll, entity) => {
        check();
        this.calls.put++;
        const cur = this.tables[coll].get(entity.id);
        if (!cur) {
          if (entity.version !== 0) throw new ConflictError();
        } else if (cur.version !== entity.version) throw new ConflictError();
        const v = (cur?.version ?? 0) + 1;
        this.tables[coll].set(entity.id, { ...structuredClone(entity), version: v });
        return v;
      },
      putTheme: async (t) => {
        check();
        if ((this.theme?.version ?? 0) !== t.version) throw new ConflictError();
        const v = (this.theme?.version ?? 0) + 1;
        this.theme = { ...structuredClone(t), version: v };
        return v;
      },
      putSettings: async (s) => {
        check();
        if ((this.settings?.version ?? 0) !== s.version) throw new ConflictError();
        const v = (this.settings?.version ?? 0) + 1;
        this.settings = { ...structuredClone(s), version: v };
        return v;
      },
      remove: async (coll, id, expected) => {
        check();
        this.calls.remove++;
        const cur = this.tables[coll].get(id);
        if (!cur) return;
        if (cur.version !== expected) throw new ConflictError();
        this.tables[coll].delete(id);
      },
    };
  }
}

export class MemoryCache implements CacheStorage {
  saved: { data: AppData; pending: Pending; lastSyncedAt: string | null } | null = null;
  load() {
    return this.saved ? structuredClone(this.saved) : null;
  }
  save(v: { data: AppData; pending: Pending; lastSyncedAt: string | null }) {
    this.saved = structuredClone(v);
  }
}

export { emptyPending };
