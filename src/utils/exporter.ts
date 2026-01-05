
import * as XLSX from 'xlsx-js-style';
import type { GeneratedData, TeacherStats, ThemeType } from '../types';

const HEADER_ORDER = [
    '生徒氏名', 'フリガナ', '講師名', '学年', '年度',
    '授業開始時間', '授業終了時間',
    '１：２', '１：２(特能)', '１：１(特能）', '集団指導', '事務作業', '英会話',
    '教科', '週間日数'
];

const DISPLAY_HEADER = HEADER_ORDER;
export const DATA_KEYS = HEADER_ORDER;

// Theme Colors
interface StyleSet {
    headerFill: { fgColor: { rgb: string } };
    headerFont: { name: string; sz: number; bold: boolean; color: { rgb: string } };
    borderThin: { style: string; color: { rgb: string } };
    borderMedium: { style: string; color: { rgb: string } };
    borderDotted: { style: string; color: { rgb: string } };
    stripeEven: { fgColor: { rgb: string } };
    stripeOdd: { fgColor: { rgb: string } };
    highlightText: { color: { rgb: string } };
    highlightText2: { color: { rgb: string } };
    // Summary Colors
    bgBlue: { fgColor: { rgb: "DCE6F1" } };
    bgGreen: { fgColor: { rgb: "EBF1DE" } };
    bgOrange: { fgColor: { rgb: "FDE9D9" } };
    bgRed: { fgColor: { rgb: "F2DCDB" } };
}

const getStyleSet = (_theme: ThemeType): StyleSet => {
    // We can customize based on theme string if needed
    // Defaulting to requested dark blue style
    const black = { rgb: "000000" };
    return {
        headerFill: { fgColor: { rgb: "1b2c40" } },
        headerFont: { name: 'Meiryo UI', sz: 10, bold: true, color: { rgb: "FFFFFF" } },
        borderThin: { style: 'thin', color: black },
        borderMedium: { style: 'medium', color: black },
        borderDotted: { style: 'dotted', color: black },
        stripeEven: { fgColor: { rgb: "FFFFFF" } },
        stripeOdd: { fgColor: { rgb: "F8F9FA" } },
        highlightText: { color: { rgb: "0000FF" } }, // Blue for Koshu
        highlightText2: { color: { rgb: "008000" } }, // Green for Furikae
        bgBlue: { fgColor: { rgb: "DCE6F1" } },
        bgGreen: { fgColor: { rgb: "EBF1DE" } },
        bgOrange: { fgColor: { rgb: "FDE9D9" } },
        bgRed: { fgColor: { rgb: "F2DCDB" } }
    };
};

