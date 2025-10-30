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
        return '1.5';
    })();
    // Increment REVISION when adding new steps within the same extension version to force re-showing the tour.
    const TOUR_REVISION = '3'; // r1 initial, r2 adds Buy Me a Coffee, r3 adds Advanced Search + Itinerary Links
    const STORAGE_KEY = 'goboWhatsNewShown-' + VERSION + '-r' + TOUR_REVISION;
    const RETRY_LIMIT = 40; // up to ~8s (200ms interval) waiting for elements

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
        isAlreadyCompleted(){
            return storageGet(STORAGE_KEY) === 'true';
        },
        markDone(){
            storageSet(STORAGE_KEY,'true');
            this._shown = true;
        },
        maybeAutoStart(){
            if (this._shown) return;
            if (this.isAlreadyCompleted()) return; // user completed previously
            // Only auto start once per page view & only after modal (tabs) present
            this.start(false);
        },
        start(force){
            if (this._shown && !force) return;
            if (this.isAlreadyCompleted() && !force) return;
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
                    id:'tradeInValue',
                    target:()=> document.querySelector('th[data-key="tradeInValue"]'),
                    title:'Trade-In Value Column',
                    body: 'New column showing trade-in value for eligible sailings.',
                },
                {
                    id:'advancedSearchPreview',
                    target:()=> document.querySelector('button.adv-search-button') || document.querySelector('#advanced-search-panel') || document.body,
                    title:'Advanced Search (Preview)',
                    body:'Work-in-progress panel to build filters and instantly search for offers. More operators & polish coming—feedback welcome!',
                },
                {
                    id:'itineraryLinks',
                    target:()=> document.querySelector('a.gobo-itinerary-link') || document.querySelector('th[data-key="destination"]') || document.body,
                    title:'Itinerary Details Links',
                    body:'Destination cells now include clickable itinerary links—open one to see route details & more context.',
                },
                {
                    id:'supportCoffee',
                    target:()=> document.querySelector('.buy-coffee-link') || document.body,
                    title:'Support Development',
                    body:'If this extension saves you time, consider a tip (Ko-Fi or Venmo, your choice!). Thank you for helping me keep up with the requests!',
                },
                {
                    id:'support-link',
                    target:()=> document.querySelector('.support-link') || document.body,
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
            tooltip.style.cssText='position:fixed;max-width:360px;background:#fff;color:#111;padding:14px 16px;border-radius:10px;font-size:13px;line-height:1.35;box-shadow:0 8px 28px rgba(0,0,0,.35);z-index:2147483647;pointer-events:auto;display:flex;flex-direction:column;gap:10px;';
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
            if (!step) { this.finish(); return; }
            // Skip missing targets (rare timing issues)
            if (!step.target()) { this.next(); return; }
            this._tooltip.querySelector('.gobo-whatsnew-title').textContent = step.title;
            this._tooltip.querySelector('.gobo-whatsnew-body').textContent = step.body;
            // Nav button labels
            if (this._currentStepIndex === this._steps.length -1) this._nav.btnNext.textContent='Done'; else this._nav.btnNext.textContent='Next';
            this._nav.btnBack.disabled = this._currentStepIndex===0;
            this._positionCurrent();
        },
        next(){
            this._currentStepIndex++;
            if (this._currentStepIndex >= this._steps.length) { this.finish(); return; }
            this._renderStep();
        },
        prev(){
            if (this._currentStepIndex <=0) return;
            this._currentStepIndex--; this._renderStep();
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
        }
    };

    // Expose
    try { window.WhatsNew = WhatsNew; } catch(e){}
})();
