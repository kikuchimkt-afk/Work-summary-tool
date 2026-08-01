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
        font?: { color?: { rgb?: string } };
    };
};

const REPORT_WIDTH_PX = 1120;
const TABLE_COLUMN_WIDTHS = [92, 92, 78, 42, 42, 106, 106, 44, 54, 54, 60, 60, 60, 116, 50];
const REPORT_COLORS = {
    forest: '#173b33',
    forestSoft: '#2d5b4e',
    cream: '#f6f2e9',
    paper: '#fffefa',
    sage: '#dfe8df',
    gold: '#b89b61',
    ink: '#21342f',
    muted: '#6f7b76',
    line: '#d8ddd6',
    stripe: '#f3f4ef'
};

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

const getFontColor = (cell: StyledCell | undefined): string | undefined => {
    const rgb = cell?.s?.font?.color?.rgb;
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

const buildMetricGrid = (sheet: XLSX.WorkSheet) => {
    const grid = styleElement(document.createElement('div'), {
        display: 'grid',
        gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
        gap: '9px',
        marginTop: '27px'
    });

    for (let column = 7; column <= 12; column += 1) {
        const card = styleElement(document.createElement('div'), {
            minHeight: '74px',
            padding: '12px 12px 10px',
            border: `1px solid ${REPORT_COLORS.line}`,
            borderRadius: '10px',
            backgroundColor: column === 7 ? REPORT_COLORS.sage : REPORT_COLORS.paper
        });
        const label = styleElement(createText('div', getCellText(sheet, 2, column).replace(/\n/gu, ' ')), {
            color: REPORT_COLORS.muted,
            fontSize: '9px',
            fontWeight: '700',
            letterSpacing: '0.04em',
            whiteSpace: 'nowrap'
        });
        const value = styleElement(createText('div', getCellText(sheet, 3, column) || '-'), {
            marginTop: '8px',
            color: REPORT_COLORS.forest,
            fontFamily: 'Georgia, "Yu Mincho", serif',
            fontSize: '21px',
            fontWeight: '700',
            lineHeight: '1'
        });
        card.append(label, value);
        grid.appendChild(card);
    }

    return grid;
};

const buildDetailTable = (sheet: XLSX.WorkSheet, lastRow: number, lastColumn: number) => {
    const table = styleElement(document.createElement('table'), {
        width: '100%',
        borderCollapse: 'separate',
        borderSpacing: '0',
        tableLayout: 'fixed',
        overflow: 'hidden',
        border: `1px solid ${REPORT_COLORS.line}`,
        borderRadius: '10px',
        fontSize: '9.5px',
        lineHeight: '1.2',
        color: REPORT_COLORS.ink,
        backgroundColor: REPORT_COLORS.paper
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
        tr.style.height = isBlankRow ? '9px' : (isHeader ? '38px' : '21px');

        for (let column = 0; column <= lastColumn; column += 1) {
            const cell = document.createElement(isHeader ? 'th' : 'td');
            cell.textContent = values[column];
            const originalFill = getFillColor(getCell(sheet, row, column));
            const rowFill = row % 2 === 0 ? REPORT_COLORS.paper : REPORT_COLORS.stripe;
            const backgroundColor = originalFill && originalFill.toLowerCase() !== '#ffffff'
                ? originalFill
                : rowFill;
            styleElement(cell, {
                overflow: 'hidden',
                whiteSpace: isHeader ? 'pre-line' : 'nowrap',
                textOverflow: 'clip',
                verticalAlign: 'middle',
                padding: isBlankRow ? '0' : '3px 4px',
                borderLeft: '0',
                borderRight: isHeader && column < lastColumn ? '1px solid rgba(255,255,255,0.12)' : '0',
                borderTop: '0',
                borderBottom: row === lastRow ? '0' : `1px solid ${REPORT_COLORS.line}`,
                textAlign: isHeader || (column >= 3 && column <= 4) ? 'center' : (column >= 7 && column <= 12) || column === 14 ? 'right' : 'left',
                fontWeight: isHeader ? '700' : '400',
                letterSpacing: isHeader ? '0.02em' : '0',
                color: isHeader ? '#fffdf8' : (getFontColor(getCell(sheet, row, column)) ?? REPORT_COLORS.ink),
                backgroundColor: isHeader ? REPORT_COLORS.forest : backgroundColor
            });
            tr.appendChild(cell);
        }
        table.appendChild(tr);
    }

    return table;
};

const buildSheetReport = (sheet: XLSX.WorkSheet, teacherLabel: string, periodPrefix: string) => {
    const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1:O1');
    const report = styleElement(document.createElement('div'), {
        position: 'fixed',
        left: '-100000px',
        top: '0',
        width: `${REPORT_WIDTH_PX}px`,
        padding: '32px 38px 38px',
        boxSizing: 'border-box',
        backgroundColor: REPORT_COLORS.cream,
        color: REPORT_COLORS.ink,
        fontFamily: '"Yu Gothic", "YuGothic", "Meiryo", sans-serif'
    });

    const accent = styleElement(document.createElement('div'), {
        height: '6px',
        margin: '-32px -38px 28px',
        background: `linear-gradient(90deg, ${REPORT_COLORS.forest} 0 72%, ${REPORT_COLORS.gold} 72% 100%)`
    });

    const brandRow = styleElement(document.createElement('div'), {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
    });
    const brand = styleElement(document.createElement('div'), {
        display: 'flex',
        alignItems: 'baseline',
        gap: '11px'
    });
    brand.append(
        styleElement(createText('span', 'Re:Act'), {
            color: REPORT_COLORS.forest,
            fontFamily: 'Georgia, serif',
            fontSize: '16px',
            fontStyle: 'italic',
            fontWeight: '700'
        }),
        styleElement(createText('span', 'WORK SUMMARY'), {
            color: REPORT_COLORS.gold,
            fontFamily: 'Georgia, serif',
            fontSize: '8px',
            fontWeight: '700',
            letterSpacing: '0.22em'
        })
    );
    const periodLabel = periodPrefix.length >= 6
        ? `${periodPrefix.slice(0, 4)}年 ${Number(periodPrefix.slice(4))}月`
        : getCellText(sheet, 1, 0);
    const period = styleElement(createText('span', periodLabel), {
        padding: '7px 12px',
        border: `1px solid ${REPORT_COLORS.line}`,
        borderRadius: '999px',
        color: REPORT_COLORS.forest,
        backgroundColor: REPORT_COLORS.paper,
        fontSize: '10px',
        fontWeight: '700',
        letterSpacing: '0.04em'
    });
    brandRow.append(brand, period);

    const identityRow = styleElement(document.createElement('div'), {
        marginTop: '28px',
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        alignItems: 'end',
        gap: '28px'
    });
    const teacherBlock = document.createElement('div');
    teacherBlock.append(
        styleElement(createText('div', 'TEACHER'), {
            marginBottom: '6px',
            color: REPORT_COLORS.gold,
            fontFamily: 'Georgia, serif',
            fontSize: '8px',
            fontWeight: '700',
            letterSpacing: '0.2em'
        }),
        styleElement(createText('div', teacherLabel), {
            color: REPORT_COLORS.forest,
            fontFamily: '"Yu Mincho", "Hiragino Mincho ProN", serif',
            fontSize: '32px',
            fontWeight: '600',
            letterSpacing: '0.07em',
            lineHeight: '1.15'
        }),
        styleElement(createText('div', '勤務時間集計表'), {
            marginTop: '7px',
            color: REPORT_COLORS.muted,
            fontSize: '11px',
            fontWeight: '700',
            letterSpacing: '0.12em'
        })
    );

    const stats = styleElement(document.createElement('div'), {
        display: 'flex',
        gap: '10px'
    });
    [
        { label: getCellText(sheet, 4, 0) || '月間勤務日数', value: getCellText(sheet, 4, 2) || '-' },
        { label: getCellText(sheet, 5, 0) || '個別授業回数', value: getCellText(sheet, 5, 2) || '-' }
    ].forEach(item => {
        const card = styleElement(document.createElement('div'), {
            minWidth: '126px',
            padding: '11px 14px',
            borderLeft: `3px solid ${REPORT_COLORS.gold}`,
            backgroundColor: REPORT_COLORS.paper
        });
        card.append(
            styleElement(createText('div', item.label), {
                color: REPORT_COLORS.muted,
                fontSize: '8px',
                fontWeight: '700'
            }),
            styleElement(createText('div', item.value), {
                marginTop: '4px',
                color: REPORT_COLORS.forest,
                fontFamily: 'Georgia, "Yu Mincho", serif',
                fontSize: '16px',
                fontWeight: '700',
                textAlign: 'right'
            })
        );
        stats.appendChild(card);
    });
    identityRow.append(teacherBlock, stats);

    const detailHeading = styleElement(document.createElement('div'), {
        margin: '28px 0 10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
    });
    const detailTitle = document.createElement('div');
    detailTitle.append(
        styleElement(createText('span', '勤務明細'), {
            color: REPORT_COLORS.ink,
            fontSize: '13px',
            fontWeight: '800',
            letterSpacing: '0.08em'
        }),
        styleElement(createText('span', '  /  WORK DETAILS'), {
            color: REPORT_COLORS.gold,
            fontFamily: 'Georgia, serif',
            fontSize: '7px',
            fontWeight: '700',
            letterSpacing: '0.16em'
        })
    );
    const legend = styleElement(document.createElement('div'), {
        display: 'flex',
        alignItems: 'center',
        gap: '11px',
        color: REPORT_COLORS.muted,
        fontSize: '8px'
    });
    [
        { label: '欠席', color: '#f3c7a9' },
        { label: '振替', color: '#4d8b68' },
        { label: '講習会', color: '#527cb1' },
        { label: '推定時間', color: '#b8534d' }
    ].forEach(item => {
        const key = styleElement(document.createElement('span'), {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px'
        });
        key.append(
            styleElement(document.createElement('i'), {
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: item.color
            }),
            createText('span', item.label)
        );
        legend.appendChild(key);
    });
    detailHeading.append(detailTitle, legend);

    report.append(
        accent,
        brandRow,
        identityRow,
        buildMetricGrid(sheet),
        detailHeading,
        buildDetailTable(sheet, range.e.r, Math.min(range.e.c, 14))
    );
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
    const margin = 8;
    const footerHeight = 7;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imageWidth = pageWidth - margin * 2;
    const imageHeight = canvas.height * imageWidth / canvas.width;
    const usablePageHeight = pageHeight - margin * 2 - footerHeight;
    const imageData = canvas.toDataURL('image/png');
    const pageCount = Math.max(1, Math.ceil(imageHeight / usablePageHeight));

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
        if (pageIndex > 0) pdf.addPage('a4', 'portrait');
        pdf.setFillColor(246, 242, 233);
        pdf.rect(0, 0, pageWidth, pageHeight, 'F');
        const y = margin - pageIndex * usablePageHeight;
        pdf.addImage(imageData, 'PNG', margin, y, imageWidth, imageHeight, undefined, 'FAST');
        pdf.setDrawColor(184, 155, 97);
        pdf.setLineWidth(0.25);
        pdf.line(margin, pageHeight - 6.5, pageWidth - margin, pageHeight - 6.5);
        pdf.setTextColor(36, 82, 71);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6.5);
        pdf.text('RE:ACT / WORK SUMMARY', margin, pageHeight - 3.5);
        pdf.text(`${pageIndex + 1} / ${pageCount}`, pageWidth - margin, pageHeight - 3.5, { align: 'right' });
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

        const report = buildSheetReport(sheet, teacherLabel, periodPrefix);
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
