import { useState, useEffect, useRef, type SetStateAction } from 'react';
import Papa from 'papaparse';
import { Settings, AlertTriangle, CheckCircle, Sparkles, ShieldCheck, Clock3, Building2, Download, HardDrive, Upload } from 'lucide-react';
import type { AttendanceRecord, GeneratedData, TeacherStats, SpecialClassRule } from './types';
import { parseCSV, INPUT_COL } from './utils/parser';
import { transformData, checkDataQuality, sortData, inferLessonTimes, DEFAULT_TEACHER_ORDER } from './utils/transformer';
import { exportToExcel, DATA_KEYS } from './utils/exporter';
import { applySpecialRules } from './utils/specialRules';
import {
  CAMPUS_DEFINITIONS,
  createCampusSettingsBackup,
  getCampusName,
  loadInitialCampusStore,
  parseCampusSettingsBackup,
  saveCampusStore,
  type CampusId,
  type CampusSettings
} from './utils/campusSettings';
import { DropZone } from './components/DropZone';
import { TeacherConfig } from './components/TeacherConfig';
import { Dashboard } from './components/Dashboard';
import { FixDataModal } from './components/FixDataModal';
import type { SpecialCandidate } from './components/SpecialCandidateList';
import { ExcelPdfDropZone } from './components/ExcelPdfDropZone';
import { ComiruAutoImport } from './components/ComiruAutoImport';
import heroImage from './assets/work-summary-hero.png';

const getTeacherNames = (records: AttendanceRecord[]): string[] => {
  const teachers: string[] = [];
  const seen = new Set<string>();

  records.forEach(record => {
    const value = record[INPUT_COL.TEACHER];
    const teacher = typeof value === 'string' ? value.trim() : '';
    if (teacher && !seen.has(teacher)) {
      seen.add(teacher);
      teachers.push(teacher);
    }
  });

  return teachers;
};

const syncTeacherOrder = (previousOrder: string[], currentTeachers: string[]): string[] => {
  const currentSet = new Set(currentTeachers);
  const nextOrder: string[] = [];
  const added = new Set<string>();

  previousOrder.forEach(teacher => {
    if (currentSet.has(teacher) && !added.has(teacher)) {
      added.add(teacher);
      nextOrder.push(teacher);
    }
  });

  currentTeachers.forEach(teacher => {
    if (!added.has(teacher)) {
      added.add(teacher);
      nextOrder.push(teacher);
    }
  });

  return nextOrder;
};

