import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export interface WorksheetPrintArea {
    name: string;
    range: string;
}

const decodeXml = (value: string) => value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');

const escapeXml = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const getAttribute = (tag: string, name: string) => {
    const match = tag.match(new RegExp(`${name}="([^"]*)"`));
    return match ? decodeXml(match[1]) : '';
};

const toAbsoluteRange = (range: string) => range.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2');

const ensurePageSetupProperties = (xml: string) => {
    if (/<pageSetUpPr\b/.test(xml)) return xml;

    const sheetPrMatch = xml.match(/<sheetPr\b([^>]*)>([\s\S]*?)<\/sheetPr>/);
    if (sheetPrMatch) {
        return xml.replace(
            sheetPrMatch[0],
            `<sheetPr${sheetPrMatch[1]}>${sheetPrMatch[2]}<pageSetUpPr fitToPage="1"/></sheetPr>`
        );
    }

    const selfClosingSheetPr = xml.match(/<sheetPr\b([^>]*)\/>/);
    if (selfClosingSheetPr) {
        return xml.replace(
            selfClosingSheetPr[0],
            `<sheetPr${selfClosingSheetPr[1]}><pageSetUpPr fitToPage="1"/></sheetPr>`
        );
    }

    return xml.replace(/(<worksheet\b[^>]*>)/, '$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
};

const applyWorksheetPageSetup = (sourceXml: string) => {
    let xml = ensurePageSetupProperties(sourceXml);
    xml = xml
        .replace(/<printOptions\b[^>]*\/>/g, '')
        .replace(/<pageMargins\b[^>]*\/>/g, '')
        .replace(/<pageSetup\b[^>]*\/>/g, '');

    const printSettings = [
        '<printOptions horizontalCentered="0" verticalCentered="0"/>',
        '<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>',
        '<pageSetup paperSize="9" fitToWidth="1" fitToHeight="0" orientation="portrait" horizontalDpi="0" verticalDpi="0"/>'
    ].join('');

    if (xml.includes('</sheetData>')) {
        return xml.replace('</sheetData>', `</sheetData>${printSettings}`);
    }
    return xml.replace('</worksheet>', `${printSettings}</worksheet>`);
};

const replacePrintAreaNames = (
    workbookXml: string,
    sheets: Array<{ name: string; localSheetId: number }>,
    printAreas: Map<string, string>
) => {
    const xml = workbookXml.replace(
        /<definedName\b(?=[^>]*\bname="_xlnm\.Print_Area")[^>]*>[\s\S]*?<\/definedName>/g,
        ''
    );

    const printAreaXml = sheets
        .filter(sheet => printAreas.has(sheet.name))
        .map(sheet => {
            const escapedName = escapeXml(sheet.name.replace(/'/g, "''"));
            const absoluteRange = toAbsoluteRange(printAreas.get(sheet.name) ?? 'A1');
            return `<definedName name="_xlnm.Print_Area" localSheetId="${sheet.localSheetId}">'${escapedName}'!${absoluteRange}</definedName>`;
        })
        .join('');

    if (!printAreaXml) return xml;

    if (/<definedNames\b[^>]*>/.test(xml)) {
        return xml.replace('</definedNames>', `${printAreaXml}</definedNames>`);
    }

    const block = `<definedNames>${printAreaXml}</definedNames>`;
    if (xml.includes('<calcPr')) return xml.replace('<calcPr', `${block}<calcPr`);
    return xml.replace('</workbook>', `${block}</workbook>`);
};

export const applyA4PortraitPrintSettings = (
    workbookBytes: Uint8Array,
    printAreas: WorksheetPrintArea[]
): Uint8Array => {
    const files = unzipSync(workbookBytes);
    const workbookPath = 'xl/workbook.xml';
    const relationshipsPath = 'xl/_rels/workbook.xml.rels';
    const workbookFile = files[workbookPath];
    const relationshipsFile = files[relationshipsPath];
    if (!workbookFile || !relationshipsFile) return workbookBytes;

    let workbookXml = strFromU8(workbookFile);
    const relationshipsXml = strFromU8(relationshipsFile);
    const printAreaMap = new Map(printAreas.map(area => [area.name, area.range]));

    const relationshipTargets = new Map<string, string>();
    for (const match of relationshipsXml.matchAll(/<Relationship\b[^>]*\/>/g)) {
        const tag = match[0];
        if (!getAttribute(tag, 'Type').endsWith('/worksheet')) continue;
        relationshipTargets.set(getAttribute(tag, 'Id'), getAttribute(tag, 'Target'));
    }

    const sheetEntries: Array<{ name: string; localSheetId: number; target: string }> = [];
    let localSheetId = 0;
    for (const match of workbookXml.matchAll(/<sheet\b[^>]*\/>/g)) {
        const tag = match[0];
        const name = getAttribute(tag, 'name');
        const relationshipId = getAttribute(tag, 'r:id');
        const target = relationshipTargets.get(relationshipId) ?? '';
        sheetEntries.push({ name, localSheetId, target });
        localSheetId += 1;
    }

    sheetEntries.forEach(sheet => {
        if (!printAreaMap.has(sheet.name) || !sheet.target) return;
        const normalizedTarget = sheet.target.replace(/^\//, '').replace(/^xl\//, '');
        const worksheetPath = `xl/${normalizedTarget}`;
        const worksheetFile = files[worksheetPath];
        if (!worksheetFile) return;
        files[worksheetPath] = strToU8(applyWorksheetPageSetup(strFromU8(worksheetFile)));
    });

    workbookXml = replacePrintAreaNames(workbookXml, sheetEntries, printAreaMap);
    files[workbookPath] = strToU8(workbookXml);
    return zipSync(files, { level: 6 });
};
