// pdf-writer.js — genera PDFs simples (texto, líneas y rectángulos) a mano, sin librerías
// externas. Usa las fuentes estándar Helvetica / Helvetica-Bold (todos los lectores de PDF
// las traen, así que no hay que incrustar nada) con codificación WinAnsi (tildes y ñ).
// Las coordenadas que recibe son en puntos, con el origen ARRIBA a la izquierda.

// Anchos (en milésimas de em) de los caracteres ASCII 32..126.
const PDF_ANCHOS_NORMAL = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  278, 278, 584, 584, 584, 556, 1015,
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
  278, 278, 278, 469, 556, 333,
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500,
  334, 260, 334, 584,
];
const PDF_ANCHOS_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  333, 333, 584, 584, 584, 611, 975,
  722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
  333, 278, 333, 584, 556, 333,
  556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500,
  389, 280, 389, 584,
];

// Caracteres fuera de Latin-1 que sí existen en WinAnsi (cp1252).
const PDF_CP1252 = {
  0x20AC: 0x80, 0x2026: 0x85, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94,
  0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
};

function pdfCodificar(str) {
  let out = '';
  for (const ch of String(str).normalize('NFC')) {
    const c = ch.codePointAt(0);
    let b;
    if (c >= 32 && c < 127) b = c;
    else if (c >= 0xA0 && c <= 0xFF) b = c;
    else if (PDF_CP1252[c] != null) b = PDF_CP1252[c];
    else b = 63; // '?'
    const letra = String.fromCharCode(b);
    out += (letra === '\\' || letra === '(' || letra === ')') ? '\\' + letra : letra;
  }
  return out;
}

function pdfNum(n) { return Number(n).toFixed(2); }

class PdfDoc {
  constructor() {
    this.ancho = 595.28; // A4 vertical
    this.alto = 841.89;
    this.paginas = [];
    this.nuevaPagina();
  }

  nuevaPagina() { this.paginas.push([]); }
  _op(s) {
    const i = this._destino != null ? this._destino : this.paginas.length - 1;
    this.paginas[i].push(s);
  }

  anchoTexto(str, size, bold) {
    const tabla = bold ? PDF_ANCHOS_BOLD : PDF_ANCHOS_NORMAL;
    let w = 0;
    for (const ch of String(str).normalize('NFC')) {
      const c = ch.codePointAt(0);
      if (c >= 32 && c < 127) { w += tabla[c - 32]; continue; }
      const base = ch.normalize('NFD')[0].codePointAt(0); // á -> a, ñ -> n (mismo ancho)
      w += (base >= 32 && base < 127) ? tabla[base - 32] : 556;
    }
    return (w * size) / 1000;
  }

  // Recorta con "..." para que el texto quepa en maxW.
  ajustar(str, maxW, size, bold) {
    str = String(str);
    if (this.anchoTexto(str, size, bold) <= maxW) return str;
    while (str.length > 1 && this.anchoTexto(str + '...', size, bold) > maxW) str = str.slice(0, -1);
    return str + '...';
  }

  // (x, y) es la línea base del texto. align: 'left' | 'right' | 'center' respecto de x.
  texto(x, y, str, { size = 10, bold = false, color = [0, 0, 0], align = 'left' } = {}) {
    const w = this.anchoTexto(str, size, bold);
    if (align === 'right') x -= w;
    else if (align === 'center') x -= w / 2;
    this._op(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${color.map(pdfNum).join(' ')} rg ${pdfNum(x)} ${pdfNum(this.alto - y)} Td (${pdfCodificar(str)}) Tj ET`);
  }

  linea(x1, y1, x2, y2, { ancho = 0.5, color = [0.75, 0.75, 0.75] } = {}) {
    this._op(`${pdfNum(ancho)} w ${color.map(pdfNum).join(' ')} RG ${pdfNum(x1)} ${pdfNum(this.alto - y1)} m ${pdfNum(x2)} ${pdfNum(this.alto - y2)} l S`);
  }

  rect(x, y, w, h, { relleno = [0.93, 0.93, 0.95] } = {}) {
    this._op(`${relleno.map(pdfNum).join(' ')} rg ${pdfNum(x)} ${pdfNum(this.alto - y - h)} ${pdfNum(w)} ${pdfNum(h)} re f`);
  }

  // pie: texto que se repite a la izquierda del pie de cada página (junto a "Página X de N").
  generar(pie = '') {
    const total = this.paginas.length;
    for (let i = 0; i < total; i++) {
      this._destino = i;
      if (pie) this.texto(40, this.alto - 24, pie, { size: 8, color: [0.5, 0.5, 0.5] });
      this.texto(this.ancho - 40, this.alto - 24, `Página ${i + 1} de ${total}`, { size: 8, color: [0.5, 0.5, 0.5], align: 'right' });
    }
    this._destino = null;

    const objs = [];
    objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    const kids = this.paginas.map((_, i) => `${5 + i * 2} 0 R`).join(' ');
    objs[2] = `<< /Type /Pages /Kids [${kids}] /Count ${total} >>`;
    objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    this.paginas.forEach((ops, i) => {
      const contenido = ops.join('\n');
      objs[5 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfNum(this.ancho)} ${pdfNum(this.alto)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`;
      objs[6 + i * 2] = `<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`;
    });

    // Todos los caracteres del archivo son < 256, así que 1 carácter = 1 byte.
    let cuerpo = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const offsets = [];
    for (let n = 1; n < objs.length; n++) {
      offsets[n] = cuerpo.length;
      cuerpo += `${n} 0 obj\n${objs[n]}\nendobj\n`;
    }
    const xref = cuerpo.length;
    cuerpo += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
    for (let n = 1; n < objs.length; n++) cuerpo += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
    cuerpo += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

    const bytes = new Uint8Array(cuerpo.length);
    for (let i = 0; i < cuerpo.length; i++) bytes[i] = cuerpo.charCodeAt(i) & 0xFF;
    return new Blob([bytes], { type: 'application/pdf' });
  }
}

const PdfWriter = {
  // En celular/tablet abre la hoja de compartir (guardar en Archivos, WhatsApp, imprimir...);
  // en computador descarga el archivo.
  async entregar(blob, nombreArchivo) {
    const archivo = new File([blob], nombreArchivo, { type: 'application/pdf' });
    const tactil = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (tactil && navigator.canShare && navigator.canShare({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], title: nombreArchivo });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return; // el usuario cerró la hoja de compartir
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  },
};
