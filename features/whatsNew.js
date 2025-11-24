// whatsNew.js
// Provides a lightweight, versioned in-page "What's New" / guided help tour.
// Patch 1.5 topics:
//  1. Trade-in Value
//  2. Advanced Search (Preview / Work-in-Progress)
//  3. Itinerary Links in Destination column
//  4. Support / Buy Me a Coffee
(function(){
    const VERSION = (function(){
        try {
            if (typeof browser !== 'undefined' && browser.runtime?.getManifest) return browser.runtime.getManifest().version || '1.4';
            if (typeof chrome !== 'undefined' && chrome.runtime?.getManifest) return chrome.runtime.getManifest().version || '1.4';
        } catch(e) {}
        return '2.0';
    })();
    // Increment REVISION when adding new steps within the same extension version to force re-showing the tour.
    const TOUR_REVISION = '5'; // r1 initial, r2 adds Buy Me a Coffee, r3 adds Advanced Search + Itinerary Links, r4 adds Offer Code external lookup, r5 adds Back-to-Back Builder
    const STORAGE_KEY = 'goboWhatsNewShown-' + VERSION + '-r' + TOUR_REVISION;
    const RETRY_LIMIT = 20; // up to ~8s (200ms interval) waiting for elements

    function storageGet(key){
        try { return (typeof goboStorageGet === 'function' ? goboStorageGet(key) : localStorage.getItem(key)); } catch(e){ return null; }
    }
    function storageSet(key,val){
        try { if (typeof goboStorageSet === 'function') goboStorageSet(key,val); else localStorage.setItem(key,val); } catch(e){}
    }

    const WhatsNew = {
        _shown:false,
        _forced:false,
        _currentStepIndex: -1,
        _steps: [],
        _retryCount:0,
        _overlay:null,
        _focusRing:null,
        _tooltip:null,
        _backdrop:null,
        _nav:{},
        _starting:false,
        _hasRenderedOnce:false,
        isAlreadyCompleted(){
            return storageGet(STORAGE_KEY) === 'true';
        },
        markDone(){
            storageSet(STORAGE_KEY,'true');
            this._shown = true;
        },
        maybeAutoStart(){
            if (this._shown) return;
            // If the storage shim exists but isn't initialized yet, wait for it so we correctly
            // read the persisted shown flag instead of starting prematurely when in-memory cache
            // is empty on first tick.
            try {
                if (typeof GoboStore !== 'undefined' && GoboStore && !GoboStore.ready) {
                    const retry = () => {
                        try { this.maybeAutoStart(); } catch(e) { /* ignore */ }
                    };
                    document.addEventListener('goboStorageReady', retry, { once: true });
                    return;
                }
            } catch(e) { /* ignore */ }
            if (this.isAlreadyCompleted()) return; // user completed previously
            // Only auto start once per page view & only after modal (tabs) present
            this.start(false);
        },
        start(force){
            // Prevent multiple concurrent starts (page may fire multiple triggers during load).
            if (this._starting && !force) return;
            if (this._shown && !force) return;
            if (this.isAlreadyCompleted() && !force) return;
            this._starting = true;
            this._forced = !!force;
            // Ensure offers modal is open (needs #gobo-offers-table)
            if (!document.getElementById('gobo-offers-table')) {
                // Attach one-time observer waiting for modal insertion
                let tries = 0;
                const intv = setInterval(()=>{
                    tries++; if (document.getElementById('gobo-offers-table')) { clearInterval(intv); this._initAndBegin(); } else if (tries>50) { clearInterval(intv); }
                },160);
                // Also gently nudge user by pulsing the Show All Offers button
                this._addLaunchBadge();
                return;
            }
            this._initAndBegin();
        },
        _addLaunchBadge(){
            try {
                const existing = document.getElementById('gobo-whatsnew-launch');
                const button = document.getElementById('gobo-offers-button');
                if (!button || existing) return;
                const badge = document.createElement('div');
                badge.id='gobo-whatsnew-launch';
                badge.textContent='New in ' + VERSION + ' – Tour';
                badge.style.cssText='position:absolute;top:-6px;right:-6px;background:#f59e0b;color:#111;padding:2px 6px;font-size:11px;font-weight:600;border-radius:12px;cursor:pointer;z-index:2147483647;box-shadow:0 2px 4px rgba(0,0,0,.2);animation:goboPulse 1.6s infinite;';
                badge.addEventListener('click',()=>{ this.start(true); });
                // Wrap button in relatively positioned span if needed
                if (getComputedStyle(button).position === 'static') button.style.position='relative';
                button.appendChild(badge);
            } catch(e){}
        },
        _initSteps(){
            // Helper to find first link icon img inside a regular gobo-* profile tab (not favorites or combined)
            function findLinkIcon(){
                const tabs = document.querySelectorAll('.profile-tab');
                for (const t of tabs) {
                    const sk = t.getAttribute('data-storage-key') || '';
                    if (sk.startsWith('gobo-')) {
                        const img = t.querySelector('img[src*="link"]'); // matches link.png or link_off.png
                        if (img) return img;
                    }
                }
                return null;
            }
            this._steps = [
                {
                    id:'offerCodeLookupExternal',
                    target:()=> document.querySelector('.offer-code-link') || document.querySelector('th[data-key="offerCode"]') || null,
                    title:'Offer Code Lookup Upgrade',
                    body:'Offer Code links now open AJ Goldsman\'s external lookup tool for richer details. First click shows a one-time safety warning.',
                },
                {
                    id:'advancedSearchPreview',
                    target:()=> document.querySelector('button.adv-search-button') || document.querySelector('#advanced-search-panel') || null,
                    title:'Advanced Search',
                    body:'Work-in-progress panel to build filters and instantly search for offers. More operators & polish coming—feedback welcome!',
                },
                {
                    id:'itineraryLinks',
                    target:()=> document.querySelector('a.gobo-itinerary-link') || document.querySelector('th[data-key="destination"]') || null,
                    title:'Itinerary Details Links',
                    body:'Destination cells now include clickable itinerary links—open one to see route details & more context.',
                },
                {
                    id:'offerValueColumn',
                    target:()=> document.querySelector('th[data-key="offerValue"]') || null,
                    title:'Offer Value Column',
                    body:'Shows estimated monetary value of the offer (dual occupancy base minus taxes; heuristic for single guest). Usable in sorting, grouping, filtering & CSV export.',
                }
                ,
                {
                    id:'backToBackBuilder',
                    target:()=> document.querySelector('th[data-key="b2bDepth"]') || document.querySelector('.b2b-visualizer-overlay') || null,
                    title:'Back-to-Back Builder',
                    body:'New visual Back-to-Back Builder: open any offer\'s depth pill to explore and assemble chains of connecting sailings. Candidate offers show matching room categories in green for easy scanning.',
                },
                {
                    id:'settingsGear',
                    target:()=> document.querySelector('#gobo-settings-gear') || document.querySelector('.gobo-settings-gear') || null,
                    title:'Settings & Preferences',
                    body:'Open the Settings gear to adjust preferences, edit advanced search defaults, and control features like Back-to-Back auto-run.',
                },
                {
                    id:'supportCoffee',
                    target:()=> document.querySelector('.buy-coffee-link') || null,
                    title:'Support Development',
                    body:'If this extension saves you time, consider a tip (Ko-Fi or Venmo, your choice!). Thank you for helping me keep up with the requests!',
                },
                {
                    id:'support-link',
                    target:()=> document.querySelector('.support-link') || null,
                    title:'Get Help',
                    body:'Follow us on Facebook for updates or support!',
                },
            ];
        },
        _initAndBegin(){
            this._initSteps();
            // Verify first target exists; else retry a few times (UI builds async)
            if (!this._steps[0].target()) {
                if (this._retryCount++ < RETRY_LIMIT) {
                    setTimeout(()=>this._initAndBegin(),200);
                    return;
                } else {
                    return; // abort quietly
                }
            }
            this._buildOverlay();
            this._currentStepIndex = -1;
            this.next();
        },
        _buildOverlay(){
            if (this._overlay) return;
            const overlay = document.createElement('div');
            overlay.id='gobo-whatsnew-overlay';
            overlay.style.cssText='position:fixed;inset:0;z-index:2147483646;pointer-events:none;font-family:inherit;';
            const backdrop = document.createElement('div');
            backdrop.className='gobo-whatsnew-backdrop';
            backdrop.style.cssText='position:absolute;inset:0;background:rgba(0,0,0,0.55);backdrop-filter:blur(1px);';
            const focusRing = document.createElement('div');
            focusRing.className='gobo-whatsnew-focus';
            focusRing.style.cssText='position:fixed;border:3px solid #fbbf24;box-shadow:0 0 0 4px rgba(251,191,36,.35),0 0 18px 6px rgba(251,191,36,.5);border-radius:10px;transition:all .25s ease;pointer-events:none;';
            const tooltip = document.createElement('div');
            tooltip.className='gobo-whatsnew-tooltip';
            // start hidden to avoid a blank tooltip in the corner before positioning
            tooltip.style.cssText='position:fixed;max-width:360px;background:#fff;color:#111;padding:14px 16px;border-radius:10px;font-size:13px;line-height:1.35;box-shadow:0 8px 28px rgba(0,0,0,.35);z-index:2147483647;pointer-events:auto;display:flex;flex-direction:column;gap:10px;opacity:0;transform:translateY(-6px);';
            // enable smooth fade/slide for tooltip
            tooltip.style.transition = 'opacity .22s ease, transform .22s ease';
            tooltip.innerHTML = '<div class="gobo-whatsnew-title" style="font-weight:700;font-size:14px;"></div><div class="gobo-whatsnew-body"></div>';
            const nav = document.createElement('div');
            nav.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:8px;';
            function makeBtn(label){ const b=document.createElement('button'); b.type='button'; b.textContent=label; b.style.cssText='background:#0d3b66;color:#fff;border:none;padding:6px 12px;font-size:12px;border-radius:6px;cursor:pointer;font-weight:600;'; return b; }
            const btnSkip = makeBtn('Skip'); btnSkip.style.background='#6b7280';
            const btnBack = makeBtn('Back'); btnBack.style.background='#374151';
            const btnNext = makeBtn('Next');
            nav.appendChild(btnSkip); nav.appendChild(btnBack); nav.appendChild(btnNext);
            tooltip.appendChild(nav);
            overlay.appendChild(backdrop); overlay.appendChild(focusRing); overlay.appendChild(tooltip);
            document.body.appendChild(overlay);
            this._overlay=overlay; this._focusRing=focusRing; this._tooltip=tooltip; this._backdrop=backdrop; this._nav={btnSkip,btnBack,btnNext};
            btnSkip.addEventListener('click', ()=> this.finish(true));
            btnBack.addEventListener('click', ()=> this.prev());
            btnNext.addEventListener('click', ()=> this.next());
            document.addEventListener('keydown', this._keyHandler = (e)=>{
                if (e.key==='Escape') { this.finish(true); }
                else if (e.key==='ArrowRight' || e.key==='Enter') { this.next(); }
                else if (e.key==='ArrowLeft') { this.prev(); }
            });
            window.addEventListener('resize', this._repositionHandler = ()=> this._positionCurrent());
            window.addEventListener('scroll', this._repositionHandler, true);
        },
        _positionCurrent(){
            if (this._currentStepIndex <0) return;
            const step = this._steps[this._currentStepIndex];
            const target = step && step.target && step.target();
            if (!target) return;
            const rect = target.getBoundingClientRect();
            this._focusRing.style.top = (rect.top - 6) + 'px';
            this._focusRing.style.left = (rect.left - 6) + 'px';
            this._focusRing.style.width = (rect.width + 12) + 'px';
            this._focusRing.style.height = (rect.height + 12) + 'px';
            // Tooltip positioning (below if space else above)
            const tt = this._tooltip;
            const margin = 10;
            let top = rect.bottom + margin;
            let left = rect.left;
            const vw = window.innerWidth; const vh = window.innerHeight;
            tt.style.maxWidth='360px'; tt.style.width='auto';
            // Adjust if off right edge
            if (left + 380 > vw) left = Math.max(12, vw - 380);
            // If not enough space below, place above
            const neededHeight = tt.offsetHeight || 160;
            if (rect.bottom + margin + neededHeight > vh && rect.top - margin - neededHeight > 0) {
                top = rect.top - margin - neededHeight;
            }
            tt.style.top = Math.max(12, top) + 'px';
            tt.style.left = Math.max(12, left) + 'px';
        },
        _renderStep(){
            const step = this._steps[this._currentStepIndex];
            if (!step) { this.finish(); return Promise.resolve(false); }
            // Resolve target; if not present (or deliberately null) signal caller to skip.
            const target = step && step.target ? step.target() : null;
            if (!target) { return Promise.resolve(false); }

            // Attempt to scroll the target into view so the focus ring and tooltip are visible.
            try {
                if (typeof target.scrollIntoView === 'function') {
                    try {
                        target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
                    } catch (e) {
                        target.scrollIntoView();
                    }
                }
            } catch (e) { /* ignore scroll errors */ }

            // Update tooltip text after scrolling has been initiated so nav clicks
            // that call next() will perform scroll first (see next()).
            this._tooltip.querySelector('.gobo-whatsnew-title').textContent = step.title;
            this._tooltip.querySelector('.gobo-whatsnew-body').textContent = step.body;
            // Nav button labels
            if (this._currentStepIndex === this._steps.length -1) this._nav.btnNext.textContent='Done'; else this._nav.btnNext.textContent='Next';
            this._nav.btnBack.disabled = this._currentStepIndex===0;
            // Position the focus ring immediately (don't introduce artificial delays).
            try { this._positionCurrent(); } catch(e) { /* ignore */ }
            // Resolve immediately to let callers proceed; CSS transitions handle visual timing.
            return Promise.resolve(true);
        },
        _fadeOutTooltip(){
            if (!this._tooltip) return Promise.resolve();
            const el = this._tooltip;
            try { const cs = getComputedStyle(el); if (cs && cs.opacity === '0') return Promise.resolve(); } catch(e) {}
            return new Promise((resolve)=>{
                let done = false;
                const onEnd = (ev)=>{
                    if (ev && ev.target !== el) return;
                    if (done) return; done = true;
                    el.removeEventListener('transitionend', onEnd);
                    resolve();
                };
                el.addEventListener('transitionend', onEnd);
                try {
                    // Kick off the fade/slide in next frame so the transition applies.
                    requestAnimationFrame(()=>{
                        try { el.style.opacity = '0'; el.style.transform = 'translateY(-6px)'; } catch(e){}
                    });
                } catch(e){ onEnd(); }
                // Fallback in case transitionend doesn't fire
                setTimeout(()=>{ if (!done) { done = true; el.removeEventListener('transitionend', onEnd); resolve(); } }, 600);
            });
        },
        _fadeInTooltip(){
            if (!this._tooltip) return Promise.resolve();
            const el = this._tooltip;
            try { const cs = getComputedStyle(el); if (cs && cs.opacity === '1') return Promise.resolve(); } catch(e) {}
            return new Promise((resolve)=>{
                let done = false;
                const onEnd = (ev)=>{
                    if (ev && ev.target !== el) return;
                    if (done) return; done = true;
                    el.removeEventListener('transitionend', onEnd);
                    resolve();
                };
                el.addEventListener('transitionend', onEnd);
                try {
                    requestAnimationFrame(()=>{
                        try { el.style.transform = 'translateY(0)'; el.style.opacity = '1'; } catch(e){}
                    });
                } catch(e){ onEnd(); }
                // Fallback
                setTimeout(()=>{ if (!done) { done = true; el.removeEventListener('transitionend', onEnd); resolve(); } }, 600);
            });
        },
        async next(){
            if (this._animating) return;
            this._animating = true;
            // Only fade out if we've rendered at least once (avoid initial blank fade)
            if (this._hasRenderedOnce) await this._fadeOutTooltip();

            // Advance until we find a valid target or run out of steps
            while (true) {
                this._currentStepIndex++;
                if (this._currentStepIndex >= this._steps.length) { this.finish(); this._animating = false; return; }
                try {
                    const ok = await this._renderStep();
                    if (ok) break; // rendered successfully
                } catch(e) { /* on error, try next */ }
            }

            // Mark that we've shown a step at least once and fade in tooltip for the rendered step
            this._hasRenderedOnce = true;
            await this._fadeInTooltip();
            this._animating = false;
        },
        async prev(){
            if (this._animating) return;
            if (this._currentStepIndex <=0) return;
            this._animating = true;
            if (this._hasRenderedOnce) await this._fadeOutTooltip();

            // Move backwards until a valid step is found or we hit the start
            while (true) {
                this._currentStepIndex--;
                if (this._currentStepIndex < 0) { this._animating = false; return; }
                try {
                    const ok = await this._renderStep();
                    if (ok) break;
                } catch(e) { /* try previous */ }
            }

            this._hasRenderedOnce = true;
            await this._fadeInTooltip();
            this._animating = false;
        },
        finish(skipped){
            this.markDone();
            this._cleanup();
        },
        _cleanup(){
            this._shown=true;
            if (this._overlay) { try { this._overlay.remove(); } catch(e){} }
            document.removeEventListener('keydown', this._keyHandler);
            window.removeEventListener('resize', this._repositionHandler);
            window.removeEventListener('scroll', this._repositionHandler, true);
            this._overlay=null; this._focusRing=null; this._tooltip=null; this._backdrop=null;
            this._starting = false;
        }
    };

    // Expose
    try { window.WhatsNew = WhatsNew; } catch(e){}
})();
