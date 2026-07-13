// xlsx-writer.js — genera archivos .xlsx (Excel Open XML) reales, desde cero, sin
// ninguna librería externa ni conexión a internet. Usa compresión "stored" (sin
// comprimir) dentro del ZIP, que es perfectamente válida según el formato y evita
// tener que implementar DEFLATE.

function xlsxEscapeXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function xlsxColLetra(n) {
  let s = '';
  n += 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function xlsxCrc32(bytes) {
  let crc = ~0;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function xlsxU16(n) { return [n & 0xFF, (n >>> 8) & 0xFF]; }
function xlsxU32(n) { return [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]; }

// Empaqueta una lista de {nombre, contenido} (texto) como un .zip válido (método
// "stored"), que es exactamente lo que es un .xlsx por dentro.
function xlsxCrearZip(archivos) {
  const encoder = new TextEncoder();
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  archivos.forEach(({ nombre, contenido }) => {
    const nombreBytes = encoder.encode(nombre);
    const dataBytes = encoder.encode(contenido);
    const crc = xlsxCrc32(dataBytes);

    const localHeader = [
      ...xlsxU32(0x04034b50), ...xlsxU16(20), ...xlsxU16(0), ...xlsxU16(0), ...xlsxU16(0), ...xlsxU16(0x21),
      ...xlsxU32(crc), ...xlsxU32(dataBytes.length), ...xlsxU32(dataBytes.length),
      ...xlsxU16(nombreBytes.length), ...xlsxU16(0),
    ];
    const localEntry = new Uint8Array(localHeader.length + nombreBytes.length + dataBytes.length);
    localEntry.set(localHeader, 0);
    localEntry.set(nombreBytes, localHeader.length);
    localEntry.set(dataBytes, localHeader.length + nombreBytes.length);
    localChunks.push(localEntry);

    const centralHeader = [
      ...xlsxU32(0x02014b50), ...xlsxU16(20), ...xlsxU16(20), ...xlsxU16(0), ...xlsxU16(0), ...xlsxU16(0), ...xlsxU16(0x21),
      ...xlsxU32(crc), ...xlsxU32(dataBytes.length), ...xlsxU32(dataBytes.length),
      ...xlsxU16(nombreBytes.length), ...xlsxU16(0), ...xlsxU16(0), ...xlsxU16(0), ...xlsxU16(0), ...xlsxU32(0),
      ...xlsxU32(offset),
    ];
    const centralEntry = new Uint8Array(centralHeader.length + nombreBytes.length);
    centralEntry.set(centralHeader, 0);
    centralEntry.set(nombreBytes, centralHeader.length);
    centralChunks.push(centralEntry);

    offset += localEntry.length;
  });

  const centralStart = offset;
  const centralSize = centralChunks.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array([
    ...xlsxU32(0x06054b50), ...xlsxU16(0), ...xlsxU16(0),
    ...xlsxU16(archivos.length), ...xlsxU16(archivos.length),
    ...xlsxU32(centralSize), ...xlsxU32(centralStart), ...xlsxU16(0),
  ]);

  return new Blob([...localChunks, ...centralChunks, eocd], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function xlsxCeldaXml(valor, colIdx, rowIdx, esHeader) {
  const ref = xlsxColLetra(colIdx) + rowIdx;
  const styleAttr = esHeader ? ' s="1"' : '';
  if (typeof valor === 'number' && isFinite(valor)) {
    return `<c r="${ref}"${styleAttr}><v>${valor}</v></c>`;
  }
  const texto = xlsxEscapeXml(valor);
  return `<c r="${ref}" t="inlineStr"${styleAttr}><is><t xml:space="preserve">${texto}</t></is></c>`;
}

function xlsxFilaXml(valores, rowIdx, esHeader) {
  return `<row r="${rowIdx}">${valores.map((v, i) => xlsxCeldaXml(v, i, rowIdx, esHeader)).join('')}</row>`;
}

function xlsxHojaXml(encabezados, filas) {
  const filaHeader = xlsxFilaXml(encabezados, 1, true);
  const filasDatos = filas.map((f, i) => xlsxFilaXml(f, i + 2, false)).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${filaHeader}${filasDatos}</sheetData></worksheet>`;
}

function xlsxContentTypes(n) {
  let overrides = '';
  for (let i = 1; i <= n; i++) {
    overrides += `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${overrides}</Types>`;
}

function xlsxRelsRaiz() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
}

function xlsxWorkbook(hojas) {
  const sheetsXml = hojas.map((h, i) => `<sheet name="${xlsxEscapeXml(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetsXml}</sheets></workbook>`;
}

function xlsxWorkbookRels(n) {
  let rels = '';
  for (let i = 1; i <= n; i++) {
    rels += `<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`;
  }
  rels += `<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`;
}

function xlsxStyles() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0A84FF"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>
</styleSheet>`;
}

const XlsxWriter = {
  // hojas: [{ nombre, encabezados: [..], filas: [[..], [..]] }]
  generarBlob(hojas) {
    const archivos = [
      { nombre: '[Content_Types].xml', contenido: xlsxContentTypes(hojas.length) },
      { nombre: '_rels/.rels', contenido: xlsxRelsRaiz() },
      { nombre: 'xl/workbook.xml', contenido: xlsxWorkbook(hojas) },
      { nombre: 'xl/_rels/workbook.xml.rels', contenido: xlsxWorkbookRels(hojas.length) },
      { nombre: 'xl/styles.xml', contenido: xlsxStyles() },
    ];
    hojas.forEach((h, i) => {
      archivos.push({ nombre: `xl/worksheets/sheet${i + 1}.xml`, contenido: xlsxHojaXml(h.encabezados, h.filas) });
    });
    return xlsxCrearZip(archivos);
  },
  descargar(hojas, nombreArchivo) {
    const blob = this.generarBlob(hojas);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    a.click();
    URL.revokeObjectURL(url);
  },
};
