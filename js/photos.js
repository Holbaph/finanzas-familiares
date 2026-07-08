// photos.js — almacenamiento de fotos (boletas / comprobantes) en IndexedDB.
// Se guardan como Blob comprimido; localStorage solo guarda el id de referencia.

const Photos = {
  _dbPromise: null,

  _open() {
    if (this._dbPromise) return this._dbPromise;
    this._dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('ff_photos_db', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('photos');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this._dbPromise;
  },

  // Redimensiona/comprime una foto (File/Blob) antes de guardarla, para no saturar el almacenamiento.
  async _compress(file, maxDim = 1280, quality = 0.72) {
    const bitmap = await createImageBitmap(file).catch(() => null);
    if (!bitmap) return file;
    let { width, height } = bitmap;
    if (width > maxDim || height > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob || file), 'image/jpeg', quality));
  },

  async save(id, file) {
    const blob = await this._compress(file);
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('photos', 'readwrite');
      tx.objectStore('photos').put(blob, id);
      tx.oncomplete = () => resolve(id);
      tx.onerror = () => reject(tx.error);
    });
  },

  async getBlob(id) {
    if (!id) return null;
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('photos', 'readonly');
      const req = tx.objectStore('photos').get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  async getURL(id) {
    const blob = await this.getBlob(id);
    return blob ? URL.createObjectURL(blob) : null;
  },

  async delete(id) {
    if (!id) return;
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('photos', 'readwrite');
      tx.objectStore('photos').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
};
