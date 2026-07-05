const ExcelJS = require('exceljs');
const { formatDate, formatTime } = require('./utils');

/**
 * Xarajatlar ro'yxatidan Excel faylini (Buffer ko'rinishida) generatsiya qiladi.
 * @param {Array} expenses - Prisma orqali olingan xarajatlar ob'ektlari
 * @param {string} titleText - Sarlavha matni (masalan: "Kunlik Xarajatlar Hisoboti")
 * @param {string} subtitleText - Qaysi davr uchunligi (masalan: "06.07.2026")
 * @returns {Promise<Buffer>}
 */
async function generateExcelReport(expenses, titleText, subtitleText) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Xarajatlar');

  // Page setup
  worksheet.views = [{ showGridLines: true }];

  // Sarlavha
  worksheet.mergeCells('A1:H1');
  const titleRow = worksheet.getRow(1);
  titleRow.getCell(1).value = titleText;
  titleRow.getCell(1).font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFF' } };
  titleRow.getCell(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '1F4E79' }, // Dark steel blue
  };
  titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
  titleRow.height = 40;

  // Subtitle
  worksheet.mergeCells('A2:H2');
  const subtitleRow = worksheet.getRow(2);
  subtitleRow.getCell(1).value = `Davr: ${subtitleText}`;
  subtitleRow.getCell(1).font = { name: 'Arial', size: 11, italic: true, color: { argb: '595959' } };
  subtitleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
  subtitleRow.height = 25;

  // Bo'sh joy
  worksheet.getRow(3).height = 10;

  // Headers
  const headers = [
    '№',
    'Mahsulot',
    'Miqdori',
    'Umumiy narxi (so\'m)',
    'Bir birlik narxi (so\'m)',
    'Kim qo\'shdi',
    'Sana va vaqt',
    'Izoh'
  ];

  const headerRow = worksheet.getRow(4);
  headerRow.values = headers;
  headerRow.height = 28;

  headerRow.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '2F5597' }, // Steel Blue
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'BFBFBF' } },
      left: { style: 'thin', color: { argb: 'BFBFBF' } },
      bottom: { style: 'medium', color: { argb: '000000' } },
      right: { style: 'thin', color: { argb: 'BFBFBF' } },
    };
  });

  let totalSum = 0;

  // Data rows
  expenses.forEach((e, idx) => {
    const rowNumber = idx + 5;
    const row = worksheet.getRow(rowNumber);

    const dateStr = `${formatDate(e.createdAt)} ${formatTime(e.createdAt)}`;
    const unitPrice = e.quantity > 0 ? e.price / e.quantity : 0;
    totalSum += e.price;

    row.values = [
      idx + 1,
      e.product,
      e.quantity,
      e.price,
      unitPrice,
      e.addedBy,
      dateStr,
      e.note || '-'
    ];

    row.height = 22;

    // Alignments and borders
    row.eachCell((cell, colNumber) => {
      cell.font = { name: 'Arial', size: 10 };
      cell.border = {
        top: { style: 'thin', color: { argb: 'D9D9D9' } },
        left: { style: 'thin', color: { argb: 'D9D9D9' } },
        bottom: { style: 'thin', color: { argb: 'D9D9D9' } },
        right: { style: 'thin', color: { argb: 'D9D9D9' } },
      };

      if (colNumber === 1 || colNumber === 7) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (colNumber === 3 || colNumber === 4 || colNumber === 5) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }
    });

    // Formatting numbers
    row.getCell(3).numFmt = '#,##0.00';
    row.getCell(4).numFmt = '#,##0';
    row.getCell(5).numFmt = '#,##0.00';
  });

  // Total row
  const totalRowNumber = expenses.length + 5;
  const totalRow = worksheet.getRow(totalRowNumber);
  totalRow.height = 26;
  
  totalRow.getCell(1).value = 'JAMI:';
  worksheet.mergeCells(`A${totalRowNumber}:C${totalRowNumber}`);
  
  totalRow.getCell(4).value = totalSum;
  totalRow.getCell(4).numFmt = '#,##0';

  totalRow.eachCell((cell, colNumber) => {
    cell.font = { name: 'Arial', size: 11, bold: true };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'F2F2F2' },
    };
    cell.border = {
      top: { style: 'medium', color: { argb: '000000' } },
      bottom: { style: 'double', color: { argb: '000000' } },
    };

    if (colNumber === 1) {
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    } else if (colNumber === 4) {
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    }
  });

  // Adjust column widths automatically
  worksheet.columns.forEach((column, i) => {
    let maxLength = 0;
    column.eachCell({ includeEmpty: true }, (cell, rowNum) => {
      // Skip merged header rows from determining width
      if (rowNum <= 3) return;
      const columnLength = cell.value ? cell.value.toString().length : 0;
      if (columnLength > maxLength) {
        maxLength = columnLength;
      }
    });
    // Add extra padding to the column width
    column.width = Math.max(maxLength + 4, 12);
  });

  // Specific adjustments
  worksheet.getColumn(1).width = 6;  // №
  worksheet.getColumn(7).width = 20; // Sana va vaqt
  worksheet.getColumn(8).width = 25; // Izoh

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

module.exports = { generateExcelReport };
