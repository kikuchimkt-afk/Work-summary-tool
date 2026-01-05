import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface SearchableSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: string[];
    placeholder?: string;
    className?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
    value, onChange, options, placeholder = "選択してください", className = ""
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    // Filter options based on search, respecting separator lines
    // Separators (starting with ---) should be always visible if they bracket matching items?
    // Simply filtering separators out if they don't match is bad UX.
    // For now, simple includes filter, but let's be smart about separators.

    // Filtering logic moved to displayOptions below

    // Cleanup separators: Remove separators that have no children following them or are adjacent to other separators?
    // That's complex. Let's just fitler normal items. Headers keep if they match OR if we are showing all?
    // Let's stick to standard behavior: If user types, filtering happens. Headers might look weird if empty.
    // Enhanced logic: Keep headers only if at least one item in that group matches.
    const displayOptions = (() => {
        if (!searchTerm) return options;
        const matches: string[] = [];
        let currentHeader: string | null = null;
        let headerHasMatch = false;

        options.forEach(opt => {
            if (opt.startsWith('---')) {
                // If previous header had matches, it's already added.
                // If not, we drop it (unless it matched itself, which replaces logic)
                currentHeader = opt;
                headerHasMatch = false;
            } else {
                if (opt.toLowerCase().includes(searchTerm.toLowerCase())) {
                    if (currentHeader && !headerHasMatch) {
                        matches.push(currentHeader);
                        headerHasMatch = true;
                    }
                    matches.push(opt);
                }
            }
        });
        return matches;
    })();


    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (option: string) => {
        if (option.startsWith('---')) return; // Ignore separators
        onChange(option);
        setIsOpen(false);
        setSearchTerm('');
    };

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            <div
                className="relative flex items-center w-full"
                onClick={() => setIsOpen(!isOpen)}
            >
                <input
                    type="text"
                    value={isOpen ? searchTerm : value}
                    onChange={e => {
                        setSearchTerm(e.target.value);
                        if (!isOpen) setIsOpen(true);
                    }}
                    placeholder={placeholder}
                    className="w-full p-2 pr-8 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 bg-white text-gray-900 cursor-text"
                    style={{ colorScheme: 'light' }}
                />
                <div className="absolute right-2 text-gray-400 pointer-events-none">
                    <ChevronDown size={16} />
                </div>
            </div>

            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
                    {displayOptions.length === 0 ? (
                        <div className="p-3 text-sm text-gray-400 text-center">該当なし</div>
                    ) : (
                        displayOptions.map((opt, i) => {
                            const isHeader = opt.startsWith('---');
                            return (
                                <div
                                    key={i}
                                    className={`px-3 py-2 text-sm cursor-pointer flex justify-between items-center
                                        ${isHeader
                                            ? 'bg-gray-100 text-gray-500 font-bold text-xs pointer-events-none border-y border-gray-100'
                                            : 'hover:bg-blue-50 text-gray-800'
                                        }
                                        ${value === opt ? 'bg-blue-50 text-blue-700' : ''}
                                    `}
                                    onClick={() => handleSelect(opt)}
                                >
                                    <span>{opt.replace(/---/g, '').trim()}</span>
                                    {!isHeader && value === opt && <Check size={14} />}
                                </div>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
};
