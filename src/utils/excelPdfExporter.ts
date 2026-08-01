import * as XLSX from 'xlsx-js-style';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';

export interface PdfExportProgress {
    current: number;
    total: number;
    teacher: string;
}

export interface TeacherPdfArchive {
    blob: Blob;
    fileName: string;
    pdfCount: number;
}

type StyledCell = XLSX.CellObject & {
    s?: {
        fgColor?: { rgb?: string };
        patternType?: string;
    };
};

const REPORT_WIDTH_PX = 1120;
const TABLE_COLUMN_WIDTHS = [92, 92, 78, 42, 42, 106, 106, 44, 54, 54, 60, 60, 60, 116, 50];

const getCell = (sheet: XLSX.WorkSheet, row: number, column: number): StyledCell | undefined => {
    const reference = XLSX.utils.encode_cell({ r: row, c: column });
    return sheet[reference] as StyledCell | undefined;
};

const getCellText = (sheet: XLSX.WorkSheet, row: number, column: number): string => {
    const cell = getCell(sheet, row, column);
    if (!cell) return '';
    if (cell.w !== undefined) return String(cell.w);
    if (cell.v === undefined || cell.v === null) return '';
    return String(cell.v);
};

const getFillColor = (cell: StyledCell | undefined): string | undefined => {
    const rgb = cell?.s?.fgColor?.rgb;
    if (!rgb) return undefined;
    const normalized = rgb.length === 8 ? rgb.slice(2) : rgb;
    return `#${normalized}`;
};

const styleElement = (element: HTMLElement, styles: Partial<CSSStyleDeclaration>) => {
    Object.assign(element.style, styles);
    return element;
};

const createText = (tag: keyof HTMLElementTagNameMap, text: string) => {
    const element = document.createElement(tag);
    element.textContent = text;
    return element;
};

const buildMiniTable = (sheet: XLSX.WorkSheet) => {
    const table = styleElement(document.createElement('table'), {
        borderCollapse: 'collapse',
        tableLayout: 'fixed',
        width: '540px',
        fontSize: '11px'
    });
    const headerRow = document.createElement('tr');
    const valueRow = document.createElement('tr');

    for (let column = 7; column <= 12; column += 1) {
        const header = styleElement(document.createElement('th'), {
            backgroundColor: '#1b2c40',
            color: '#ffffff',
            border: '1px solid #000000',
            padding: '4px 3px',
            textAlign: 'center',
            whiteSpace: 'pre-line',
            fontWeight: '700'
        });
        header.textContent = getCellText(sheet, 2, column);
        headerRow.appendChild(header);

        const value = styleElement(document.createElement('td'), {
            border: '1px solid #000000',
            padding: '3px',
            textAlign: 'center',
            fontWeight: '700',
            backgroundColor: '#ffffff'
        });
        value.textContent = getCellText(sheet, 3, column);
        valueRow.appendChild(value);
    }

    table.append(headerRow, valueRow);
    return table;
};

const buildDetailTable = (sheet: XLSX.WorkSheet, lastRow: number, lastColumn: number) => {
    const table = styleElement(document.createElement('table'), {
        width: '100%',
        borderCollapse: 'collapse',
        tableLayout: 'fixed',
        fontSize: '10px',
        lineHeight: '1.05',
        color: '#111111'
    });

    const columnGroup = document.createElement('colgroup');
    for (let column = 0; column <= lastColumn; column += 1) {
        const col = document.createElement('col');
        col.style.width = `${TABLE_COLUMN_WIDTHS[column] ?? 60}px`;
        columnGroup.appendChild(col);
    }
    table.appendChild(columnGroup);

    for (let row = 9; row <= lastRow; row += 1) {
        const isHeader = row === 9;
        const values = Array.from({ length: lastColumn + 1 }, (_, column) => getCellText(sheet, row, column));
        const isBlankRow = !isHeader && values.every(value => value === '');
        const tr = document.createElement('tr');
        tr.style.height = isBlankRow ? '8px' : (isHeader ? '34px' : '18px');

        for (let column = 0; column <= lastColumn; column += 1) {
            const cell = document.createElement(isHeader ? 'th' : 'td');
            cell.textContent = values[column];
            styleElement(cell, {
                overflow: 'hidden',
                whiteSpace: isHeader ? 'pre-line' : 'nowrap',
                textOverflow: 'clip',
                verticalAlign: 'middle',
                padding: isBlankRow ? '0' : '2px 3px',
                borderLeft: '1px solid #000000',
                borderRight: '1px solid #000000',
                borderTop: isHeader ? '1px solid #000000' : '1px dotted #777777',
                borderBottom: row === lastRow ? '1px solid #000000' : '1px dotted #777777',
                textAlign: isHeader || (column >= 3 && column <= 4) ? 'center' : (column >= 7 && column <= 12) || column === 14 ? 'right' : 'left',
                fontWeight: isHeader ? '700' : '400',
                color: isHeader ? '#ffffff' : '#111111',
                backgroundColor: isHeader ? '#1b2c40' : (getFillColor(getCell(sheet, row, column)) ?? '#ffffff')
            });
            tr.appendChild(cell);
        }
        table.appendChild(tr);
    }

    return table;
};

