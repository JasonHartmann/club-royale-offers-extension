// Manages stable assignment of numeric profile IDs to gobo-* profile keys.
// Once a profile key receives an ID it will never change unless the profile
// is deleted (its storage entry removed). Deleted profile IDs return to a
// free pool and may be reused by future new profiles.
(function(global){
    const STORAGE_KEY = 'goboProfileIdMap_v1';
    const FREE_KEY = 'goboProfileIdFreeIds_v1';
    const NEXT_KEY = 'goboProfileIdNext_v1';
    const DEBUG = true; // Toggle verbose debug logging

    function debugLog(...args){ if (DEBUG) { try { console.debug('[ProfileIdManager]', ...args); } catch(e){} } }
    function warnLog(...args){ try { console.warn('[ProfileIdManager]', ...args); } catch(e){} }
    function errorLog(...args){ try { console.error('[ProfileIdManager]', ...args); } catch(e){} }

    function loadJson(key, def){
        try {
            const raw = (typeof goboStorageGet === 'function' ? goboStorageGet(key) : (global.localStorage ? localStorage.getItem(key) : null));
            if (!raw) { debugLog('loadJson: no value for', key); return def; }
            const parsed = JSON.parse(raw);
            debugLog('loadJson: loaded', key, parsed);
            return parsed;
        } catch(e){ errorLog('loadJson: failed to load/parse', key, e); return def; }
    }
    function saveJson(key, val){
        try {
            const serialized = JSON.stringify(val);
            if (typeof goboStorageSet === 'function') goboStorageSet(key, serialized);
            else if (global.localStorage) localStorage.setItem(key, serialized);
            debugLog('saveJson: persisted', key, val);
        } catch(e){ errorLog('saveJson: persistence error for', key, e, 'value:', val); }
    }

    const mgr = {
        ready: false,
        map: {},          // { profileKey: number }
        free: [],         // [number]
        next: 1,          // next auto-increment id when free list empty
        _storeDeferred: false,
        _pendingAssignKeys: new Set(),
        _pendingRemoveKeys: new Set(),
        init(){
            // Defer initialization until GoboStore is hydrated to avoid losing persisted mapping
            try {
                if (typeof GoboStore !== 'undefined' && GoboStore && !GoboStore.ready) {
                    if (!this._storeDeferred) {
                        this._storeDeferred = true;
                        debugLog('init: GoboStore not ready; deferring ProfileIdManager initialization');
                        const handler = () => {
                            try { this._rehydrateAndFinalize(); } catch(e){ errorLog('deferred init failed', e); }
                        };
                        if (typeof document !== 'undefined') document.addEventListener('goboStorageReady', handler, { once: true });
                    } else {
                        debugLog('init: still waiting for GoboStore readiness');
                    }
                    return; // Do not mark ready yet
                }
            } catch(e){ /* ignore */ }
            if (this.ready) { debugLog('init: already ready'); return; }
            this._rehydrateAndFinalize();
        },
        _rehydrateAndFinalize(){
            // Load persisted state now that storage is (or assumed) available
            this.map = loadJson(STORAGE_KEY, this.map || {});
            this.free = loadJson(FREE_KEY, this.free || []);
            this.next = loadJson(NEXT_KEY, this.next == null ? null : this.next);
            if (this.next === null) {
                const maxId = Object.values(this.map).reduce((m,v)=> v>m? v : m, 0);
                this.next = maxId + 1 || 1;
                debugLog('_rehydrateAndFinalize: derived next from map', { maxId, next: this.next });
            }
            this.ready = true;
            this._storeDeferred = false;
            debugLog('_rehydrateAndFinalize: ready with persisted state', { map: { ...this.map }, free: [...this.free], next: this.next });
            // Apply any queued removals before queued assignments (so freed IDs are available)
            if (this._pendingRemoveKeys.size) {
                const toRemove = Array.from(this._pendingRemoveKeys);
                this._pendingRemoveKeys.clear();
                debugLog('_rehydrateAndFinalize: processing queued removals', toRemove);
                this.removeKeys(toRemove);
            }
            if (this._pendingAssignKeys.size) {
                const toAssign = Array.from(this._pendingAssignKeys);
                this._pendingAssignKeys.clear();
                debugLog('_rehydrateAndFinalize: processing queued assignments', toAssign);
                this._assignKeysInternal(toAssign);
            }
        },
        _assignKeysInternal(profileKeys){
            const normalized = Array.from(new Set((profileKeys || []).filter(k => /^gobo-/.test(k))));
            const assigned = [];
            normalized.forEach(k => {
                if (this.map[k] == null) {
                    let id;
                    if (this.free.length) {
                        this.free.sort((a,b)=>a-b);
                        id = this.free.shift();
                        debugLog('_assignKeysInternal: reused freed id', id, 'for key', k);
                    } else {
                        id = this.next++;
                        debugLog('_assignKeysInternal: allocated new id', id, 'for key', k);
                    }
                    this.map[k] = id;
                    assigned.push({ key: k, id, source: 'assign' });
                }
            });
            if (assigned.length) debugLog('_assignKeysInternal: newly assigned', assigned);
            if (assigned.length) this.persist();
            return this.map;
        },
        // Ensure IDs exist for provided profile keys; DO NOT reclaim implicitly to avoid churn.
        ensureIds(profileKeys){
            this.init();
            if (!this.ready) {
                // Queue keys for assignment after hydration; do NOT assign ephemeral IDs to avoid flicker / reassignment
                (profileKeys || []).forEach(k => { if (/^gobo-/.test(k)) this._pendingAssignKeys.add(k); });
                debugLog('ensureIds: deferred (storage not ready), queued keys', Array.from(this._pendingAssignKeys));
                return this.map; // likely empty until hydration
            }
            return this._assignKeysInternal(profileKeys);
        },
        removeKeys(keys){
            this.init();
            if (!this.ready) {
                (keys||[]).forEach(k => { if (/^gobo-/.test(k)) this._pendingRemoveKeys.add(k); });
                debugLog('removeKeys: deferred (storage not ready), queued removals', Array.from(this._pendingRemoveKeys));
                return;
            }
            const removed = [];
            (keys||[]).forEach(k => {
                if (this.map[k] != null) {
                    const id = this.map[k];
                    delete this.map[k];
                    if (!this.free.includes(id)) this.free.push(id);
                    removed.push({ key: k, id });
                }
            });
            if (removed.length) {
                debugLog('removeKeys: reclaimed', removed, 'free pool now', [...this.free]);
                this.persist();
            }
        },
        getId(profileKey){
            this.init();
            if (!this.ready) return null; // cannot guarantee mapping yet
            const id = this.map[profileKey] || null;
            debugLog('getId:', profileKey, '=>', id);
            return id;
        },
        persist(){
            if (!this.ready) { debugLog('persist: skipped (not ready)'); return; }
            debugLog('persist: writing state');
            saveJson(STORAGE_KEY, this.map);
            saveJson(FREE_KEY, this.free);
            saveJson(NEXT_KEY, this.next);
            debugLog('persist: complete');
        },
        dump(){
            this.init();
            if (!this.ready) { debugLog('dump: not ready (deferred)'); return { deferred:true, pendingAssign:Array.from(this._pendingAssignKeys), pendingRemove:Array.from(this._pendingRemoveKeys) }; }
            debugLog('dump: current in-memory state', { map: { ...this.map }, free: [...this.free], next: this.next });
            try {
                const rawMap = goboStorageGet ? goboStorageGet(STORAGE_KEY) : null;
                const rawFree = goboStorageGet ? goboStorageGet(FREE_KEY) : null;
                const rawNext = goboStorageGet ? goboStorageGet(NEXT_KEY) : null;
                debugLog('dump: stored raw values', { rawMap, rawFree, rawNext });
            } catch(e){ errorLog('dump: failed reading stored raw values', e); }
            return { map: { ...this.map }, free: [...this.free], next: this.next };
        },
        _resetAll(){
            // Diagnostic only – not used in production flow
            try {
                this.map = {};
                this.free = [];
                this.next = 1;
                this.persist();
                debugLog('_resetAll: state cleared');
            } catch(e){ errorLog('_resetAll: failed', e); }
        }
    };

    global.ProfileIdManager = mgr;
    try {
        if (!global.dumpProfileIdState) global.dumpProfileIdState = () => (global.ProfileIdManager ? global.ProfileIdManager.dump() : null);
        if (!global.resetProfileIdManager) global.resetProfileIdManager = () => (global.ProfileIdManager ? global.ProfileIdManager._resetAll() : null);
    } catch(e) { /* ignore */ }
})(typeof window !== 'undefined' ? window : globalThis);