const applySheetStyles = (ws: any, dataArray: any[], styles: StyleSet, isSummary: boolean) => {
    if (!ws['!ref']) return;
    const range = XLSX.utils.decode_range(ws['!ref']);

    // Find Header Row
    let tHeadR = 0;
    for (let r = range.s.r; r <= range.e.r; r++) {
        const cell = ws[XLSX.utils.encode_cell({ c: 0, r })]; // Check First Col
        if (cell && (cell.v === '生徒氏名' || cell.v === '講師名')) { // Main Table Header Trigger
            tHeadR = r;
            break;
        }
    }
    // For Summary Sheet, if not found (though '講師名' should catch it)
    if (isSummary && tHeadR === 0) tHeadR = 2; // Assuming row 2 (0-indexed)

    // Apply Styles
    for (let r = tHeadR; r <= range.e.r; r++) {
        const isHeader = r === tHeadR;
        const isLastRow = r === range.e.r;
        const dIdx = r - (tHeadR + 1);
        const rowObj = !isHeader && dIdx >= 0 && dIdx < dataArray.length ? dataArray[dIdx] : null;

        for (let c = range.s.c; c <= range.e.c; c++) {
            const ref = XLSX.utils.encode_cell({ c, r });
            if (!ws[ref]) ws[ref] = { v: '', t: 's' };

            const isFirstCol = c === range.s.c;
            const isLastCol = c === range.e.c;

            // Determine Borders
            // Default: Thin Vertical, Dotted Horizontal
            let bTop = styles.borderDotted;
            let bBottom = styles.borderDotted;
            let bLeft = styles.borderThin;
            let bRight = styles.borderThin;

            // Outer Frame / Major Divisors Override
            if (isHeader) {
                bTop = styles.borderMedium;
                bBottom = styles.borderThin;
            }
            if (isLastRow) {
                bBottom = styles.borderMedium;
            }

            if (isFirstCol) bLeft = styles.borderMedium;
            if (isLastCol) bRight = styles.borderMedium;

            let cellStyle: any = {
                font: { name: 'Meiryo UI', sz: 10 },
                border: {
                    top: bTop, bottom: bBottom,
                    left: bLeft, right: bRight
                },
                alignment: { vertical: 'center', wrapText: true }
            };

            if (isHeader) {
                cellStyle.fill = styles.headerFill;
                cellStyle.font = styles.headerFont;
                cellStyle.alignment.horizontal = 'center';
            } else {
                // Summary Sheet Color Logic
                if (isSummary) {
                    // 0:Name, 1:1:2, 2:1:2(s), 3:1:1(s), 4:Group, 5:Office, 6:Eng, 7:Days, 8:Count
                    // B-D: Blue, E: Green, F: Orange, G: Red
                    if (c === 1 || c === 2 || c === 3) cellStyle.fill = styles.bgBlue;
                    else if (c === 4) cellStyle.fill = styles.bgGreen;
                    else if (c === 5) cellStyle.fill = styles.bgOrange;
                    else if (c === 6) cellStyle.fill = styles.bgRed;
                    else {
                        if (dIdx % 2 === 1) cellStyle.fill = styles.stripeOdd;
                        else cellStyle.fill = styles.stripeEven;
                    }
                } else {
                    // Normal Sheet Stripe
                    if (dIdx % 2 === 1) cellStyle.fill = styles.stripeOdd;
                    else cellStyle.fill = styles.stripeEven;
                }

                // Conditional Coloring (No Bold)
                if (rowObj) {
                    // Highlight Manually Fixed Rows in Red
                    if (rowObj._isManuallyFixed) {
                        cellStyle.font = { ...cellStyle.font, color: { rgb: "FF0000" }, bold: false };
                    }
                    else if (rowObj._classType) {
                        if (rowObj._classType.includes('講習')) {
                            cellStyle.font = { ...cellStyle.font, color: styles.highlightText.color, bold: false };
                        }
                        else if (rowObj._classType.includes('振替')) {
                            cellStyle.font = { ...cellStyle.font, color: styles.highlightText2.color, bold: false };
                        }
                    }

                    // Highlight Student Name for Special
                    if (rowObj._isSpecial && c === 0) {
                        cellStyle.fill = { fgColor: { rgb: "FFFF00" } };
                    }
                }
            }
            ws[ref].s = cellStyle;
        }
    }
};

