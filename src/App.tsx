import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { Settings } from 'lucide-react';
import type { AttendanceRecord, GeneratedData, TeacherStats, ThemeType } from './types';
import { parseCSV, INPUT_COL } from './utils/parser';
import { transformData, checkDataQuality, DEFAULT_TEACHER_ORDER, sortData } from './utils/transformer';
import { exportToExcel, OUTPUT_HEADER } from './utils/exporter';
import { DropZone } from './components/DropZone';
import { TeacherConfig } from './components/TeacherConfig';
import { Dashboard } from './components/Dashboard';
import { FixDataModal } from './components/FixDataModal';

function App() {
  // State
  const [rawRecords, setRawRecords] = useState<AttendanceRecord[]>([]);
  const [generatedData, setGeneratedData] = useState<GeneratedData[]>([]);
  const [teacherStats, setTeacherStats] = useState<Record<string, TeacherStats>>({});

  // Config
  const [sortOrder, setSortOrder] = useState<string[]>([]);
  const [excludedTeachers, setExcludedTeachers] = useState<string[]>([]);
  const [theme, setTheme] = useState<ThemeType>('modern');

  // UI State
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfig, setShowConfig] = useState(true); // Always show initially
  const [showModal, setShowModal] = useState(false);
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

  // Re-transform when config changes if we have data
  useEffect(() => {
    if (rawRecords.length > 0) {
      const timer = setTimeout(() => processTransformation(rawRecords, true), 100);
      return () => clearTimeout(timer);
    }
  }, [excludedTeachers, sortOrder]);


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
    processTransformation(updatedData);
  };

  const handleDownloadExcel = () => {
    exportToExcel(generatedData, teacherStats, sortOrder, theme);
  };

  const handleDownloadCsv = () => {
    const clean = generatedData.map(({ _isError, _isManuallyFixed, _classType, ...r }) => r);
    const csv = Papa.unparse({ fields: OUTPUT_HEADER, data: clean });
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '勤務集計.csv'; a.click();
  };

  const handleDownloadTemplate = () => {
    alert("テンプレートダウンロードは実装中です。");
  };

  const handleResetSort = () => {
    if (window.confirm('講師の並び順を初期化しますか？')) {
      setSortOrder([...DEFAULT_TEACHER_ORDER]);
    }
  };

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
  }

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
              sortOrder={sortOrder} setSortOrder={setSortOrder}
              excludedTeachers={excludedTeachers} setExcludedTeachers={setExcludedTeachers}
              currentTheme={theme} setTheme={setTheme}
              onResetSort={handleResetSort}
              onImportTeachers={handleImportTeachers}
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
