const path = require('path');
const ExcelJS = require('exceljs');

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_ROWS = 50;

function makeError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function validateZip(buffer) {
  const minimum = Math.max(0, buffer.length - 65557);
  let endOffset = -1;
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw makeError('invalid_import');
  const entries = buffer.readUInt16LE(endOffset + 10);
  const directorySize = buffer.readUInt32LE(endOffset + 12);
  let offset = buffer.readUInt32LE(endOffset + 16);
  const directoryEnd = offset + directorySize;
  let totalUncompressed = 0;
  if (!entries || entries > 2000 || directoryEnd > endOffset) throw makeError('invalid_import');
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > directoryEnd || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw makeError('invalid_import');
    }
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > 10 * 1024 * 1024 ||
        (uncompressedSize > 1024 * 1024 && uncompressedSize / Math.max(compressedSize, 1) > 100)) {
      throw makeError('import_document_too_large');
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (offset !== directoryEnd) throw makeError('invalid_import');
}

function decodeFile(filename, encoded) {
  if (typeof filename !== 'string' || typeof encoded !== 'string' ||
      encoded.length > Math.ceil(MAX_FILE_BYTES * 4 / 3) + 8 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw makeError('invalid_import');
  }
  const buffer = Buffer.from(encoded, 'base64');
  if (!buffer.length || buffer.length > MAX_FILE_BYTES || buffer.toString('base64') !== encoded) {
    throw makeError('invalid_import');
  }
  const extension = path.extname(filename).toLowerCase();
  if (extension === '.csv') {
    if (buffer.includes(0)) throw makeError('invalid_import');
    return { type: 'rows', rows: parseCsv(buffer.toString('utf8').replace(/^\uFEFF/, '')) };
  }
  if (extension === '.xlsx') {
    if (buffer.subarray(0, 4).toString('hex') !== '504b0304') throw makeError('invalid_import');
    validateZip(buffer);
    return { type: 'xlsx', buffer };
  }
  if (extension === '.pdf') {
    if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw makeError('invalid_import');
    return { type: 'pdf', buffer };
  }
  if (extension === '.docx') {
    if (buffer.subarray(0, 4).toString('hex') !== '504b0304') throw makeError('invalid_import');
    validateZip(buffer);
    return { type: 'docx', buffer };
  }
  throw makeError('unsupported_import_format');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field === '') {
      quoted = true;
    } else if (character === ',') {
      row.push(field.trim());
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = '';
      if (rows.length > MAX_ROWS + 1) throw makeError('too_many_import_rows');
    } else {
      field += character;
    }
  }
  if (quoted) throw makeError('invalid_import');
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2 || rows.length > MAX_ROWS + 1) throw makeError('invalid_import');
  return rows;
}

async function extractRows(file) {
  if (file.type === 'rows') return file.rows;
  if (file.type === 'xlsx') {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount < 2 || sheet.rowCount > MAX_ROWS + 1 || sheet.columnCount > 30) {
      throw makeError('invalid_import');
    }
    const rows = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      rows.push(row.values.slice(1).map((value) => {
        if (value && typeof value === 'object' && 'text' in value) return String(value.text);
        return value == null ? '' : String(value);
      }));
    });
    return rows;
  }
  if (file.type === 'docx') {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return { documentText: result.value.slice(0, 30000) };
  }
  if (file.type === 'pdf') {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const document = await pdfjs.getDocument({
      data: new Uint8Array(file.buffer),
      useSystemFonts: false,
      stopAtErrors: true
    }).promise;
    if (document.numPages > 20) throw makeError('import_document_too_long');
    const pages = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => item.str).join(' '));
      if (pages.join('\n').length > 30000) throw makeError('import_document_too_long');
    }
    return { documentText: pages.join('\n') };
  }
  throw makeError('unsupported_import_format');
}

function normalizeRows(rows) {
  if (!Array.isArray(rows) || rows.length < 2 || rows.length > MAX_ROWS + 1) {
    throw makeError('invalid_import');
  }
  const headers = rows[0].map((value) => String(value || '').trim().toLowerCase());
  const findColumn = (names) => headers.findIndex((header) => names.includes(header));
  const nameColumn = findColumn(['name', 'product', 'title', 'اسم', 'المنتج', 'اسم المنتج']);
  const priceColumn = findColumn(['price', 'price_egp', 'price egp', 'السعر', 'السعر بالجنيه']);
  const descriptionColumn = findColumn(['description', 'details', 'الوصف', 'التفاصيل']);
  if (nameColumn < 0 || priceColumn < 0) throw makeError('invalid_import_headers');
  return rows.slice(1).filter((row) => row.some((value) => String(value || '').trim())).map((row) => {
    const name = String(row[nameColumn] || '').trim();
    const description = descriptionColumn < 0 ? '' : String(row[descriptionColumn] || '').trim();
    const parsedPrice = Number(String(row[priceColumn] || '').trim().replace(/,/g, ''));
    const valid = name.length > 0 && name.length <= 160 && description.length <= 2000 &&
      Number.isFinite(parsedPrice) && parsedPrice > 0 && parsedPrice <= 100000000;
    return {
      name,
      description,
      priceMinor: valid ? Math.round(parsedPrice * 100) : null,
      errors: valid ? [] : ['تحقق من الاسم والسعر والوصف']
    };
  });
}

module.exports = { decodeFile, extractRows, normalizeRows, MAX_ROWS };