const getColWidths = (_data: any[]) => {
    return [
        { wch: 15 }, // Name
        { wch: 15 }, // Kana
        { wch: 12 }, // Teacher
        { wch: 6 },  // Grade
        { wch: 6 },  // Year
        { wch: 18 }, // Start
        { wch: 18 }, // End
        { wch: 6 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, // Counts (Group, Office, English - widened)
        { wch: 10 }, // Subject
        { wch: 8 },  // Days
    ];
};

export const exportToExcel = (
    generatedData: GeneratedData[],
    teacherStats: Record<string, TeacherStats>,
    sortOrder: string[],
    theme: ThemeType,
    _sheetComments: Record<string, string>
) => {
    const wb = XLSX.utils.book_new();

    // Calculate Global date range for Title / Month
    let minDate = new Date();
    if (generatedData.length > 0) {
        const dates = generatedData.map(r => new Date(r['授業開始時間']).getTime()).filter(t => !isNaN(t));
        if (dates.length > 0) minDate = new Date(Math.min(...dates));
    }
    const monthStr = (minDate.getMonth() + 1).toString();
    const fileName = `勤務集計_${monthStr}月分.xlsx`;

    // 1. SUMMARY SHEET
    const summaryHeader = ['講師名', '1:2', '1:2(特能)', '1:1(特能)', '集団指導', '事務作業', '英会話', '勤務日数', '個別授業回数'];
    const summaryRows: any[] = [
        [`${monthStr}月勤務時間集計`],
        summaryHeader
    ];

    const uniqueTeachers = Object.keys(teacherStats);

    // Sort logic
    const displayedTeachers = [...uniqueTeachers];
    displayedTeachers.sort((a, b) => {
        const ia = sortOrder.indexOf(a);
        const ib = sortOrder.indexOf(b);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return a.localeCompare(b, 'ja');
    });

    displayedTeachers.forEach(t => {
        // Use formulas that reference the mini-table (Row 4) in each teacher's individual sheet
        // H4=1:2, I4=1:2(s), J4=1:1(s), K4=Group, L4=Office, M4=English
        // For Days and Count, we use COUNTA for days and COUNT for individual lessons
        const sheetName = `'${t}'`;
        summaryRows.push([
            t,
            { f: `${sheetName}!H4` },  // 1:2
            { f: `${sheetName}!I4` },  // 1:2(特能)
            { f: `${sheetName}!J4` },  // 1:1(特能)
            { f: `${sheetName}!K4` },  // 集団指導
            { f: `${sheetName}!L4` },  // 事務作業
            { f: `${sheetName}!M4` },  // 英会話
            { f: `${sheetName}!C5` },  // 勤務日数 (from Row 5, Col C)
            { f: `${sheetName}!C6` }   // 個別授業回数 (from Row 6, Col C)
        ]);
    });

    const wsSum = XLSX.utils.aoa_to_sheet(summaryRows);

    // Style Summary
    applySheetStyles(wsSum, new Array(displayedTeachers.length).fill({}), getStyleSet(theme), true);
    // Custom Title style
    if (wsSum['A1']) wsSum['A1'].s = { font: { name: 'Meiryo UI', sz: 14, bold: true }, border: { bottom: getStyleSet(theme).borderMedium } };

    wsSum['!cols'] = [{ wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, wsSum, '集計一覧');


    // 2. INDIVIDUAL SHEETS with Weekly Separators
    displayedTeachers.forEach(teacher => {
        const records = generatedData.filter(r => r['講師名'] === teacher);
        if (records.length === 0) return;

        // Sort by Date/Time
        records.sort((a, b) => {
            const da = new Date(a['授業開始時間']).getTime();
            const db = new Date(b['授業開始時間']).getTime();
            return da - db;
        });

        // Insert Separators & Layout
        const rows: any[] = [];
        const stats = teacherStats[teacher];

        // Row 1 (Index 0): Name
        rows.push([`${teacher}講師`]);

        // Row 2 (Index 1): Title
        rows.push([`${monthStr}月分勤務時間集計(分)`]);

        // Row 3 (Index 2): Mini Table Header (at Col H / Index 7)
        // A-G empty
        const r3 = Array(7).fill('');
        r3.push('１：２', '１：２\n(特能)', '１：１\n(特能)', '集団指導', '事務作業', '英会話');
        rows.push(r3);

        // Row 4 (Index 3): Mini Table Data (using formulas)
        // Data starts at Row 11 (Excel Row), Column H=1:2, I=1:2(s), J=1:1(s), K=Group, L=Office, M=English
        // We use SUM formulas so user can edit values post-export
        // Use a large fixed range to ensure all data is captured
        const r4 = Array(7).fill('');
        r4.push(
            { f: `SUM(H11:H1000)` },
            { f: `SUM(I11:I1000)` },
            { f: `SUM(J11:J1000)` },
            { f: `SUM(K11:K1000)` },
            { f: `SUM(L11:L1000)` },
            { f: `SUM(M11:M1000)` }
        );
        rows.push(r4);

        // Row 5 (Index 4): Days stats - Static value from transformer (unique dates)
        rows.push(['月間勤務日数', '', `${stats.days.size} 日`]);

        // Row 6 (Index 5): Count stats - Count individual lessons (non-empty cells in H, I, J columns)
        rows.push(['個別授業回数', '', { f: `(COUNTIF(H11:H1000,">0")+COUNTIF(I11:I1000,">0")+COUNTIF(J11:J1000,">0"))&" 回"` }]);

        // Row 7 (Index 6): Empty
        rows.push([]);

        // Row 8 (Index 7): Legend
        rows.push(['', '凡例: 緑文字=振替 青文字=講習会授業']);

        // Row 9 (Index 8): Empty
        rows.push([]);

        // Row 10 (Index 9): Main Header
        rows.push(DISPLAY_HEADER);
        // Header is at row index 9 (Row 10 in Excel)


        // Helper to check same week
        const getWeek = (d: Date) => {
            const date = new Date(d.getTime());
            const day = date.getDay() || 7;
            date.setHours(0, 0, 0, 0);
            date.setDate(date.getDate() + 4 - day + 1);
            return Math.ceil((((date.getTime() - new Date(date.getFullYear(), 0, 1).getTime()) / 86400000) + 1) / 7);
        };

        const dataRowsOnly: any[] = [];

        records.forEach((r, i) => {
            if (i > 0) {
                const curDate = new Date(r['授業開始時間']);
                const prevDate = new Date(records[i - 1]['授業開始時間']);
                const w1 = getWeek(curDate);
                const w2 = getWeek(prevDate);
                if (w1 !== w2) {
                    rows.push(Array(DISPLAY_HEADER.length).fill(null));
                    dataRowsOnly.push(null); // Separator in data array
                }
            }

            const row = DATA_KEYS.map(k => {
                if (k === '授業開始時間' || k === '授業終了時間') {
                    const d = new Date(r[k]);
                    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
                }
                // Check if key exists in GeneratedData, if not (e.g. GeneratedData doesn't have all manual fields?)
                // Actually GeneratedData extends AttendanceRecord roughly or contains data.
                return (r as any)[k];
            });
            rows.push(row);
            dataRowsOnly.push(r);
        });

        const ws = XLSX.utils.aoa_to_sheet(rows);

        // --- Apply Styles ---
        // 1. Data Body Styling (Main Table)
        applySheetStyles(ws, dataRowsOnly, getStyleSet(theme), false);


        // 2. Custom Top Layout Styling
        const darkBlueStr = "1b2c40";
        const darkBlue = { rgb: darkBlueStr };
        const white = { rgb: "FFFFFF" };
        const borderThin = { style: 'thin', color: { rgb: "000000" } };

        // Row 1 (A1): Name
        if (ws['A1']) ws['A1'].s = { font: { name: 'Meiryo UI', sz: 12, bold: true }, alignment: { vertical: 'center' } };

        // Row 2 (A2): Title
        if (ws['A2']) ws['A2'].s = { font: { name: 'Meiryo UI', sz: 16, bold: true }, alignment: { vertical: 'center' } };

        // Row 3 (Header for Mini Table): H3:M3 (Indices 7-12)
        const miniHeadStyle = {
            font: { name: 'Meiryo UI', sz: 10, color: white, bold: true },
            fill: { fgColor: darkBlue },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
            border: { top: borderThin, bottom: borderThin, left: borderThin, right: borderThin }
        };
        ['H3', 'I3', 'J3', 'K3', 'L3', 'M3'].forEach(ref => {
            if (!ws[ref]) ws[ref] = { v: '', t: 's' };
            ws[ref].s = miniHeadStyle;
        });

        // Row 4 (Data for Mini Table): H4:M4
        const miniDataStyle = {
            font: { name: 'Meiryo UI', sz: 10, bold: true },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: { top: borderThin, bottom: borderThin, left: borderThin, right: borderThin }
        };
        ['H4', 'I4', 'J4', 'K4', 'L4', 'M4'].forEach(ref => {
            if (!ws[ref]) ws[ref] = { v: '', t: 's' };
            ws[ref].s = miniDataStyle;
        });

        // Row 5, 6 (Stats)
        const statLabelStyle = { font: { name: 'Meiryo UI', sz: 11 } };
        const statValueStyle = { font: { name: 'Meiryo UI', sz: 11 }, alignment: { horizontal: 'right' } };

        if (ws['A5']) ws['A5'].s = statLabelStyle;
        if (ws['C5']) ws['C5'].s = statValueStyle;

        if (ws['A6']) ws['A6'].s = statLabelStyle;
        if (ws['C6']) ws['C6'].s = statValueStyle;

        // Row 8 (Legend)
        if (ws['B8']) ws['B8'].s = { font: { name: 'Meiryo UI', sz: 9, color: { rgb: "555555" } } };

        const cols = getColWidths(records.map(r => r as any));
        cols[13] = { wch: 25 }; // Update Subject Width
        ws['!cols'] = cols;

        XLSX.utils.book_append_sheet(wb, ws, teacher);
    });

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};
