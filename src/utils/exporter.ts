import XLSX from 'xlsx-js-style';
import type { GeneratedData, TeacherStats, ThemeType } from '../types';

export const OUTPUT_HEADER = [
    '生徒氏名', 'フリガナ', '講師名', '学年', '年度',
    '授業開始時間', '授業終了時間',
    '１：２', '１：２(特能)', '１：１(特能）', '集団指導', '事務作業', '英会話',
    '教科', '週間日数'
];

// Style Logic
const getStyleSet = (theme: ThemeType) => {
    const base = { font: { name: 'Meiryo UI', sz: 11 }, alignment: { vertical: 'center' } };
    const headerBase = { font: { name: 'Meiryo UI', bold: true, sz: 11, color: { rgb: "FFFFFF" } }, alignment: { horizontal: 'center', vertical: 'center' } };

    // Common Border Logic is handled in loop, here we define Fills/Fonts
    if (theme === 'minimal') {
        return {
            header: { ...headerBase, font: { ...headerBase.font, color: { rgb: "000000" } } },
            body: base,
        };
    } else if (theme === 'standard') {
        return {
            header: { ...headerBase, fill: { fgColor: { rgb: "1b5e20" } } },
            body: base,
        };
    } else { // Modern
        return {
            header: { ...headerBase, fill: { fgColor: { rgb: "2c3e50" } } },
            body: base,
        };
    }
}

const applySheetStyles = (ws: any, dataArray: any[], styles: any, isSummary: boolean) => {
    const ref = ws['!ref'];
    if (!ref) return;
    const range = XLSX.utils.decode_range(ref);
    ws['!pageSetup'] = { paperSize: 9, orientation: 'landscape', fitToWidth: 1 };
    ws['!margins'] = { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 };

    const startR = range.s.r;
    const endR = range.e.r;
    const startC = range.s.c;
    const endC = isSummary ? range.e.c : 14; // Limit to main table for individual sheets

    for (let r = startR; r <= endR; r++) {
        let rowObj: GeneratedData | null = null;
        if (!isSummary && r > 0) {
            const dIdx = r - 1;
            if (dIdx < dataArray.length) rowObj = dataArray[dIdx];
        }

        for (let c = startC; c <= endC; c++) {
            const cellRef = XLSX.utils.encode_cell({ c, r });
            // Even if cell doesn't exist (empty), we might want to style it if it's inside the table block?
            // Usually xlsx-js-style needs the cell to exist.
            if (!ws[cellRef]) continue;

            let style = (r === 0) ? { ...styles.header } : { ...styles.body };

            // Border Logic: Thick Outer, Dotted Inner
            const border: any = {};
            const black = { rgb: "000000" };

            border.top = { style: r === startR ? 'thick' : 'dotted', color: black };
            border.bottom = { style: r === endR ? 'thick' : 'dotted', color: black };
            border.left = { style: c === startC ? 'thick' : 'dotted', color: black };
            border.right = { style: c === endC ? 'thick' : 'dotted', color: black };

            style.border = border;

            // Conditional Formatting
            if (rowObj) {
                if (rowObj._isError || rowObj._isManuallyFixed) {
                    style.fill = { fgColor: { rgb: "FFCCCC" } };
                    style.font = { ...style.font || {}, color: { rgb: "CC0000" } };
                } else if (rowObj._classType) {
                    if (rowObj._classType.includes('講習')) style.font = { ...style.font || {}, color: { rgb: "0000FF" }, bold: true };
                    else if (rowObj._classType.includes('振替')) style.font = { ...style.font || {}, color: { rgb: "008000" }, bold: true };
                }
            }

            ws[cellRef].s = style;
        }
    }

    // Formulas highlight
    if (!isSummary) {
        const cellRef = XLSX.utils.encode_cell({ c: 16, r: 2 });
        if (ws[cellRef]) ws[cellRef].s = { font: { bold: true }, fill: { fgColor: { rgb: "FFFF00" } } };
    }
}

function getColWidths(data: GeneratedData[]) {
    // Increased multipliers for safe verify
    const colWidths = OUTPUT_HEADER.map(h => (h.length * 2.5) + 4);
    data.forEach(r => {
        if (Object.keys(r).length === 0) return;
        OUTPUT_HEADER.forEach((h, i) => {
            // @ts-ignore
            const val = (r[h] == null || r[h] === undefined) ? '' : String(r[h]);
            let len = 0;
            for (let j = 0; j < val.length; j++) {
                const c = val.charCodeAt(j);
                if ((c >= 0x0 && c < 0x81) || (c === 0xf8f0) || (c >= 0xff61 && c < 0xffa0) || (c >= 0xf8f1 && c < 0xf8f4)) {
                    len += 1.3; // Half-width
                } else {
                    len += 2.5; // Full-width
                }
            }
            if (len > colWidths[i]) colWidths[i] = Math.min(len, 80);
        });
    });
    return colWidths.map(w => ({ wch: w }));
}