const buildSheetReport = (sheet: XLSX.WorkSheet) => {
    const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1:O1');
    const report = styleElement(document.createElement('div'), {
        position: 'fixed',
        left: '-100000px',
        top: '0',
        width: `${REPORT_WIDTH_PX}px`,
        padding: '28px 32px 32px',
        boxSizing: 'border-box',
        backgroundColor: '#ffffff',
        color: '#111111',
        fontFamily: '"Yu Gothic", "YuGothic", "Meiryo", sans-serif'
    });

    const top = styleElement(document.createElement('div'), {
        position: 'relative',
        height: '180px'
    });
    const teacherName = styleElement(createText('div', getCellText(sheet, 0, 0)), {
        fontSize: '14px',
        fontWeight: '700',
        marginBottom: '3px'
    });
    const title = styleElement(createText('div', getCellText(sheet, 1, 0)), {
        fontSize: '20px',
        fontWeight: '700'
    });
    const miniTableContainer = styleElement(document.createElement('div'), {
        position: 'absolute',
        top: '34px',
        right: '0'
    });
    miniTableContainer.appendChild(buildMiniTable(sheet));

    const stats = styleElement(document.createElement('div'), {
        position: 'absolute',
        top: '76px',
        left: '0',
        display: 'grid',
        gridTemplateColumns: '170px 80px',
        rowGap: '2px',
        fontSize: '12px'
    });
    stats.append(
        createText('div', getCellText(sheet, 4, 0)),
        styleElement(createText('div', getCellText(sheet, 4, 2)), { textAlign: 'right' }),
        createText('div', getCellText(sheet, 5, 0)),
        styleElement(createText('div', getCellText(sheet, 5, 2)), { textAlign: 'right' })
    );
    const legend = styleElement(createText('div', getCellText(sheet, 7, 1)), {
        position: 'absolute',
        top: '137px',
        left: '92px',
        color: '#555555',
        fontSize: '10px'
    });

    top.append(teacherName, title, miniTableContainer, stats, legend);
    report.append(top, buildDetailTable(sheet, range.e.r, Math.min(range.e.c, 14)));
    document.body.appendChild(report);
    return report;
};

const createPdfFromReport = async (report: HTMLElement, title: string): Promise<ArrayBuffer> => {
    const canvas = await html2canvas(report, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
        useCORS: true,
        windowWidth: REPORT_WIDTH_PX,
        windowHeight: report.scrollHeight
    });

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    pdf.setProperties({ title, subject: '勤務時間集計', creator: '勤務集計ツール Re:Act' });
    const margin = 6;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imageWidth = pageWidth - margin * 2;
    const imageHeight = canvas.height * imageWidth / canvas.width;
    const usablePageHeight = pageHeight - margin * 2;
    const imageData = canvas.toDataURL('image/png');
    const pageCount = Math.max(1, Math.ceil(imageHeight / usablePageHeight));

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
        if (pageIndex > 0) pdf.addPage('a4', 'portrait');
        const y = margin - pageIndex * usablePageHeight;
        pdf.addImage(imageData, 'PNG', margin, y, imageWidth, imageHeight, undefined, 'FAST');
    }

    return pdf.output('arraybuffer');
};

const getTeacherLabel = (sheetName: string) => {
    const cleaned = sheetName.replace(/講師$/u, '').trim();
    const spacedSurname = cleaned.split(/[\s\u3000]+/u)[0];
    const surname = spacedSurname !== cleaned
        ? spacedSurname
        : Array.from(cleaned.replace(/[\s\u3000]+/gu, '')).slice(0, 2).join('');
    return `${surname || cleaned}講師`;
};

const getPeriodPrefix = (sheet: XLSX.WorkSheet) => {
    const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1:O1');
    for (let row = 10; row <= range.e.r; row += 1) {
        const value = getCellText(sheet, row, 5);
        const match = value.match(/(\d{4})[/-](\d{1,2})/u);
        if (match) return `${match[1]}${match[2].padStart(2, '0')}`;
    }
    const monthMatch = getCellText(sheet, 1, 0).match(/(\d{1,2})月/u);
    const month = monthMatch ? monthMatch[1].padStart(2, '0') : String(new Date().getMonth() + 1).padStart(2, '0');
    return `${new Date().getFullYear()}${month}`;
};

const sanitizeFileName = (value: string) => value.replace(/[\\/:*?"<>|]/g, '_');

export const createTeacherPdfArchive = async (
    file: File,
    onProgress?: (progress: PdfExportProgress) => void
): Promise<TeacherPdfArchive> => {
    const bytes = await file.arrayBuffer();
    const workbook = XLSX.read(bytes, {
        type: 'array',
        cellStyles: true,
        cellFormula: true,
        cellDates: false
    });
    const teacherSheetNames = workbook.SheetNames.filter(name => name !== '集計一覧');
    if (teacherSheetNames.length === 0) {
        throw new Error('講師別のシートが見つかりません。勤務集計ツールから出力したExcelを選択してください。');
    }

    const zip = new JSZip();
    let periodPrefix = '';

    for (let index = 0; index < teacherSheetNames.length; index += 1) {
        const sheetName = teacherSheetNames[index];
        const sheet = workbook.Sheets[sheetName];
        if (!sheet || !sheet['!ref']) continue;
        const teacherLabel = getTeacherLabel(sheetName);
        periodPrefix ||= getPeriodPrefix(sheet);
        onProgress?.({ current: index + 1, total: teacherSheetNames.length, teacher: teacherLabel });

        const report = buildSheetReport(sheet);
        try {
            const title = `${periodPrefix.slice(0, 4)}年${Number(periodPrefix.slice(4))}月勤務時間集計表_${teacherLabel}`;
            const pdfBytes = await createPdfFromReport(report, title);
            zip.file(`${periodPrefix}_${sanitizeFileName(teacherLabel)}.pdf`, pdfBytes);
        } finally {
            report.remove();
        }
    }

    const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
    });
    return {
        blob,
        fileName: `${periodPrefix || '勤務集計'}_講師別PDF.zip`,
        pdfCount: teacherSheetNames.length
    };
};

export const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};
