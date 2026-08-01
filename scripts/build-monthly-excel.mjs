import fs from 'node:fs/promises';
import path from 'node:path';
import Papa from 'papaparse';
import xlsxStyle from 'xlsx-js-style';
import { createServer } from 'vite';

const [csvPath, outputDirectory = path.dirname(csvPath ?? '')] = process.argv.slice(2);

if (!csvPath) {
    throw new Error('Usage: node scripts/build-monthly-excel.mjs <csv-path> [output-directory]');
}

const csvBytes = await fs.readFile(csvPath);
const csvText = new TextDecoder('shift_jis').decode(csvBytes);
const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: 'greedy',
});

if (parsed.errors.some(error => error.type === 'Delimiter' || error.type === 'Quotes')) {
    throw new Error(`CSV parse failed: ${parsed.errors.map(error => error.message).join('; ')}`);
}

const vite = await createServer({
    appType: 'custom',
    logLevel: 'error',
    server: { middlewareMode: true },
    ssr: { noExternal: ['xlsx-js-style', 'fflate'] },
});

const getAvailablePath = async (directory, fileName) => {
    const extension = path.extname(fileName);
    const baseName = path.basename(fileName, extension);
    for (let suffix = 0; suffix < 1000; suffix += 1) {
        const candidateName = suffix === 0 ? fileName : `${baseName} (${suffix})${extension}`;
        const candidatePath = path.join(directory, candidateName);
        try {
            await fs.access(candidatePath);
        } catch {
            return candidatePath;
        }
    }
    throw new Error(`Could not choose an available output name for ${fileName}`);
};

try {
    const parserModule = await vite.ssrLoadModule('/src/utils/parser.ts');
    const transformer = await vite.ssrLoadModule('/src/utils/transformer.ts');
    const exporter = await vite.ssrLoadModule('/src/utils/exporter.ts');
    exporter.setXlsxImplementation(xlsxStyle);

    const inputColumn = parserModule.INPUT_COL;
    const parsedRows = parsed.data.filter(row => row && row[inputColumn.TEACHER]);
    const inferredRows = transformer.inferLessonTimes(parsedRows);
    const quality = transformer.checkDataQuality(inferredRows);
    const teacherNames = [...new Set(inferredRows.map(row => row[inputColumn.TEACHER]).filter(Boolean))];
    const sortOrder = [
        ...transformer.DEFAULT_TEACHER_ORDER,
        ...teacherNames.filter(name => !transformer.DEFAULT_TEACHER_ORDER.some(order => name.includes(order.replace('講師', '')))),
    ];
    const nonIndividualTeachers = ['岸本ドナ', '三井宏美', '鈴木春代'].filter(name => teacherNames.includes(name));
    const sortedRows = transformer.sortData(inferredRows, sortOrder);
    const teacherStats = {};
    const generatedData = transformer.transformData(sortedRows, nonIndividualTeachers, teacherStats);
    const excel = exporter.buildExcelFile(generatedData, teacherStats, sortOrder, 'modern', {});
    const outputPath = await getAvailablePath(outputDirectory, excel.fileName);

    await fs.writeFile(outputPath, excel.bytes);
    process.stdout.write(`${JSON.stringify({
        sourceRows: parsedRows.length,
        teacherCount: Object.keys(teacherStats).length,
        estimatedTimeCount: inferredRows.filter(row => row._isTimeEstimated).length,
        unresolvedTimeCount: quality.errorIndices.length,
        officeReviewCount: quality.warnIndices.length,
        outputPath,
    }, null, 2)}\n`);
} finally {
    await vite.close();
}
