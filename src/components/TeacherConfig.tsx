import React, { useState, useEffect } from 'react';
import type { DropResult } from '@hello-pangea/dnd';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { GripVertical, RotateCcw, Search, Settings2, Users, UserX, ListChecks, MessageSquare, X, Trash2 } from 'lucide-react';
import { SearchableSelect } from './ui/SearchableSelect';
import type { SpecialClassRule } from '../types';
import type { AttendanceRecord } from '../types';
import { SpecialCandidateList } from './SpecialCandidateList';
import type { SpecialCandidate } from './SpecialCandidateList';
import { CommentManager } from './CommentManager';

interface TeacherConfigProps {
    teachers: string[]; // Sorted list
    excludedTeachers: string[];
    onToggleExclude: (name: string) => void;
    onUpdateOrder: (order: string[]) => void;
    specialRules: SpecialClassRule[];
    onUpdateRules: (rules: SpecialClassRule[]) => void;
    onImportTeachers: () => void;
    candidates: SpecialCandidate[];
    onConfirmCandidates: (results: { index: number, isSpecial: boolean }[]) => void;
    onDismissCandidates: () => void;
    sheetComments: Record<string, string>;
    onUpdateComments: (comments: Record<string, string>) => void;
    onScanRules: () => void;
    onResetSort: () => void;
    teacherOptions?: string[];
    studentOptions?: string[];
    subjectOptions?: string[];
    rawRecords: AttendanceRecord[];
    onUpdateRecords: (records: AttendanceRecord[]) => void;
}

type TabType = 'sort' | 'exclude' | 'rules' | 'deletions' | 'candidates' | 'comments' | 'applied';