function App() {
  const [campusStore, setCampusStore] = useState(loadInitialCampusStore);
  const activeCampusId = campusStore.activeCampusId;
  const activeCampus = campusStore.campuses[activeCampusId];
  const { sortOrder, excludedTeachers, specialRules, theme, sheetComments, comiruTenant } = activeCampus.settings;

  const updateCampusSetting = <K extends keyof CampusSettings,>(
    key: K,
    update: SetStateAction<CampusSettings[K]>
  ) => {
    const targetCampusId = activeCampusId;
    setCampusStore(previousStore => {
      const campus = previousStore.campuses[targetCampusId];
      const currentValue = campus.settings[key];
      const nextValue = typeof update === 'function'
        ? (update as (current: CampusSettings[K]) => CampusSettings[K])(currentValue)
        : update;

      if (Object.is(currentValue, nextValue)) return previousStore;

      return {
        ...previousStore,
        campuses: {
          ...previousStore.campuses,
          [targetCampusId]: {
            ...campus,
            settings: {
              ...campus.settings,
              [key]: nextValue
            }
          }
        }
      };
    });
  };

  const setSortOrder = (update: SetStateAction<string[]>) => updateCampusSetting('sortOrder', update);
  const setExcludedTeachers = (update: SetStateAction<string[]>) => updateCampusSetting('excludedTeachers', update);
  const setSpecialRules = (update: SetStateAction<SpecialClassRule[]>) => updateCampusSetting('specialRules', update);
  const setSheetComments = (update: SetStateAction<Record<string, string>>) => updateCampusSetting('sheetComments', update);

  // State
  const [rawRecords, setRawRecords] = useState<AttendanceRecord[]>([]);
  const [generatedData, setGeneratedData] = useState<GeneratedData[]>([]);
  const [teacherStats, setTeacherStats] = useState<Record<string, TeacherStats>>({});

  // UI State
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComiruImporting, setIsComiruImporting] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [specialCandidates, setSpecialCandidates] = useState<SpecialCandidate[]>([]);
  const [errorIndices, setErrorIndices] = useState<number[]>([]);
  const [warnIndices, setWarnIndices] = useState<number[]>([]);
  const [msg, setMsg] = useState<{ type: 'info' | 'error' | 'success', text: string } | null>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const activeCampusIdRef = useRef<CampusId>(activeCampusId);
  const isCampusLocked = isProcessing || isComiruImporting;

  useEffect(() => {
    activeCampusIdRef.current = activeCampusId;
  }, [activeCampusId]);

  useEffect(() => {
    if (!saveCampusStore(campusStore)) {
      setMsg({
        type: 'error',
        text: 'ブラウザへ設定を保存できません。設定画面の「PCに保存」でバックアップしてください。'
      });
    }
  }, [campusStore]);

  // Re-transform when config changes if we have data
  useEffect(() => {
    if (rawRecords.length > 0) {
      const timer = setTimeout(() => processTransformation(rawRecords, true), 100);
      return () => clearTimeout(timer);
    }
  }, [excludedTeachers, sortOrder]);

  const syncTeacherSettings = (records: AttendanceRecord[]) => {
    const currentTeachers = getTeacherNames(records);
    const currentTeacherSet = new Set(currentTeachers);

    // Keep the manual order for current teachers, add newcomers, and remove
    // teachers who are not present in the newly imported report.
    setSortOrder(previousOrder => syncTeacherOrder(previousOrder, currentTeachers));
    setExcludedTeachers(previousExcluded =>
      previousExcluded.filter(teacher => currentTeacherSet.has(teacher))
    );
  };

  const clearImportedData = () => {
    setRawRecords([]);
    setGeneratedData([]);
    setTeacherStats({});
    setSpecialCandidates([]);
    setErrorIndices([]);
    setWarnIndices([]);
    setShowModal(false);
    setIsProcessing(false);
  };

  const handleCampusChange = (nextCampusId: CampusId) => {
    if (nextCampusId === activeCampusId || isCampusLocked) return;

    if (
      rawRecords.length > 0
      && !window.confirm('校舎を切り替えると、現在表示中のCSV集計を閉じます。校舎別設定は保存されています。切り替えますか？')
    ) {
      return;
    }

    setCampusStore(previousStore => ({ ...previousStore, activeCampusId: nextCampusId }));
    clearImportedData();
    setMsg({ type: 'success', text: `${getCampusName(nextCampusId)}へ切り替えました` });
  };

  const handleExportCampusSettings = () => {
    const backup = createCampusSettingsBackup(campusStore);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const now = new Date();
    const dateLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    anchor.href = url;
    anchor.download = `勤務時間集計設定_全校舎_${dateLabel}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMsg({ type: 'success', text: '藍住校・北島中央校の設定をPCへ保存しました' });
  };

  const handleImportCampusSettings = async (file: File) => {
    try {
      if (file.size > 2 * 1024 * 1024) {
        throw new Error('設定ファイルが大きすぎます。2MB以下のJSONファイルを選択してください。');
      }
      const importedStore = parseCampusSettingsBackup(await file.text());
      const summary = CAMPUS_DEFINITIONS.map(campus => {
        const settings = importedStore.campuses[campus.id].settings;
        return `${campus.name}: 講師順${settings.sortOrder.length}名・個別なし${settings.excludedTeachers.length}名・特能${settings.specialRules.length}件`;
      }).join('\n');

      if (!window.confirm(`次の全校舎設定を復元します。現在の校舎別設定は上書きされます。\n\n${summary}\n\n復元しますか？`)) {
        return;
      }

      setCampusStore(importedStore);
      clearImportedData();
      setMsg({ type: 'success', text: '全校舎の設定を復元しました' });
    } catch (error) {
      setMsg({
        type: 'error',
        text: error instanceof Error ? error.message : '設定ファイルを復元できませんでした'
      });
    } finally {
      if (backupInputRef.current) backupInputRef.current.value = '';
    }
  };


  const handleFileSelect = async (file: File, encoding: string) => {
    const importCampusId = activeCampusId;
    const importSpecialRules = specialRules;
    setIsProcessing(true);
    setMsg({ type: 'info', text: '解析中...' });
    setGeneratedData([]);

    try {
      console.log('Starting CSV parse for file:', file.name, 'Encoding:', encoding);
      const parsedData = await parseCSV(file, encoding);
      if (activeCampusIdRef.current !== importCampusId) {
        setIsProcessing(false);
        setMsg({ type: 'info', text: '校舎が切り替わったため、CSVの読み込みを中止しました' });
        return;
      }
      const inferredData = inferLessonTimes(parsedData);
      const {
        records: data,
        matchedCount: specialRuleMatchCount
      } = applySpecialRules(inferredData, importSpecialRules);
      const estimatedTimeCount = data.filter(row => row._isTimeEstimated).length;
      console.log('Parsed data rows:', data.length);
      if (data.length > 0) {
        console.log('Detected headers:', Object.keys(data[0]));
      }

      setRawRecords(data);
      syncTeacherSettings(data);

      // Quality Check
      const { errorIndices: errs, warnIndices: warns } = checkDataQuality(data);
      setErrorIndices(errs);
      setWarnIndices(warns);

      if (errs.length > 0 || warns.length > 0) {
        setShowModal(true);
        setIsProcessing(false);
      } else {
        // Initial transform
        processTransformation(data);
        const notes = [
          estimatedTimeCount > 0 ? `授業時間を${estimatedTimeCount}件推定` : '',
          specialRuleMatchCount > 0 ? `特能ルールを${specialRuleMatchCount}件自動適用` : ''
        ].filter(Boolean);
        const detailNote = notes.length > 0 ? `（${notes.join('・')}）` : '';
        setMsg({ type: 'success', text: `${getCampusName(importCampusId)} 読み込み完了: ${data.length}行${detailNote}` });
      }

    } catch (e: any) {
      console.error(e);
      setMsg({ type: 'error', text: e.message || 'エラーが発生しました' });
      setIsProcessing(false);
    }
  };

  const processTransformation = (data: AttendanceRecord[], silent = false) => {
    try {
      console.log('Processing transformation, data length:', data.length);
      if (data.length > 0) console.log('First row sample:', data[0]);

      // Sort
      const sorted = sortData(data, sortOrder);
      console.log('Sorted data length:', sorted.length);

      // Transform & Stats
      const newStats: Record<string, TeacherStats> = {};
      const gen = transformData(sorted, excludedTeachers, newStats);
      console.log('Generated data length:', gen.length);

      setGeneratedData(gen);
      setTeacherStats(newStats);
      setIsProcessing(false);
      if (!silent) setMsg({ type: 'success', text: '集計が完了しました' });

    } catch (e) {
      console.error('Transformation error:', e);
      setMsg({ type: 'error', text: '集計中にエラーが発生しました' });
      setIsProcessing(false);
    }
  };

  const handleModalApply = (updatedData: AttendanceRecord[]) => {
    const { records: ruleAppliedData } = applySpecialRules(updatedData, specialRules);
    setRawRecords(ruleAppliedData);

    // Re-check quality to update warnings/errors in the modal
    const { errorIndices: errs, warnIndices: warns } = checkDataQuality(ruleAppliedData);
    setErrorIndices(errs);
    setWarnIndices(warns);

    processTransformation(ruleAppliedData);
  };

  const handleDownloadExcel = () => {
    exportToExcel(generatedData, teacherStats, sortOrder, theme, sheetComments); // Pass comments
  };

  const handleDownloadCsv = () => {
    const clean = generatedData.map(({ _isError, _isManuallyFixed, _classType, ...r }) => r);
    // @ts-ignore
    const csv = Papa.unparse({ fields: [...DATA_KEYS], data: clean });
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '勤務集計.csv'; a.click();
  };

  const handleDownloadTemplate = () => {
    alert("テンプレートダウンロードは実装中です。");
  };

  // Restore handleImportTeachers
  const handleImportTeachers = () => {
    if (rawRecords.length === 0) {
      alert('先にCSVファイルを読み込んでください。');
      return;
    }
    syncTeacherSettings(rawRecords);
  };

  const toggleExclude = (name: string) => {
    setExcludedTeachers(prev =>
      prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name]
    );
  };

  const handleUpdateSpecialRules = (rules: SpecialClassRule[]) => {
    setSpecialRules(rules);

    if (rawRecords.length === 0) return;

    const result = applySpecialRules(rawRecords, rules);
    setRawRecords(result.records);
    setSpecialCandidates([]);
    processTransformation(result.records, true);
    setMsg({
      type: 'success',
      text: result.matchedCount > 0
        ? `特能ルールを保存し、現在のCSVへ${result.matchedCount}件適用しました`
        : '特能ルールを保存しました'
    });
  };

  // Special Rules Workflow
  const handleScanRules = () => {
    if (rawRecords.length === 0) {
      setMsg({ type: 'info', text: '先にCSVファイルを読み込んでください' });
      return;
    }
    if (specialRules.length === 0) {
      setMsg({ type: 'info', text: '適用する特能ルールが登録されていません' });
      return;
    }

    const result = applySpecialRules(rawRecords, specialRules);
    setRawRecords(result.records);
    setSpecialCandidates([]);
    processTransformation(result.records, true);
    setMsg({
      type: 'success',
      text: result.matchedCount > 0
        ? `現在のCSVへ特能ルールを${result.matchedCount}件適用しました`
        : '現在のCSVに一致する特能ルールはありませんでした'
    });
  };

  const handleConfirmSpecial = (results: { index: number, isSpecial: boolean }[]) => {
    const newData = [...rawRecords];
    const processedIndices = new Set<number>();

    results.forEach(({ index, isSpecial }) => {
      const updatedRecord = {
        ...newData[index],
        _specialConfirmed: true,
        _forceSpecial: isSpecial,
        _specialRuleSuppressed: !isSpecial
      };
      delete updatedRecord._specialRuleId;
      newData[index] = updatedRecord;
      processedIndices.add(index);
    });

    setRawRecords(newData);
    setSpecialCandidates(prev => prev.filter(c => !processedIndices.has(c.index)));
    processTransformation(newData, true);
  };


  // Helper to sort teachers
  const compareTeachers = (a: string, b: string) => {
    // Normalization to handle potential whitespace differences
    const normA = a.replace(/\s+/g, '');
    const normB = b.replace(/\s+/g, '');

    // Create base list from defaults (remove '講師' to match surnames)
    const defaultBases = DEFAULT_TEACHER_ORDER.map(t => t.replace(/\s+/g, '').replace('講師', ''));

    const getRank = (name: string) => {
      const idx = defaultBases.findIndex(base => name.startsWith(base));
      return idx === -1 ? 9999 : idx;
    };

    const rankA = getRank(normA);
    const rankB = getRank(normB);

    if (rankA !== rankB) return rankA - rankB;
    return a.localeCompare(b, 'ja');
  };

  // Helper to sort students by grade (extract Grade from raw record if possible, but here we only have strings)
  // We need to look up the grade for the student.
  const getStudentGrade = (name: string) => {
    const rec = rawRecords.find(r => r[INPUT_COL.STUDENT_NAME] === name);
    return rec ? rec[INPUT_COL.GRADE] : '';
  };

  const compareGrades = (g1: string, g2: string) => {
    const gradeOrder = ['中1', '中2', '中3', '高1', '高2', '高3'];
    const i1 = gradeOrder.indexOf(g1);
    const i2 = gradeOrder.indexOf(g2);
    if (i1 !== -1 && i2 !== -1) return i1 - i2;
    if (i1 !== -1) return -1;
    if (i2 !== -1) return 1;
    return g1.localeCompare(g2, 'ja');
  };

  // Calculate distinct lists for autosuggest
  const distinctTeachers = Array.from(new Set(rawRecords.map(r => r[INPUT_COL.TEACHER]).filter(Boolean))).sort(compareTeachers);

  const distinctStudents = (() => {
    const rawList = Array.from(new Set(rawRecords.map(r => r[INPUT_COL.STUDENT_NAME]).filter(Boolean))).sort((a, b) => {
      const gA = getStudentGrade(a);
      const gB = getStudentGrade(b);
      // Sort by Grade first, then Name
      const gradeDiff = compareGrades(gA, gB);
      if (gradeDiff !== 0) return gradeDiff;
      return a.localeCompare(b, 'ja');
    });

    const result: string[] = [];
    let lastGrade = '';
    rawList.forEach(student => {
      const grade = getStudentGrade(student);
      if (grade && grade !== lastGrade) {
        if (lastGrade !== '') {
          // Add separator
          result.push(`--- ${grade} ---`);
        } else {
          // First Header? Optional
          result.push(`--- ${grade} ---`);
        }
        lastGrade = grade;
      }
      result.push(student);
    });
    return result;
  })();

  const distinctSubjects = Array.from(new Set(rawRecords.map(r => r[INPUT_COL.SUBJECT]).filter(Boolean))).sort();

  // Handle Reset Sort to Default
  const handleResetSort = () => {
    if (rawRecords.length === 0) {
      alert("CSVデータがありません");
      return;
    }
    const currentTeachers = Array.from(new Set(rawRecords.map(r => r[INPUT_COL.TEACHER]).filter(Boolean)));
    const sorted = currentTeachers.sort(compareTeachers);
    setSortOrder(sorted);
  };


  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <div className="brand-lockup">
            <div className="brand-mark" aria-hidden="true">R</div>
            <div>
              <p className="brand-kicker">Re:Act Operations</p>
              <h1>勤務時間集計</h1>
            </div>
          </div>
          <div className="header-actions">
            <label className="campus-switcher">
              <Building2 size={16} aria-hidden="true" />
              <span>校舎</span>
              <select
                value={activeCampusId}
                onChange={event => handleCampusChange(event.target.value as CampusId)}
                disabled={isCampusLocked}
                aria-label="校舎を選択"
              >
                {CAMPUS_DEFINITIONS.map(campus => (
                  <option key={campus.id} value={campus.id}>{campus.name}</option>
                ))}
              </select>
            </label>
            <button
              onClick={() => setShowConfig(!showConfig)}
              className={`config-trigger ${showConfig ? 'is-open' : ''}`}
              aria-expanded={showConfig}
              aria-label="集計設定"
            >
              <Settings className="w-4 h-4" />
              <span>集計設定</span>
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">
        {msg && (
          <div className={`status-banner status-${msg.type}`}>
            {msg.type === 'error' ? <AlertTriangle size={18} /> : <CheckCircle size={18} />}
            {msg.text}
          </div>
        )}

        {showConfig && (
          <section className="config-section animate-in slide-in-from-top-4 duration-300">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">SETTINGS</p>
                <h2>集計ルールを整える</h2>
              </div>
              <p>講師の並び順や個別指導の対象、特能ルールを管理できます。</p>
            </div>
            <div className="campus-storage-bar">
              <div className="campus-storage-summary">
                <span className="campus-storage-icon" aria-hidden="true"><HardDrive size={18} /></span>
                <div>
                  <strong>{activeCampus.name}の設定</strong>
                  <p>設定はこのブラウザへ校舎別に自動保存されます。全校舎分をJSONファイルでPCへ保存・復元できます。</p>
                </div>
              </div>
              <label className="comiru-tenant-field">
                <span>Comiru校舎コード</span>
                <input
                  value={comiruTenant}
                  onChange={event => updateCampusSetting(
                    'comiruTenant',
                    event.target.value.toLowerCase().replace(/[^a-z0-9-]/gu, '').slice(0, 80)
                  )}
                  placeholder="URLの /○○/reports の○○"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={isCampusLocked}
                  readOnly={activeCampusId === 'aizumi'}
                />
                <small>ComiruのURLで「/reports」の直前にある英数字です。</small>
              </label>
              <div className="campus-storage-actions">
                <button type="button" onClick={handleExportCampusSettings}>
                  <Download size={15} /> PCに保存
                </button>
                <button type="button" onClick={() => backupInputRef.current?.click()} disabled={isCampusLocked}>
                  <Upload size={15} /> 設定を復元
                </button>
                <input
                  ref={backupInputRef}
                  type="file"
                  accept=".json,application/json"
                  hidden
                  onChange={event => {
                    const file = event.target.files?.[0];
                    if (file) void handleImportCampusSettings(file);
                  }}
                />
              </div>
            </div>
            <TeacherConfig
              key={activeCampusId}
              teachers={sortOrder}
              excludedTeachers={excludedTeachers}
              onToggleExclude={toggleExclude}
              onUpdateOrder={setSortOrder}
              specialRules={specialRules}
              onUpdateRules={handleUpdateSpecialRules}
              onImportTeachers={handleImportTeachers}
              candidates={specialCandidates}
              onConfirmCandidates={handleConfirmSpecial}
              onDismissCandidates={() => setSpecialCandidates([])}
              sheetComments={sheetComments}
              onUpdateComments={setSheetComments}
              onScanRules={handleScanRules}
              onResetSort={handleResetSort}
              teacherOptions={distinctTeachers}
              studentOptions={distinctStudents}
              subjectOptions={distinctSubjects}
              rawRecords={rawRecords}
              onUpdateRecords={(newData: AttendanceRecord[]) => {
                setRawRecords(newData);
                processTransformation(newData, true);
              }}
            />
          </section>
        )}

        {generatedData.length === 0 ? (
          <section className="hero-card">
            <div className="hero-content">
              <div className="hero-copy">
                <p className="eyebrow"><Sparkles size={14} /> MONTHLY WORK SUMMARY</p>
                <h2>月末の集計を、<br /><span>整える時間へ。</span></h2>
                <p className="hero-description">
                  指導報告書を読み込み、勤務時間の確認から講師別Excel・PDFの作成まで。
                  毎月の作業を、迷いのない流れに整えます。
                </p>
                <div className="hero-benefits" aria-label="主な機能">
                  <span><ShieldCheck size={16} /> 入力ミスを確認</span>
                  <span><Clock3 size={16} /> 授業時間を自動集計</span>
                </div>
              </div>
              <div className="import-stack">
                <ComiruAutoImport
                  key={activeCampusId}
                  onFileSelect={handleFileSelect}
                  isProcessing={isProcessing}
                  campusId={activeCampusId}
                  campusName={activeCampus.name}
                  comiruTenant={comiruTenant}
                  onImportingChange={setIsComiruImporting}
                />
                <div className="import-divider" aria-hidden="true"><span>または手動で</span></div>
                <DropZone onFileSelect={handleFileSelect} isProcessing={isProcessing} />
              </div>
            </div>

            <div className="hero-visual">
              <img src={heroImage} alt="整然としたデスクで勤務表を確認する様子" />
              <div className="hero-photo-shade" />
              <div className="hero-photo-note">
                <span className="note-icon"><CheckCircle size={16} /></span>
                <div>
                  <small>READY WHEN YOU ARE</small>
                  <strong>CSVひとつで、集計を開始</strong>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className="results-section animate-in fade-in duration-500">
            <div className="results-toolbar">
              <button onClick={() => { setGeneratedData([]); setRawRecords([]); }} className="text-link">
                ← 別のCSVを読み込む
              </button>

              <button
                onClick={() => setShowModal(true)}
                className={`review-button ${(errorIndices.length > 0 || warnIndices.length > 0) ? 'needs-review' : ''}`}
              >
                <span className="flex gap-1">
                  {errorIndices.length > 0 && <span className="text-red-600 flex items-center gap-0.5"><AlertTriangle size={14} /> {errorIndices.length}</span>}
                  {warnIndices.length > 0 && <span className="text-amber-600 flex items-center gap-0.5"><AlertTriangle size={14} /> {warnIndices.length}</span>}
                  {errorIndices.length === 0 && warnIndices.length === 0 && <CheckCircle size={15} className="text-emerald-600" />}
                </span>
                データを確認・修正
              </button>
            </div>
            <Dashboard
              generatedData={generatedData}
              teacherStats={teacherStats}
              teacherSortOrder={sortOrder}
              onDownloadExcel={handleDownloadExcel}
              onDownloadCsv={handleDownloadCsv}
              onDownloadTemplate={handleDownloadTemplate}
            />
          </section>
        )}

        <ExcelPdfDropZone />
      </main>

      <footer className="app-footer">
        <span>Re:Act</span>
        <p>月次業務を、正確に、心地よく。</p>
      </footer>

      <FixDataModal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setIsProcessing(false); }}
        data={rawRecords}
        errorIndices={errorIndices}
        warnIndices={warnIndices}
        onApply={handleModalApply}
      />
    </div>
  );
}

export default App;
