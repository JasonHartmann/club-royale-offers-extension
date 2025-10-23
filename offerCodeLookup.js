// offerCodeLookup.js
// Encapsulates logic to open a new tab performing a POST lookup for an offer code.
const OfferCodeLookup = {
  _initialized: false,
  _royalEndpoint: 'https://image.RoyalCaribbeanMarketing.com/lib/fe9415737666017570/m/1/',
  _celebrityEndpoint: 'https://www.bluechipcluboffers.com/CertificateOfferCodeLookUp.asp',
  _getEndpoint() {
    const brand = (typeof App !== 'undefined' && App.Utils && typeof App.Utils.detectBrand === 'function')
      ? App.Utils.detectBrand()
      : ((location && location.hostname && location.hostname.includes('celebritycruises.com')) ? 'C' : 'R');
    return brand === 'C' ? this._celebrityEndpoint : this._royalEndpoint;
  },
  init() {
    if (this._initialized) return;
    const handler = (e) => {
      // Only handle left-clicks on 'click' and middle-click on 'auxclick'
      const isAux = e.type === 'auxclick';
      // e.button: 0 = left, 1 = middle, 2 = right
      if ((isAux && e.button !== 1) || (!isAux && e.button !== 0)) return;
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
        const url = endpoint + code + '.jpg';
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