export const TeacherConfig: React.FC<TeacherConfigProps> = ({
    teachers, excludedTeachers, onToggleExclude,
    onUpdateOrder,
    specialRules, onUpdateRules,
    onImportTeachers,
    candidates, onConfirmCandidates, onDismissCandidates,
    sheetComments, onUpdateComments, onScanRules, onResetSort,
    teacherOptions = [], studentOptions = [], subjectOptions = [],
    rawRecords, onUpdateRecords
}) => {
    const [activeTab, setActiveTab] = useState<TabType>('sort');
    const [newExTeacher, setNewExTeacher] = useState('');

    // Rule State
    const [ruleStudent, setRuleStudent] = useState('');
    const [ruleTeacher, setRuleTeacher] = useState('');
    const [ruleSubject, setRuleSubject] = useState('');

    // Deletion State
    const [delStudent, setDelStudent] = useState('');
    const [delTeacher, setDelTeacher] = useState('');
    const [delSubject, setDelSubject] = useState('');

    // Auto-switch to candidates
    useEffect(() => {
        if (candidates.length > 0) setActiveTab('candidates');
    }, [candidates.length]);

    const handleDragEnd = (result: DropResult) => {
        if (!result.destination) return;
        const items = Array.from(teachers);
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);
        onUpdateOrder(items);
    };

    const handleAddRule = () => {
        if (!ruleStudent && !ruleTeacher && !ruleSubject) return;
        const newRule: SpecialClassRule = {
            id: Date.now().toString(),
            student: ruleStudent,
            teacher: ruleTeacher,
            subject: ruleSubject
        };
        onUpdateRules([...specialRules, newRule]);
        setRuleStudent('');
        setRuleTeacher('');
        setRuleSubject('');
    };

    const handleDeleteRule = (id: string) => {
        onUpdateRules(specialRules.filter(r => r.id !== id));
    };

    const displayTeachers = teachers;

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[600px]">
            {/* Tab Navigation */}
            <div className="flex border-b border-gray-200 overflow-x-auto">
                <button
                    onClick={() => setActiveTab('sort')}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${activeTab === 'sort' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                    <Users size={16} />
                    並び順
                </button>
                <button
                    onClick={() => setActiveTab('exclude')}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${activeTab === 'exclude' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                    <UserX size={16} />
                    除外
                    {excludedTeachers.length > 0 && (
                        <span className="bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded-full text-xs">{excludedTeachers.length}</span>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('rules')}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${activeTab === 'rules' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                    <Settings2 size={16} />
                    ルール
                </button>
                <button
                    onClick={() => setActiveTab('deletions')}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${activeTab === 'deletions' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                    <Trash2 size={16} />
                    手動削除
                </button>
                <button
                    onClick={() => setActiveTab('candidates')}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${activeTab === 'candidates' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                    <ListChecks size={16} />
                    要確認
                    {candidates.length > 0 && (
                        <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full text-xs animate-pulse">{candidates.length}</span>
                    )}
                </button>

                <button
                    onClick={() => setActiveTab('applied')}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${activeTab === 'applied' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                    <ListChecks size={16} />
                    適用済み
                </button>
                <button
                    onClick={() => setActiveTab('comments')}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${activeTab === 'comments' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                    <MessageSquare size={16} />
                    コメント
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-4">
                {activeTab === 'sort' && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="font-semibold text-gray-700">表示順設定</h3>
                            <p className="text-xs text-gray-500 mt-1">Excel出力時および画面表示時の講師の並び順を設定します。ドラッグ&ドロップで並べ替えが可能です。</p>
                            <div className="flex gap-2">
                                <button onClick={onResetSort} className="text-xs flex items-center gap-1 text-gray-500 hover:bg-gray-100 px-2 py-1 rounded border border-gray-300">
                                    <RotateCcw size={14} />
                                    デフォルトに戻す
                                </button>
                                <button onClick={onImportTeachers} className="text-xs flex items-center gap-1 text-blue-600 hover:bg-blue-50 px-2 py-1 rounded">
                                    <RotateCcw size={14} />
                                    更新
                                </button>
                            </div>
                        </div>
                        <DragDropContext onDragEnd={handleDragEnd}>
                            <Droppable droppableId="teachers">
                                {(provided) => (
                                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                                        {displayTeachers.map((teacher, index) => (
                                            <Draggable key={teacher} draggableId={teacher} index={index}>
                                                {(provided, snapshot) => (
                                                    <div
                                                        ref={provided.innerRef}
                                                        {...provided.draggableProps}
                                                        className={`flex items - center gap - 3 p - 3 bg - white border rounded shadow - sm ${snapshot.isDragging ? 'shadow-md border-blue-400' : 'border-gray-200'} ${excludedTeachers.includes(teacher) ? 'opacity-50 bg-gray-50' : ''} `}
                                                    >
                                                        <div {...provided.dragHandleProps} className="text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing">
                                                            <GripVertical size={18} />
                                                        </div>
                                                        <span className="flex-1 font-medium text-gray-700">{teacher}</span>
                                                        <button
                                                            onClick={() => onToggleExclude(teacher)}
                                                            className={`p - 1.5 rounded transition - colors ${excludedTeachers.includes(teacher) ? 'bg-gray-200 text-gray-600' : 'text-gray-400 hover:bg-red-50 hover:text-red-500'} `}
                                                            title={excludedTeachers.includes(teacher) ? "除外を解除" : "集計から除外"}
                                                        >
                                                            <UserX size={16} />
                                                        </button>
                                                    </div>
                                                )}
                                            </Draggable>
                                        ))}
                                        {provided.placeholder}
                                    </div>
                                )}
                            </Droppable>
                        </DragDropContext>
                    </div>
                )}

                {activeTab === 'exclude' && (
                    <div className="space-y-4">
                        <h3 className="font-semibold text-gray-700">除外講師設定</h3>
                        <p className="text-xs text-gray-500 mb-2">集計から完全に除外したい講師を登録します。退職者や集計不要な講師をここで管理できます。</p>
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <SearchableSelect
                                    value={newExTeacher}
                                    onChange={setNewExTeacher}
                                    options={teacherOptions}
                                    placeholder="講師名を入力..."
                                    className="w-full"
                                />
                            </div>
                            <button
                                onClick={() => { if (newExTeacher) { onToggleExclude(newExTeacher); setNewExTeacher(''); } }}
                                className="px-3 py-2 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 whitespace-nowrap"
                            >
                                追加
                            </button>
                        </div>
                        <div className="space-y-2">
                            {excludedTeachers.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-4">除外設定された講師はいません</p>
                            ) : (
                                excludedTeachers.map(t => (
                                    <div key={t} className="flex justify-between items-center p-3 bg-red-50 border border-red-100 rounded text-red-700">
                                        <span>{t}</span>
                                        <button onClick={() => onToggleExclude(t)} className="p-1 hover:bg-red-200 rounded">
                                            <X size={16} />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'rules' && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="font-semibold text-gray-700">1:2特能, 1:1特能 自動判定ルール</h3>
                            <p className="text-xs text-gray-500 mt-1">特定の生徒・講師・科目の組み合わせを自動的に「1:2特能」または「1:1特能」として判定するルールを設定します。</p>
                            <button
                                onClick={onScanRules}
                                className="text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded flex items-center gap-1 shadow"
                            >
                                <Search size={12} />
                                適用をスキャン
                            </button>
                        </div>
                        <div className="grid gap-3 bg-gray-50 p-3 rounded border border-gray-200">
                            <SearchableSelect
                                value={ruleStudent}
                                onChange={setRuleStudent}
                                options={studentOptions}
                                placeholder="生徒名 (部分一致)"
                            />
                            <SearchableSelect
                                value={ruleTeacher}
                                onChange={setRuleTeacher}
                                options={teacherOptions}
                                placeholder="講師名 (部分一致)"
                            />
                            <SearchableSelect
                                value={ruleSubject}
                                onChange={setRuleSubject}
                                options={subjectOptions}
                                placeholder="科目 (部分一致)"
                            />

                            <button onClick={handleAddRule} disabled={!ruleStudent && !ruleTeacher && !ruleSubject} className="w-full py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">ルールを追加</button>
                        </div>
                        <div className="space-y-2">
                            {specialRules.map(rule => (
                                <div key={rule.id} className="bg-white p-3 border rounded shadow-sm text-sm relative group">
                                    <button onClick={() => handleDeleteRule(rule.id)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <X size={16} />
                                    </button>
                                    <div className="grid grid-cols-[auto,1fr] gap-x-2 gap-y-1">
                                        {rule.student && <><span className="text-gray-500">生徒:</span><span className="font-medium">{rule.student}</span></>}
                                        {rule.teacher && <><span className="text-gray-500">講師:</span><span className="font-medium">{rule.teacher}</span></>}
                                        {rule.subject && <><span className="text-gray-500">科目:</span><span className="font-medium">{rule.subject}</span></>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'deletions' && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="font-semibold text-gray-700">手動授業削除</h3>
                            <p className="text-xs text-gray-500 mt-1">集計不要な授業を検索して削除します。（削除後は元に戻せません）</p>
                        </div>
                        <div className="grid gap-3 bg-gray-50 p-3 rounded border border-gray-200">
                            <SearchableSelect
                                value={delStudent}
                                onChange={setDelStudent}
                                options={studentOptions}
                                placeholder="生徒名 (部分一致)"
                            />
                            <SearchableSelect
                                value={delTeacher}
                                onChange={setDelTeacher}
                                options={teacherOptions}
                                placeholder="講師名 (部分一致)"
                            />
                            <SearchableSelect
                                value={delSubject}
                                onChange={setDelSubject}
                                options={subjectOptions}
                                placeholder="科目 (部分一致)"
                            />
                        </div>
                        <div className="space-y-2">
                            {(!delStudent && !delTeacher && !delSubject) ? (
                                <p className="text-center text-gray-400 py-8">検索条件を入力してください</p>
                            ) : (
                                <div className="border rounded bg-white overflow-hidden max-h-96 overflow-y-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-gray-100 font-medium border-b sticky top-0">
                                            <tr>
                                                <th className="p-2">日付</th>
                                                <th className="p-2">講師</th>
                                                <th className="p-2">生徒</th>
                                                <th className="p-2">科目</th>
                                                <th className="p-2 text-center">削除</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y relative">
                                            {rawRecords.filter(r => {
                                                const isValidFilter = (val: string) => val && !val.includes('---');
                                                if (isValidFilter(delStudent) && !(r['生徒氏名'] || '').includes(delStudent)) return false;
                                                if (isValidFilter(delTeacher) && !(r['書いた先生'] || '').includes(delTeacher)) return false;
                                                if (isValidFilter(delSubject) && !(r['科目'] || '').includes(delSubject)) return false;
                                                return true;
                                            }).map((r, i) => {
                                                const dateStr = r['授業開始時間']?.split(' ')[0] || '';
                                                let dayOfWeek = '';
                                                if (r['授業開始時間']) {
                                                    const d = new Date(r['授業開始時間']);
                                                    if (!isNaN(d.getTime())) {
                                                        const days = ['日', '月', '火', '水', '木', '金', '土'];
                                                        dayOfWeek = `(${days[d.getDay()]})`;
                                                    }
                                                }
                                                return (
                                                    <tr key={i} className="hover:bg-red-50 group">
                                                        <td className="p-2">{dateStr} <span className="text-gray-500 text-xs">{dayOfWeek}</span></td>
                                                        <td className="p-2">{r['書いた先生']}</td>
                                                        <td className="p-2">{r['生徒氏名']}</td>
                                                        <td className="p-2">{r['科目']}</td>
                                                        <td className="p-2 text-center">
                                                            <button
                                                                onClick={() => {
                                                                    const idx = rawRecords.indexOf(r);
                                                                    if (idx !== -1) {
                                                                        const newData = [...rawRecords];
                                                                        newData.splice(idx, 1);
                                                                        onUpdateRecords(newData);
                                                                    }
                                                                }}
                                                                className="text-gray-400 hover:text-red-600 p-1 rounded hover:bg-red-100"
                                                                title="この授業を削除"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'candidates' && (
                    <div className="space-y-4">
                        <div>
                            <h3 className="font-semibold text-gray-700">要確認リスト</h3>
                            <p className="text-xs text-gray-500 mt-1">1:2特または1:1特が適用される可能性がある授業の候補です（生徒1名など）。手動で確認し、必要に応じて特能扱いとして確定してください。</p>
                        </div>
                        <SpecialCandidateList
                            candidates={candidates}
                            onConfirm={onConfirmCandidates}
                            onDismissAll={onDismissCandidates}
                        />
                    </div>
                )}

                {activeTab === 'applied' && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="font-semibold text-gray-700">特能適用済みリスト (編集可)</h3>
                            <p className="text-xs text-gray-500 mt-1">現在、手動またはルールによって「特能」として処理されている授業の一覧です。ここから解除も可能です。</p>
                        </div>
                        {/* Applied List Editor */}
                        <div className="border rounded bg-white overflow-hidden">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-100 font-medium border-b">
                                    <tr>
                                        <th className="p-2">日付</th>
                                        <th className="p-2">講師</th>
                                        <th className="p-2">生徒</th>
                                        <th className="p-2">科目</th>
                                        <th className="p-2 text-center">特能解除</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {rawRecords && rawRecords.map((r, i) => {
                                        if (!r._forceSpecial) return null;
                                        return (
                                            <tr key={i} className="hover:bg-gray-50">
                                                <td className="p-2">{r['授業開始時間']?.split(' ')[0]}</td>
                                                <td className="p-2">{r['書いた先生']}</td>
                                                <td className="p-2">{r['生徒氏名']}</td>
                                                <td className="p-2">{r['科目']}</td>
                                                <td className="p-2 text-center">
                                                    <button
                                                        onClick={() => {
                                                            const newData = [...rawRecords];
                                                            newData[i] = { ...newData[i], _forceSpecial: false, _specialConfirmed: false };
                                                            onUpdateRecords(newData);
                                                        }}
                                                        className="text-red-600 hover:text-red-800 hover:bg-red-100 p-1 rounded"
                                                        title="特能指定を解除"
                                                    >
                                                        <X size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {rawRecords && !rawRecords.some(r => r._forceSpecial) && (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center text-gray-400">
                                                特能として指定されている授業はありません
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="flex justify-end">
                            <button
                                onClick={onImportTeachers} // Re-using update trigger or we can add specific one
                                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 shadow-sm"
                            >
                                集計を更新
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === 'comments' && (
                    <div className="space-y-4">
                        <div>
                            <h3 className="font-semibold text-gray-700">コメント管理</h3>
                            <p className="text-xs text-gray-500 mt-1">Excel出力時に各講師のシート上部に表示するコメント（連絡事項など）を設定します。</p>
                        </div>
                        <CommentManager
                            teachers={teachers}
                            comments={sheetComments}
                            onUpdateComments={onUpdateComments}
                        />
                    </div>
                )}
            </div>
        </div >
    );
};
