import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Loader2, TrendingUp, AlertCircle, Building2 } from 'lucide-react';
import { searchStocks, type StockSearchResult } from '../services/api';

interface StockSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSymbol: (symbol: string, name?: string) => void;
  currentSymbol: string;
}

export const StockSearchModal: React.FC<StockSearchModalProps> = ({
  isOpen,
  onClose,
  onSelectSymbol,
  currentSymbol,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadResults = useCallback(async (q: string) => {
    setIsLoading(true);
    setError(null);

    const controller = new AbortController();

    try {
      const data = await searchStocks(q, controller.signal);
      setResults(data);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.detail || err.message || 'Failed to search stocks');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Debounced search effect (instant for empty query on open)
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(
      () => {
        loadResults(query);
      },
      query ? 280 : 0
    );

    return () => clearTimeout(timer);
  }, [query, isOpen, loadResults]);

  const handleClose = () => {
    setQuery('');
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={handleClose}
    >
      <div
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="p-4 border-b border-slate-800 flex items-center gap-3 bg-slate-950/60">
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Indian stocks by symbol or company (e.g., TCS, RELIANCE, INFY)..."
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
          />
          {isLoading && <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0" />}
          <button
            onClick={handleClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 divide-y divide-slate-800/60">
          {error && (
            <div className="p-4 text-center text-xs text-rose-400 flex items-center justify-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!isLoading && !error && results.length === 0 && (
            <div className="p-8 text-center text-xs text-slate-400 space-y-2">
              <Building2 className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="font-medium text-slate-300">
                No matching Indian stocks found for &quot;{query}&quot;
              </p>
              <p className="text-[11px] text-slate-500">
                Try searching for verified symbols like RELIANCE.NS, TCS.NS, INFY.NS, or HDFCBANK.NS.
              </p>
            </div>
          )}

          {results.map((stock) => {
            const isSelected = stock.symbol === currentSymbol;
            return (
              <div
                key={stock.symbol}
                onClick={() => {
                  onSelectSymbol(stock.symbol, stock.name);
                  onClose();
                }}
                className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-blue-600/20 border border-blue-500/40 text-white'
                    : 'hover:bg-slate-800/70 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300 font-bold text-xs border border-slate-700">
                    {stock.exchange}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-white tracking-wide">
                        {stock.symbol}
                      </span>
                      {isSelected && (
                        <span className="text-[10px] bg-blue-500/30 text-blue-300 px-1.5 py-0.2 rounded font-medium">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate max-w-sm">
                      {stock.name}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-medium">
                    {stock.sector || 'Equities'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="p-3 bg-slate-950/80 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
            <span>Search supported on National Stock Exchange (NSE) & BSE</span>
          </div>
          <span>ESC to close</span>
        </div>
      </div>
    </div>
  );
};
