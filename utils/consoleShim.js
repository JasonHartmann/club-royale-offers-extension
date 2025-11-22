(function(){
    // Preserve originals
    const _orig = {
        debug: console.debug && console.debug.bind ? console.debug.bind(console) : (...a)=>{},
        log: console.log && console.log.bind ? console.log.bind(console) : (...a)=>{},
        info: console.info && console.info.bind ? console.info.bind(console) : (...a)=>{},
        warn: console.warn && console.warn.bind ? console.warn.bind(console) : (...a)=>{},
        error: console.error && console.error.bind ? console.error.bind(console) : (...a)=>{}
    };

    // Basic arg redaction to avoid printing tokens/authorization strings
    function redactArg(a){
        try {
            if (typeof a === 'string'){
                // redact Bearer tokens and long-looking token strings
                let s = a.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, 'Bearer <REDACTED>');
                s = s.replace(/authorization\s*[:=]\s*['"]?[^'"\s]+['"]?/ig, 'authorization: <REDACTED>');
                return s;
            }
            if (a && typeof a === 'object'){
                try {
                    // Clone to avoid mutating original or returning a live reference that devtools later expands
                    let clone;
                    if (typeof structuredClone === 'function') {
                        clone = structuredClone(a);
                    } else {
                        // Fallback to JSON round-trip; if that fails, fall back to shallow copy
                        try { clone = JSON.parse(JSON.stringify(a)); } catch(e) { clone = Array.isArray(a) ? a.slice() : Object.assign({}, a); }
                    }
                    if (Array.isArray(clone)) return clone.map(redactArg);
                    Object.keys(clone || {}).forEach(k => {
                        try {
                            if (/token|authorization|auth|password|passwd|secret|api[_-]?key/i.test(k)) clone[k] = '<REDACTED>';
                        } catch(e) { /* ignore per-key errors */ }
                    });
                    return clone;
                } catch(e) { return a; }
            }
            return a;
        } catch(e){ return a; }
    }

    function mapSafe(args){
        return args.map(redactArg);
    }

    function debugEnabled(){
        try { return (typeof window !== 'undefined' && !!window.GOBO_DEBUG_ENABLED); } catch(e){ return false; }
    }

    // Override console.debug to be gated by the global flag
    console.debug = function(...args){
        if (!debugEnabled()) return;
        try { _orig.debug(...mapSafe(args)); } catch(e){}
    };

    // console.log / info: allow but suppress '[DEBUG]' prefixed messages unless debug enabled
    console.log = function(...args){
        try {
            if (typeof args[0] === 'string' && args[0].includes('[DEBUG]') && !debugEnabled()) return;
            _orig.log(...mapSafe(args));
        } catch(e){}
    };
    console.info = function(...args){
        try {
            if (typeof args[0] === 'string' && args[0].includes('[DEBUG]') && !debugEnabled()) return;
            _orig.info(...mapSafe(args));
        } catch(e){}
    };

    // keep warn/error as-is but still redact arguments
    console.warn = function(...args){ try { _orig.warn(...mapSafe(args)); } catch(e){} };
    console.error = function(...args){ try { _orig.error(...mapSafe(args)); } catch(e){} };

    // Expose a small helper so existing code can test without repeating the typeof window check
    try { if (typeof window !== 'undefined') window.__goboDebugEnabled = debugEnabled; } catch(e){}
})();
