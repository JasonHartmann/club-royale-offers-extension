// offerCodeLookup.js
// Encapsulates logic to open a new tab performing a POST lookup for an offer code.
const OfferCodeLookup = {
  _initialized: false,
  _royalEndpoint: 'https://www.clubroyaleoffers.com/CertificateOfferCodeLookUp.asp',
  _celebrityEndpoint: 'https://www.bluechipcluboffers.com/CertificateOfferCodeLookUp.asp',
  _getEndpoint() {
    const brand = (typeof App !== 'undefined' && App.Utils && typeof App.Utils.detectBrand === 'function')
      ? App.Utils.detectBrand()
      : ((location && location.hostname && location.hostname.includes('celebritycruises.com')) ? 'C' : 'R');
    return brand === 'C' ? this._celebrityEndpoint : this._royalEndpoint;
  },
  init() {
    if (this._initialized) return;
    document.addEventListener('click', (e) => {
      const a = e.target.closest('.offer-code-link');
      if (!a) return;
      e.preventDefault();
      const code = a.getAttribute('data-offer-code');
      if (!code || code === '-') return;
      this.openPostInNewTab(code);
    });
    this._initialized = true;
  },
  openPostInNewTab(code) {
    try {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = this._getEndpoint();
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
    } catch (err) {
      console.warn('OfferCodeLookup POST open failed for code', code, err);
    }
  }
};
