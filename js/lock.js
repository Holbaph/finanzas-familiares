// lock.js — bloqueo local de la app con PIN. El PIN nunca se guarda en texto plano:
// solo se guarda su hash SHA-256 (calculado con Web Crypto, sin red).

const Lock = {
  KEY: 'ff_pin_v1',

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
    const c = this.getConfig();
    if (!c || !c.enabled) return true;
    const hash = await this.hash(pin);
    return hash === c.hash;
  },

  disable() { this.setConfig({ enabled: false, hash: null }); },

  showOverlay() {
    document.documentElement.classList.remove('locked-boot');
    document.getElementById('lockOverlay').classList.add('visible');
    const input = document.getElementById('lockPinInput');
    if (input) { input.value = ''; setTimeout(() => input.focus(), 50); }
  },
  hideOverlay() {
    document.documentElement.classList.remove('locked-boot');
    document.getElementById('lockOverlay').classList.remove('visible');
  },
};