export const exportToExcel = (
    generatedData: GeneratedData[],
    teacherStats: Record<string, TeacherStats>,
    sortOrder: string[],
    theme: ThemeType = 'modern',
    fileName: string = '勤務集計.xlsx'
) => {
    if (generatedData.length === 0) return;

    // Sort teachers according to sortOrder
    const statsKeys = Object.keys(teacherStats);
    const sortedTeachers = statsKeys.sort((a, b) => {
        const getIdx = (name: string) => sortOrder.findIndex(order => name.includes(order.replace('講師', '')) || order === name);
        const idxA = getIdx(a);
        const idxB = getIdx(b);

        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.localeCompare(b, 'ja');
    });

    const wb = XLSX.utils.book_new();
    const styles = getStyleSet(theme);
    const escape = (n: string) => n.replace(/'/g, "''");

    // Summary Sheet
    const sumData: any[] = [['講師名', '１：２', '１：２(特能)', '１：１(特能）', '集団指導', '事務', '英会話', '勤務日数', '個別授業数']];
    sortedTeachers.forEach(n => sumData.push([
        n, { t: 'n', f: `'${escape(n)}'!Q4` }, { t: 'n', f: `'${escape(n)}'!R4` }, { t: 'n', f: `'${escape(n)}'!S4` },
        { t: 'n', f: `'${escape(n)}'!T4` }, { t: 'n', f: `'${escape(n)}'!U4` }, { t: 'n', f: `'${escape(n)}'!V4` },
        { t: 'n', f: `'${escape(n)}'!R6` }, { t: 'n', f: `'${escape(n)}'!R7` }
    ]));

    const wsSum = XLSX.utils.aoa_to_sheet(sumData);
    // @ts-ignore
    applySheetStyles(wsSum, sumData, styles, true); // sumData is array of arrays, but function expects GeneratedData for row checks.
    // Wait, the original function `applySheetStyles(wsSum, sumData, styles, true)` passed sumData (array of arrays).
    // My TS signature above says `dataArray: GeneratedData[]`. I should fix the signature to `any[]`.

    XLSX.utils.book_append_sheet(wb, wsSum, "全体集計");

    // Individual Sheets
    sortedTeachers.forEach(t => {
        const sheetData: GeneratedData[] = [];
        let inGroup = false;
        for (let i = 0; i < generatedData.length; i++) {
            const r = generatedData[i];
            // Check if empty separator
            if (Object.keys(r).length > 0) {
                if (r['講師名'] === t) { inGroup = true; sheetData.push(r); } else { inGroup = false; }
            } else { if (inGroup) sheetData.push(r); }
        }
        // Cleanup trailing
        if (sheetData.length > 0 && Object.keys(sheetData[sheetData.length - 1]).length === 0) sheetData.pop();

        const rows = [OUTPUT_HEADER, ...sheetData.map(r => Object.keys(r).length > 0 ? OUTPUT_HEADER.map(h => {
            // @ts-ignore
            return r[h];
        }) : Array(14).fill(null))];

        const ws = XLSX.utils.aoa_to_sheet(rows);

        // Formulas
        XLSX.utils.sheet_add_aoa(ws, [['勤務時間集計(分）']], { origin: "Q2" });
        XLSX.utils.sheet_add_aoa(ws, [['１：２', '１：２(特能)', '１：１(特能）', '集団指導', '事務時間', '英会話']], { origin: "Q3" });
        const fRow = [{ t: 'n', f: 'SUM(H:H)' }, { t: 'n', f: 'SUM(I:I)' }, { t: 'n', f: 'SUM(J:J)' }, { t: 'n', f: 'SUM(K:K)' }, { t: 'n', f: 'SUM(L:L)' }, { t: 'n', f: 'SUM(M:M)' }];
        XLSX.utils.sheet_add_aoa(ws, [fRow], { origin: "Q4" });
        XLSX.utils.sheet_add_aoa(ws, [['月間勤務日数', { t: 'n', f: 'SUM(O:O)' }, '日']], { origin: "Q6" });
        XLSX.utils.sheet_add_aoa(ws, [['個別授業回数', { t: 'n', f: 'COUNT(H:H)+COUNT(I:I)+COUNT(J:J)' }, '回']], { origin: "Q7" });

        applySheetStyles(ws, sheetData, styles, false);
        ws['!cols'] = getColWidths(sheetData);

        let sn = t.replace(/[\\/?*\[\]]/g, '').substring(0, 30) || "Sheet";
        XLSX.utils.book_append_sheet(wb, ws, sn);
    });

    XLSX.writeFile(wb, fileName);
};
