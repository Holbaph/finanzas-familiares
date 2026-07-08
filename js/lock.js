// lock.js — bloqueo local de la app con PIN y/o Face ID / Touch ID.
// El PIN nunca se guarda en texto plano: solo su hash SHA-256 (Web Crypto, sin red).
// Face ID/Touch ID usa WebAuthn con el autenticador de la plataforma (Secure Enclave):
// la app nunca ve ni guarda datos biométricos, solo un identificador de credencial.

const Lock = {
  KEY: 'ff_pin_v1',
  PIN_LARGO: 4,

  getConfig() {
    try { return JSON.parse(localStorage.getItem(this.KEY) || 'null'); }
    catch (e) { return null; }
  },
  setConfig(cfg) { localStorage.setItem(this.KEY, JSON.stringify(cfg)); },
  isEnabled() {
    const c = this.getConfig();
    return !!(c && c.enabled && c.hash);
  },

  async hash(pin) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ff-salt-' + pin));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  },

  async setPin(pin) {
    const hash = await this.hash(pin);
    this.setConfig({ enabled: true, hash, length: pin.length });
  },

  async verify(pin) {
    if (!this.isEnabled()) return false;
    const hash = await this.hash(pin);
    return hash === this.getConfig().hash;
  },

  disable() { this.setConfig({ enabled: false, hash: null }); },

  showOverlay() {
    document.documentElement.classList.remove('locked-boot');
    document.getElementById('lockOverlay').classList.add('visible');
    const input = document.getElementById('lockPinInput');
    if (input) input.value = '';
  },
  hideOverlay() {
    document.documentElement.classList.remove('locked-boot');
    document.getElementById('lockOverlay').classList.remove('visible');
  },
};

const Biometric = {
  KEY: 'ff_biometric_v1',

  getConfig() {
    try { return JSON.parse(localStorage.getItem(this.KEY) || 'null'); }
    catch (e) { return null; }
  },
  setConfig(cfg) { localStorage.setItem(this.KEY, JSON.stringify(cfg)); },
  isEnabled() {
    const c = this.getConfig();
    return !!(c && c.enabled && c.credentialId);
  },
  disable() { this.setConfig({ enabled: false, credentialId: null }); },

  async isAvailable() {
    if (!window.PublicKeyCredential || !navigator.credentials) return false;
    try { return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); }
    catch (e) { return false; }
  },

  _randomBytes(len) {
    const arr = new Uint8Array(len);
    crypto.getRandomValues(arr);
    return arr;
  },
  _toB64(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  },
  _fromB64(b64) {
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  },

  // Crea una credencial local ligada al Face ID / Touch ID del teléfono.
  async registrar() {
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: this._randomBytes(32),
        rp: { name: 'Finanzas Familiares' },
        user: { id: this._randomBytes(16), name: 'finanzas-local', displayName: 'Finanzas Familiares' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
        timeout: 60000,
        attestation: 'none',
      },
    });
    if (!cred) throw new Error('No se pudo crear la credencial');
    this.setConfig({ enabled: true, credentialId: this._toB64(cred.rawId) });
  },

  // Pide Face ID / Touch ID. Devuelve true solo si el usuario se autenticó con éxito.
  async verificar() {
    const cfg = this.getConfig();
    if (!cfg || !cfg.enabled || !cfg.credentialId) return false;
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: this._randomBytes(32),
        allowCredentials: [{ id: this._fromB64(cfg.credentialId), type: 'public-key' }],
        userVerification: 'required',
        timeout: 60000,
      },
    });
    return !!assertion;
  },
};
