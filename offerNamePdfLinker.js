const OfferNamePdfLinker = {
  _headCache: new Map(),        // code -> { status: 'pending' | 'ok' | 'fail', promise?: Promise }
  _observerStarted: false,
  _pendingApply: false,
  _chosenBase: null,            // once we find a working base for this brand we keep it

  // Candidate PDF base paths (first existing will be chosen). Allows flexibility if folder names differ per brand.
  _getCandidateBases() {
    const brand = (typeof App !== 'undefined' && App.Utils && typeof App.Utils.detectBrand === 'function') ? App.Utils.detectBrand() : 'R';
    try {
      const custom = localStorage.getItem('casinoPdfBase');
      if (custom && /^https?:\/\//i.test(custom)) return [custom.replace(/\/$/, '') + '/'];
    } catch(e) {}
    if (brand === 'C') {
      return ['https://www.celebritycruises.com/content/dam/celebrity/resources/pdf/casino/offers/'];
    } else {
      return ['https://www.royalcaribbean.com/content/dam/royal/resources/pdf/casino/offers/'];
    }
  },

  // Public entry called after offers data is first displayed
  queueHeadChecks(data) {
    if (!data || !Array.isArray(data.offers)) return;
    this._ensureObserver();
    const uniqueCodes = new Set();
    data.offers.forEach(o => {
      const code = o?.campaignOffer?.offerCode;
      if (code && typeof code === 'string' && code !== '-') uniqueCodes.add(code.trim().toUpperCase());
    });
    uniqueCodes.forEach(code => this._initiateHead(code));
  },

  // Start a MutationObserver to re-apply links after table rebuilds
  _ensureObserver() {
    if (this._observerStarted) return;
    const container = document.body; // observe broadly; table lives inside body
    if (!container) return;
    const obs = new MutationObserver(() => {
      if (this._pendingApply) return;
      this._pendingApply = true;
      requestAnimationFrame(() => {
        this._pendingApply = false;
        this.applyAllKnownLinks();
      });
    });
    obs.observe(container, { childList: true, subtree: true });
    this._observerStarted = true;
  },

  // Attempt HEAD with caching
  _initiateHead(code) {
    if (!code) return;
    const cached = this._headCache.get(code);
    if (cached) {
      if (cached.status === 'ok') this._enableLinksForCode(code);
      return; // pending or final
    }
    const promise = this._attemptBasesSequentially(code)
      .then(success => {
        if (success) {
          this._headCache.set(code, { status: 'ok' });
          this._enableLinksForCode(code);
        } else {
          this._headCache.set(code, { status: 'fail' });
        }
      });
    this._headCache.set(code, { status: 'pending', promise });
  },

  async _attemptBasesSequentially(code) {
    const bases = this._chosenBase ? [this._chosenBase] : this._getCandidateBases();
    const safe = encodeURIComponent(code.trim().toUpperCase());
    for (const base of bases) {
      const url = base + safe + '.pdf';
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const resp = await fetch(url, { method: 'HEAD', signal: controller.signal });
        clearTimeout(timeout);
        if (resp.ok) {
            this._chosenBase = base; // cache working base for subsequent codes
            return true;
        }
      } catch(e) {
        // ignore and continue
      }
    }
    // If we had no chosen base yet and first pass failed, don't retry all every time; bases list likely invalid
    return false;
  },

  applyAllKnownLinks() {
    this._headCache.forEach((val, code) => {
      if (val.status === 'ok') this._enableLinksForCode(code);
    });
  },

  _enableLinksForCode(code) {
    if (!code) return;
    const url = this._buildUrl(code);
    if (!url) return;
    const anchors = document.querySelectorAll(`a.offer-code-link[data-offer-code="${CSS.escape(code)}"]`);
    anchors.forEach(a => {
      const row = a.closest('tr');
      if (!row) return;
      const cells = row.querySelectorAll('td');
      if (cells.length < 4) return; // defensive
      const nameCell = cells[3]; // Name column
      if (!nameCell) return;
      if (nameCell.querySelector('a.offer-name-pdf-link')) return; // already processed
      const nameText = nameCell.textContent.trim();
      if (!nameText || nameText === '-') return;
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = nameText;
      link.className = 'offer-name-pdf-link text-blue-600 underline';
      link.title = `Open PDF for offer code ${code}`;
      nameCell.innerHTML = '';
      nameCell.appendChild(link);
    });
  },

  _buildUrl(code) {
    const base = this._chosenBase || this._getCandidateBases()[0];
    if (!base) return null;
    const safe = encodeURIComponent(code.trim().toUpperCase());
    return base + safe + '.pdf';
  }
};
