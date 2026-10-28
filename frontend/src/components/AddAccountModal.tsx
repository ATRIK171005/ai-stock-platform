import React, { useState } from 'react';
import { X, Briefcase, PlusCircle, AlertCircle, Loader2 } from 'lucide-react';
import { createNewAccount } from '../services/api';
import type { UserAccountItem } from '../types';

interface AddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newAccount: UserAccountItem) => void;
}

const PRESET_BALANCES = [50000, 100000, 250000, 500000, 1000000];

export const AddAccountModal: React.FC<AddAccountModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [name, setName] = useState('');
  const [initialBalance, setInitialBalance] = useState<number>(100000);
  const [isCustomBalance, setIsCustomBalance] = useState(false);
  const [customBalanceInput, setCustomBalanceInput] = useState('100000');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a portfolio name.');
      return;
    }

    const balance = isCustomBalance ? parseFloat(customBalanceInput) : initialBalance;
    if (isNaN(balance) || balance < 1000) {
      setError('Initial capital must be at least ₹1,000.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const resp = await createNewAccount({
        name: name.trim(),
        initial_balance: balance,
        currency: 'INR',
      });

      const mappedItem: UserAccountItem = {
        id: resp.id || 'new_account',
        name: resp.name || name.trim(),
        user_id: resp.user_id || 'user',
        initial_balance: resp.initial_balance,
        cash_balance: resp.cash_balance,
        total_equity: resp.total_equity,
        realized_pnl: resp.realized_pnl,
        open_positions_count: resp.open_positions_count,
        currency: resp.currency || 'INR',
        created_at: new Date().toISOString(),
      };

      onSuccess(mappedItem);
      onClose();
    } catch (err: any) {
      setError(err.detail || err.message || 'Failed to create new portfolio account.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header Bar */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Add New Trading Portfolio</h2>
              <p className="text-[11px] text-slate-400">
                Create an isolated account with custom starting capital
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-950/50 border border-rose-800/60 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Portfolio Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. NIFTY Momentum Fund, HFT Alpha"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Starting Virtual Capital (INR ₹)
            </label>
            <div className="grid grid-cols-3 gap-2 mb-2">
              {PRESET_BALANCES.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => {
                    setInitialBalance(amt);
                    setIsCustomBalance(false);
                  }}
                  className={`py-1.5 px-2 rounded-lg text-xs font-mono font-medium transition-all ${
                    !isCustomBalance && initialBalance === amt
                      ? 'bg-cyan-600 text-white border border-cyan-400'
                      : 'bg-slate-950 text-slate-300 border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  ₹{(amt / 1000).toFixed(0)}k
                </button>
              ))}
              <button
                type="button"
                onClick={() => setIsCustomBalance(true)}
                className={`py-1.5 px-2 rounded-lg text-xs font-mono font-medium transition-all ${
                  isCustomBalance
                    ? 'bg-cyan-600 text-white border border-cyan-400'
                    : 'bg-slate-950 text-slate-300 border border-slate-800 hover:border-slate-700'
                }`}
              >
                Custom
              </button>
            </div>

            {isCustomBalance && (
              <input
                type="number"
                min="1000"
                step="1000"
                value={customBalanceInput}
                onChange={(e) => setCustomBalanceInput(e.target.value)}
                placeholder="Enter amount in ₹"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
              />
            )}
          </div>

          <div className="pt-2 border-t border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="py-2 px-3 rounded-xl text-slate-400 hover:text-white text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex items-center gap-1.5 py-2 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition-colors disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <PlusCircle className="w-4 h-4" />
              )}
              <span>{isLoading ? 'Creating...' : 'Create Portfolio'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
