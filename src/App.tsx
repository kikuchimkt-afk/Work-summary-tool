import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { Settings, AlertTriangle, CheckCircle } from 'lucide-react';
import type { AttendanceRecord, GeneratedData, TeacherStats, ThemeType, SpecialClassRule } from './types';
import { parseCSV, INPUT_COL } from './utils/parser';
import { transformData, checkDataQuality, sortData } from './utils/transformer';
import { exportToExcel, DATA_KEYS } from './utils/exporter';
import { DropZone } from './components/DropZone';
import { TeacherConfig } from './components/TeacherConfig';
import { Dashboard } from './components/Dashboard';
import { FixDataModal } from './components/FixDataModal';
import type { SpecialCandidate } from './components/SpecialCandidateList';

function App() {
  // State
  const [rawRecords, setRawRecords] = useState<AttendanceRecord[]>([]);
  const [generatedData, setGeneratedData] = useState<GeneratedData[]>([]);
  const [teacherStats, setTeacherStats] = useState<Record<string, TeacherStats>>({});

  // Config
  const [sortOrder, setSortOrder] = useState<string[]>([]);
  const [excludedTeachers, setExcludedTeachers] = useState<string[]>([]);
  const [specialRules, setSpecialRules] = useState<SpecialClassRule[]>([]);
  const [theme, setTheme] = useState<ThemeType>('modern');
  const [sheetComments, setSheetComments] = useState<Record<string, string>>({});

  // UI State
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfig, setShowConfig] = useState(true); // Always show initially
  const [showModal, setShowModal] = useState(false);
  const [specialCandidates, setSpecialCandidates] = useState<SpecialCandidate[]>([]);
  const [errorIndices, setErrorIndices] = useState<number[]>([]);
  const [warnIndices, setWarnIndices] = useState<number[]>([]);
  const [msg, setMsg] = useState<{ type: 'info' | 'error' | 'success', text: string } | null>(null);

  // Initial Load
  useEffect(() => {
    try {
      const savedEx = localStorage.getItem('schedule_excluded');
      if (savedEx) setExcludedTeachers(JSON.parse(savedEx));

      const savedSort = localStorage.getItem('schedule_sort_v2');
      if (savedSort) setSortOrder(JSON.parse(savedSort));
      else setSortOrder([...DEFAULT_TEACHER_ORDER]);

      const savedTheme = localStorage.getItem('schedule_theme');
      if (savedTheme) setTheme(savedTheme as ThemeType);

      const savedRules = localStorage.getItem('schedule_special_rules');
      if (savedRules) setSpecialRules(JSON.parse(savedRules));

      const savedComments = localStorage.getItem('schedule_comments');
      if (savedComments) setSheetComments(JSON.parse(savedComments));

    } catch (e) {
      console.error("Failed to load config", e);
      setSortOrder([...DEFAULT_TEACHER_ORDER]);
    }
  }, []);

  // Persist Config
  useEffect(() => {
    localStorage.setItem('schedule_excluded', JSON.stringify(excludedTeachers));
  }, [excludedTeachers]);

  useEffect(() => {
    localStorage.setItem('schedule_sort_v2', JSON.stringify(sortOrder));
  }, [sortOrder]);

  useEffect(() => {
    localStorage.setItem('schedule_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('schedule_special_rules', JSON.stringify(specialRules));
  }, [specialRules]);

  useEffect(() => {
    localStorage.setItem('schedule_comments', JSON.stringify(sheetComments));
  }, [sheetComments]);

  // Re-transform when config changes if we have data
  useEffect(() => {
    if (rawRecords.length > 0) {
      const timer = setTimeout(() => processTransformation(rawRecords, true), 100);
      return () => clearTimeout(timer);
    }
  }, [excludedTeachers, sortOrder, specialRules]);


  const handleFileSelect = async (file: File, encoding: string) => {
    setIsProcessing(true);
    setMsg({ type: 'info', text: '解析中...' });
    setGeneratedData([]);

    try {
      console.log('Starting CSV parse for file:', file.name, 'Encoding:', encoding);
      const data = await parseCSV(file, encoding);
      console.log('Parsed data rows:', data.length);
      if (data.length > 0) {
        console.log('Detected headers:', Object.keys(data[0]));
      }

      setRawRecords(data);

      // Update sort order with new teachers
      const newTeachers = new Set(data.map(r => r[INPUT_COL.TEACHER]).filter(Boolean));
      let updatedSort = [...sortOrder];
      let changed = false;

      newTeachers.forEach(t => {
        if (!updatedSort.includes(t)) {
          updatedSort.push(t);
          changed = true;
        }
      });

      if (changed) {
        setSortOrder(updatedSort);
      }

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
        setMsg({ type: 'success', text: `読み込み完了: ${data.length}行` });
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
    setRawRecords(updatedData);

    // Re-check quality to update warnings/errors in the modal
    const { errorIndices: errs, warnIndices: warns } = checkDataQuality(updatedData);
    setErrorIndices(errs);
    setWarnIndices(warns);

    processTransformation(updatedData);
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
    const newTeachers = new Set(rawRecords.map(r => r[INPUT_COL.TEACHER]).filter(Boolean));
    let updatedSort = [...sortOrder];
    let changed = false;
    newTeachers.forEach(t => {
      if (!updatedSort.includes(t)) {
        updatedSort.push(t);
        changed = true;
      }
    });
    if (changed) setSortOrder(updatedSort);
  };

  const toggleExclude = (name: string) => {
    setExcludedTeachers(prev =>
      prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name]
    );
  };

  // Special Rules Workflow
  const handleScanRules = () => {
    if (rawRecords.length === 0 || specialRules.length === 0) return;
    const candidates: { record: AttendanceRecord, index: number, rule: string }[] = [];

    setIsProcessing(true); // Show analyzing state (if desired, or use msg)
    setMsg({ type: 'info', text: '解析中...' });

    // Use setTimeout to allow UI update
    setTimeout(() => {
      try {
        rawRecords.forEach((row, i) => {
          if (row._specialConfirmed) return; // Already checked

          const t = row[INPUT_COL.TEACHER] || '';
          const s = row[INPUT_COL.STUDENT_NAME] || '';
          const sub = row[INPUT_COL.SUBJECT] || '';

          const match = specialRules.find(r =>
            (t.includes(r.teacher) || r.teacher === t) &&
            (s.includes(r.student) || s === r.student) &&
            (sub.includes(r.subject) || sub === r.subject)
          );

          if (match) {
            candidates.push({ record: row, index: i, rule: `${match.student} - ${match.teacher} - ${match.subject}` });
          }
        });

        if (candidates.length > 0) {
          setSpecialCandidates(candidates);
          // Auto-shown via list component
        } else {
          alert("新規に適用する特能授業は見つかりませんでした。");
        }
      } finally {
        setIsProcessing(false);
        setMsg(null);
      }
    }, 100);
  };

  const handleConfirmSpecial = (results: { index: number, isSpecial: boolean }[]) => {
    const newData = [...rawRecords];
    const processedIndices = new Set<number>();

    results.forEach(({ index, isSpecial }) => {
      newData[index] = { ...newData[index], _specialConfirmed: true, _forceSpecial: isSpecial };
      processedIndices.add(index);
    });

    setRawRecords(newData);
    setSpecialCandidates(prev => prev.filter(c => !processedIndices.has(c.index)));
    processTransformation(newData, true);
  };


  const DEFAULT_TEACHER_ORDER = [
    "吉川講師", "島田講師", "久保講師", "岸本講師", "岡講師", "三井講師",
    "長井講師", "千種講師", "田頭講師", "永岡講師", "山田講師",
    "大串講師", "高畠講師", "篠原講師"
  ];

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
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-800 font-sans">
      <header className="bg-gray-800 text-white p-4 shadow-md flex-shrink-0">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            勤務集計ツール Re:Act
          </h1>
          <button onClick={() => setShowConfig(!showConfig)} className="text-gray-300 hover:text-white">
            <Settings className="w-6 h-6" />
          </button>
        </div>
      </header>

      <main className="flex-grow p-6 flex flex-col gap-6 max-w-7xl mx-auto w-full">

        {msg && (
          <div className={`p-4 rounded-md shadow flex items-center gap-2 ${msg.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
            {msg.text}
          </div>
        )}

        {/* Config Area - Collapsible */}
        {showConfig && (
          <section className="animate-in slide-in-from-top-4 duration-300">
            <TeacherConfig
              teachers={sortOrder}
              excludedTeachers={excludedTeachers}
              onToggleExclude={toggleExclude}
              onUpdateOrder={setSortOrder}
              specialRules={specialRules}
              onUpdateRules={setSpecialRules}
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
                processTransformation(newData, true); // Recalculate stats
              }}
            />
          </section>
        )}

        {/* Main Action Area */}
        {generatedData.length === 0 ? (
          <section className="flex-grow flex flex-col justify-center">
            <DropZone onFileSelect={handleFileSelect} isProcessing={isProcessing} />
          </section>
        ) : (
          <section className="flex-grow flex flex-col animate-in fade-in duration-500">
            <div className="mb-4 flex justify-between items-center">
              <button onClick={() => { setGeneratedData([]); setRawRecords([]); }} className="text-sm text-gray-500 hover:text-gray-700 underline">
                ← ファイル選択に戻る
              </button>

              <button
                onClick={() => setShowModal(true)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium shadow-sm border ${(errorIndices.length > 0 || warnIndices.length > 0)
                  ? 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
              >
                <div className="flex gap-1">
                  {errorIndices.length > 0 && <span className="text-red-600 flex items-center gap-0.5"><AlertTriangle size={14} /> {errorIndices.length}</span>}
                  {warnIndices.length > 0 && <span className="text-yellow-600 flex items-center gap-0.5"><AlertTriangle size={14} /> {warnIndices.length}</span>}
                  {errorIndices.length === 0 && warnIndices.length === 0 && <CheckCircle size={14} className="text-green-500" />}
                </div>
                デー タ確認・修正
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
      </main>

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
