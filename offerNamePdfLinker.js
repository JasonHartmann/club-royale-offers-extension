const OfferNamePdfLinker = {
  _headCache: new Map(),        // code -> { status: 'pending' | 'ok' | 'fail', promise?: Promise }
  _observerStarted: false,
  _pendingApply: false,
  BASE_URL: 'https://www.royalcaribbean.com/content/dam/royal/resources/pdf/casino/offers/',

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

  // HEAD request initiation with caching
  _initiateHead(code) {
    if (!code) return;
    const cached = this._headCache.get(code);
    if (cached) {
      if (cached.status === 'ok') this._enableLinksForCode(code);
      return; // pending or final state already
    }
    const url = this._buildUrl(code);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const promise = fetch(url, { method: 'HEAD', signal: controller.signal })
      .then(resp => {
        if (resp.ok) {
          this._headCache.set(code, { status: 'ok' });
          this._enableLinksForCode(code);
        } else {
          this._headCache.set(code, { status: 'fail' });
        }
      })
      .catch(() => {
        this._headCache.set(code, { status: 'fail' });
      })
      .finally(() => clearTimeout(timeout));
    this._headCache.set(code, { status: 'pending', promise });
  },

  _buildUrl(code) {
    const safe = encodeURIComponent(code.trim().toUpperCase());
    return `${this.BASE_URL}${safe}.pdf`;
  },

  // Apply links for every code whose pdf was found
  applyAllKnownLinks() {
    this._headCache.forEach((val, code) => {
      if (val.status === 'ok') this._enableLinksForCode(code);
    });
  },

  // Turn Name cells into links for a single code
  _enableLinksForCode(code) {
    if (!code) return;
    const url = this._buildUrl(code);
    const anchors = document.querySelectorAll(`a.offer-code-link[data-offer-code="${CSS.escape(code)}"]`);
    anchors.forEach(a => {
      const row = a.closest('tr');
      if (!row) return;
      const cells = row.querySelectorAll('td');
      if (cells.length < 4) return; // defensive
      const nameCell = cells[3]; // Name column
      if (!nameCell) return;
      // Skip if already processed
      if (nameCell.querySelector('a.offer-name-pdf-link')) return;
      const nameText = nameCell.textContent.trim();
      if (!nameText || nameText === '-') return;
      // Replace content with link
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
  }
};

