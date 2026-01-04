import React, { useState } from 'react';
import type { DropResult } from '@hello-pangea/dnd';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { X, Plus, GripVertical } from 'lucide-react';
import type { ThemeType } from '../types';

interface TeacherConfigProps {
    sortOrder: string[];
    setSortOrder: (order: string[]) => void;
    excludedTeachers: string[];
    setExcludedTeachers: (teachers: string[]) => void;
    currentTheme: ThemeType;
    setTheme: (theme: ThemeType) => void;
    onResetSort: () => void;
    onImportTeachers: () => void;
}

export const TeacherConfig: React.FC<TeacherConfigProps> = ({
    sortOrder, setSortOrder,
    excludedTeachers, setExcludedTeachers,
    currentTheme, setTheme,
    onResetSort, onImportTeachers
}) => {
    const [manualName, setManualName] = useState('');

    const handleDragEnd = (result: DropResult) => {
        if (!result.destination) return;
        const items = Array.from(sortOrder);
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);
        setSortOrder(items);
    };

    const addExcluded = () => {
        if (manualName && !excludedTeachers.includes(manualName)) {
            setExcludedTeachers([...excludedTeachers, manualName]);
            setManualName('');
        }
    };

    const removeExcluded = (name: string) => {
        setExcludedTeachers(excludedTeachers.filter(t => t !== name));
    };

    const removeSortItem = (name: string) => {
        setSortOrder(sortOrder.filter(t => t !== name));
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 w-full max-w-7xl mx-auto">
            {/* Sort Order */}
            <div className="bg-white rounded-lg shadow border border-gray-200 p-4 flex flex-col h-80">
                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                        講師の表示順序設定
                    </h2>
                    <div className="flex gap-2">
                        <button onClick={onResetSort} className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded border shadow-sm transition">
                            初期順に戻す
                        </button>
                        <button onClick={onImportTeachers} className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 px-2 py-1 rounded border border-blue-200 shadow-sm transition">
                            CSVから追加
                        </button>
                    </div>
                </div>
                <p className="text-xs text-gray-500 mb-2">ドラッグして並び替えられます。</p>

                <div className="flex-grow overflow-y-auto bg-gray-50 border border-gray-200 rounded p-2">
                    <DragDropContext onDragEnd={handleDragEnd}>
                        <Droppable droppableId="teachers">
                            {(provided) => (
                                <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-1">
                                    {sortOrder.map((teacher, index) => (
                                        <Draggable key={teacher} draggableId={teacher} index={index}>
                                            {(provided, snapshot) => (
                                                <div
                                                    ref={provided.innerRef}
                                                    {...provided.draggableProps}
                                                    {...provided.dragHandleProps}
                                                    className={`
                                                        flex justify-between items-center p-2 bg-white border rounded text-xs
                                                        ${snapshot.isDragging ? 'shadow-lg ring-2 ring-blue-400' : 'border-gray-200'}
                                                    `}
                                                >
                                                    <span className="flex items-center gap-2">
                                                        <GripVertical className="w-3 h-3 text-gray-400" />
                                                        {teacher}
                                                    </span>
                                                    <button onClick={() => removeSortItem(teacher)} className="text-gray-400 hover:text-red-500">
                                                        <X className="w-3 h-3" />
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
            </div>

            {/* Config & Exclusion */}
            <div className="bg-white rounded-lg shadow border border-gray-200 p-4 flex flex-col h-80">
                <h2 className="text-sm font-bold text-gray-700 mb-2">個別指導(1:2) 対象外講師</h2>
                <div className="flex gap-2 mb-2">
                    <input
                        type="text"
                        value={manualName}
                        onChange={e => setManualName(e.target.value)}
                        placeholder="講師名を入力"
                        className="flex-1 text-sm border border-gray-300 rounded px-2 py-1"
                        onKeyDown={e => e.key === 'Enter' && addExcluded()}
                    />
                    <button onClick={addExcluded} className="bg-gray-600 hover:bg-gray-700 text-white text-xs px-3 py-1 rounded flex items-center gap-1 transition">
                        <Plus className="w-3 h-3" /> 追加
                    </button>
                </div>

                <div className="flex-grow overflow-y-auto content-start flex flex-wrap gap-2 mb-4">
                    {excludedTeachers.map(name => (
                        <span key={name} className="inline-flex items-center px-2 py-1 rounded text-xs bg-orange-100 text-orange-800 border border-orange-200 h-fit">
                            {name}
                            <button onClick={() => removeExcluded(name)} className="ml-1 text-orange-500 hover:text-orange-700">
                                <X className="w-3 h-3" />
                            </button>
                        </span>
                    ))}
                </div>

                <div className="mt-auto pt-4 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-bold text-gray-500">出力デザイン:</label>
                        <select
                            value={currentTheme}
                            onChange={(e) => setTheme(e.target.value as ThemeType)}
                            className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                        >
                            <option value="modern">A: モダン・ブルー</option>
                            <option value="minimal">B: ミニマル</option>
                            <option value="standard">C: スタンダード</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    );
};
