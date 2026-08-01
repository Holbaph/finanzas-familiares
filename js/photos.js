// photos.js — almacenamiento de fotos (boletas / comprobantes / deudas) en Supabase
// Storage (bucket privado "fotos"), para que estén disponibles desde cualquier
// dispositivo con sesión iniciada. Se comprimen antes de subir para no gastar espacio
// ni datos móviles de más.

const Photos = {
  // Redimensiona/comprime una foto (File/Blob) antes de guardarla.
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
    const { error } = await supabaseClient.storage.from('fotos').upload(id, blob, {
      upsert: true,
      contentType: 'image/jpeg',
    });
    if (error) throw error;
    return id;
  },

  async getBlob(id) {
    if (!id) return null;
    const { data, error } = await supabaseClient.storage.from('fotos').download(id);
    if (error) { console.error('Photos.getBlob', error); return null; }
    return data;
  },

  async getURL(id) {
    const blob = await this.getBlob(id);
    return blob ? URL.createObjectURL(blob) : null;
  },

  async delete(id) {
    if (!id) return;
    const { error } = await supabaseClient.storage.from('fotos').remove([id]);
    if (error) console.error('Photos.delete', error);
  },
};
