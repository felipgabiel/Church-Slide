import { tr } from '../i18n';
/**
 * Camada mínima sobre o IndexedDB (sem bibliotecas).
 *
 * Stores:
 *  - projects  : projetos (JSON)
 *  - media     : imagens, vídeos e fontes (Blob)
 *  - snapshots : cópia de segurança do último estado bom de cada projeto
 *  - designs   : fundos criados no Estúdio de Fundos ("Meus fundos"), desde a versão 2
 *
 * Se o IndexedDB estiver indisponível (ex.: navegação privada em alguns
 * navegadores) caímos para memória, e a interface avisa que nada será salvo.
 */

export type StoreName = 'projects' | 'media' | 'snapshots' | 'designs';

const DB_NAME = 'church-slide';
/** 2: store `designs`. A migração só cria o que falta, nunca mexe nos louvores. */
const DB_VERSION = 2;

let dbPromise: Promise<IDBDatabase> | null = null;
export let storageMode: 'idb' | 'memory' = 'idb';

const memory: Record<StoreName, Map<string, unknown>> = {
  projects: new Map(),
  media: new Map(),
  snapshots: new Map(),
  designs: new Map(),
};

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error(tr('IndexedDB indisponível')));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of ['projects', 'media', 'snapshots', 'designs'] as StoreName[]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error(tr('Falha ao abrir o banco de dados')));
    req.onblocked = () => reject(new Error(tr('O banco de dados está bloqueado por outra aba')));
  });
}

async function db(): Promise<IDBDatabase | null> {
  if (storageMode === 'memory') return null;
  if (!dbPromise) {
    dbPromise = open().catch((err) => {
      console.warn('[storage] usando memória:', err);
      storageMode = 'memory';
      dbPromise = null;
      return null as unknown as IDBDatabase;
    });
  }
  return (await dbPromise) ?? null;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function dbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  const d = await db();
  if (!d) return memory[store].get(key) as T | undefined;
  return wrap<T | undefined>(d.transaction(store, 'readonly').objectStore(store).get(key));
}

export async function dbGetAll<T>(store: StoreName): Promise<T[]> {
  const d = await db();
  if (!d) return [...memory[store].values()] as T[];
  return wrap<T[]>(d.transaction(store, 'readonly').objectStore(store).getAll());
}

export async function dbPut<T extends { id: string }>(store: StoreName, value: T): Promise<void> {
  const d = await db();
  if (!d) {
    memory[store].set(value.id, value);
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error(tr('Transação cancelada (espaço insuficiente?)')));
  });
}

export async function dbDelete(store: StoreName, key: string): Promise<void> {
  const d = await db();
  if (!d) {
    memory[store].delete(key);
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Pede ao navegador para não apagar os dados quando faltar espaço (best effort). */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* ignore */
  }
  return false;
}
