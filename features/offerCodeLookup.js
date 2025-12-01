// offerCodeLookup.js
// Encapsulates logic to open a new tab performing a POST lookup for an offer code.
const OfferCodeLookup = {
  _initialized: false,
  _royalEndpoint: 'https://club-royale-offers-lookup.onrender.com/?code=',
  _celebrityEndpoint: 'https://www.bluechipcluboffers.com/CertificateOfferCodeLookUp.asp',
  _warnKey: 'goboOfferCodeLookupWarned_v1', // stored via extension storage shim
  _getEndpoint() {
    const brand = (typeof App !== 'undefined' && App.Utils && typeof App.Utils.detectBrand === 'function')
      ? App.Utils.detectBrand()
      : ((location && location.hostname && location.hostname.includes('celebritycruises.com')) ? 'C' : 'R');
    return brand === 'C' ? this._celebrityEndpoint : this._royalEndpoint;
  },
  _hasAcknowledgedWarning() {
    try {
      const raw = (typeof goboStorageGet === 'function') ? goboStorageGet(this._warnKey) : null;
      return !!raw; // any truthy value means acknowledged
    } catch(e){ return false; }
  },
  _markAcknowledged() {
    try {
      if (typeof goboStorageSet === 'function') goboStorageSet(this._warnKey, '1');
      else if (typeof localStorage !== 'undefined') localStorage.setItem(this._warnKey, '1');
    } catch(e){ /* ignore */ }
  },
  _showFirstTimeWarning() {
    try {
      const brand = (typeof App !== 'undefined' && App.Utils && typeof App.Utils.detectBrand === 'function') ? App.Utils.detectBrand() : 'R';
      const siteDesc = brand === 'C' ? 'a Celebrity Cruises partner site' : 'an external Club Royale lookup service';
      const msg = `External Offer Code Lookup\n\nThis action will open ${siteDesc} in a new browser tab.\n\nContinue?`;
      const proceed = window.confirm(msg);
      if (proceed) this._markAcknowledged();
      return proceed;
    } catch(e){ return true; }
  },
  init() {
    if (this._initialized) return;
    const handler = (e) => {
  // Only handle left-clicks on 'click' and middle-click on 'auxclick'.
  // On some mobile browsers (iOS Safari) touch-generated click events may have
  // e.button === undefined - treat undefined as a left-click here so taps work.
  const isAux = e.type === 'auxclick';
  // e.button: 0 = left, 1 = middle, 2 = right; undefined on some touch events
  const btn = (typeof e.button === 'number') ? e.button : 0;
  if ((isAux && btn !== 1) || (!isAux && btn !== 0)) return;
      const a = e.target.closest && e.target.closest('.offer-code-link');
      if (!a) return;
      try {
        // Prevent browser default navigation (and any other handlers) to avoid duplicate opens
        e.preventDefault();
        if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
      } catch (err) {}
      const code = a.getAttribute('data-offer-code');
      if (!code || code === '-') return;
      if (!this._hasAcknowledgedWarning()) {
        if (!this._showFirstTimeWarning()) return; // user cancelled
      }
      this.openPostInNewTab(code);
    };
    // Capture both regular clicks and auxiliary (middle) clicks. Use capture to reduce chance of duplicate handlers.
    document.addEventListener('click', handler, true);
    document.addEventListener('auxclick', handler, true);
    this._initialized = true;
  },
  openPostInNewTab(code) {
    try {
      const endpoint = this._getEndpoint();
      const brand = (typeof App !== 'undefined' && App.Utils && typeof App.Utils.detectBrand === 'function')
        ? App.Utils.detectBrand()
        : ((location && location.hostname && location.hostname.includes('celebritycruises.com')) ? 'C' : 'R');
      if (brand === 'R') {
        // Royal: open GET for image URL
        const url = endpoint + code;
        window.open(url, '_blank');
      } else {
        // Celebrity: use POST as before
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = endpoint;
        form.target = '_blank';
        form.style.display = 'none';

        const codeInput = document.createElement('input');
        codeInput.type = 'hidden';
        codeInput.name = 'tbxOfferCD';
        codeInput.value = code;
        form.appendChild(codeInput);

        const btnInput = document.createElement('input');
        btnInput.type = 'hidden';
        btnInput.name = 'btnLookup';
        btnInput.value = 'LOOKUP';
        form.appendChild(btnInput);

        document.body.appendChild(form);
        form.submit();
        setTimeout(() => form.remove(), 4000);
      }
    } catch (err) {
      console.warn('OfferCodeLookup open failed for code', code, err);
    }
  }
};