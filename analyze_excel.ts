
import * as fs from 'fs';
import XLSX from 'xlsx-js-style';

const filePath = 'c:\\Users\\makoto\\Documents\\アプリ開発\\非常勤講師勤務時間の集計\\集計シートサンプル.xlsx';

try {
    const buf = fs.readFileSync(filePath);
    const wb = XLSX.read(buf, { type: 'buffer' });

    console.log("Workbook Sheets:", wb.SheetNames);

    wb.SheetNames.forEach(name => {
        console.log(`\n--- Sheet: ${name} ---`);
        const ws = wb.Sheets[name];


        const checkCells = ['B4', 'B5', 'B6', 'C5', 'C6'];
        checkCells.forEach(ref => {
            const cell = ws[ref];
            if (cell) {
                console.log(`\nCell ${ref} Style:`, JSON.stringify(cell.s, null, 2));
                console.log(`Cell ${ref} Value:`, cell.v);
            }
        });

        if (ws['!cols']) console.log("Col Widths:", JSON.stringify(ws['!cols'], null, 2));

    });

} catch (e) {
    console.error("Error reading file:", e);
}
