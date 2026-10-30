import React, { useState, useEffect, useRef } from 'react';
import type {
  StockQuote,
  TechnicalIndicators,
  AIAnalysisReport,
  StructuredAIAnalysis,
} from '../types';
import {
  analyzeStockWithAI,
  checkAIHealth,
  ApiError,
} from '../services/api';
import {
  Bot,
  Send,
  Sparkles,
  ShieldAlert,
  FileText,
  AlertTriangle,
  CheckCircle,
  Terminal,
  RotateCcw,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  HelpCircle,
} from 'lucide-react';

interface AIAnalystPageProps {
  quote: StockQuote;
  indicators: TechnicalIndicators;
  report?: AIAnalysisReport;
  geminiModel?: string;
  isApiKeySet?: boolean;
  activeBacktestId?: string;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  timestamp: string;
  text?: string;
  structuredAnalysis?: StructuredAIAnalysis;
  structuredReport?: AIAnalysisReport;
  isError?: boolean;
  failedQuery?: string;
}

export const AIAnalystPage: React.FC<AIAnalystPageProps> = ({
  quote,
  indicators,
  report,
  geminiModel = 'gemini-2.5-flash',
  isApiKeySet: initialApiKeySet = false,
  activeBacktestId,
}) => {
  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isApiConnected, setIsApiConnected] = useState<boolean>(initialApiKeySet);
  const [activeModel, setActiveModel] = useState<string>(geminiModel);
  const [activeProvider, setActiveProvider] = useState<string>('AI Analyst');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastFailedQuery, setLastFailedQuery] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initial welcome message
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-welcome',
      sender: 'assistant',
      timestamp: 'Today, Live Session',
      text: `Hello! I am your AI Market Research Analyst for ${quote.symbol} (${quote.name}). I synthesize quantitative indicators, momentum setups, and backtest results into explainable insights. Ask me anything, or pick from the suggested research questions below.`,
      structuredReport: report,
    },
  ]);

  // Check AI backend health on mount
  useEffect(() => {
    checkAIHealth().then((status) => {
      if (status) {
        setIsApiConnected(status.configured);
        if (status.model) setActiveModel(status.model);
        if (status.provider) setActiveProvider(status.provider);
      }
    });
  }, []);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const quickPrompts = [
    `Explain the current technical indicators for ${quote.symbol}`,
    `Why did the rule-based strategy generate this signal?`,
    `What are the main risks shown by the current analysis?`,
    `Explain what RSI, MACD, and ATR mean for this stock`,
    `Summarize recent backtest performance and transaction costs`,
  ];

  const handleSend = async (textToSend?: string) => {
    const q = (textToSend || inputQuery).trim();
    if (!q || isLoading) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      text: q,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setIsLoading(true);
    setErrorMessage(null);
    setLastFailedQuery(null);

    try {
      // Build conversation history payload (capped to last 6 turns)
      const historyPayload = messages
        .filter((m) => m.text)
        .slice(-6)
        .map((m) => ({
          sender: m.sender,
          text: m.text!,
        }));

      const res = await analyzeStockWithAI({
        question: q,
        symbol: quote.symbol,
        backtest_id: activeBacktestId,
        conversation_history: historyPayload,
      });

      const assistantMsg: ChatMessage = {
        id: `asst-${Date.now()}`,
        sender: 'assistant',
        timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        text: res.analysis.summary,
        structuredAnalysis: res.analysis,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setIsApiConnected(true);
    } catch (err: any) {
      let friendlyError = err.message || 'An error occurred while connecting to the AI Market Analyst.';
      if (err instanceof ApiError) {
        if (err.errorCode === 'AI_KEY_NOT_CONFIGURED') {
          friendlyError = 'Neither GROQ_API_KEY nor GEMINI_API_KEY is configured on the backend server. Add a key to backend/.env to activate live AI analysis.';
          setIsApiConnected(false);
        } else if (err.errorCode === 'AI_RATE_LIMIT') {
          friendlyError = 'AI rate limit exceeded. Please wait a few seconds before sending another question.';
        } else if (err.errorCode === 'AI_TIMEOUT' || err.status === 408) {
          friendlyError = 'The AI analysis took longer than expected to synthesize. Click "Retry Analysis" to re-run your question.';
        } else if (
          err.status === 503 ||
          err.errorCode === 'NETWORK_ERROR' ||
          err.detail?.toLowerCase().includes('failed to fetch') ||
          err.message?.toLowerCase().includes('failed to fetch')
        ) {
          friendlyError = 'The connection to the AI analyst was briefly interrupted (temporary network or tunnel reconnect). Please click "Retry Analysis" below to continue.';
        } else if (err.detail) {
          friendlyError = err.detail;
        }
      } else if (err.message?.toLowerCase().includes('failed to fetch')) {
        friendlyError = 'The connection to the AI analyst was briefly interrupted (temporary network or tunnel reconnect). Please click "Retry Analysis" below to continue.';
      }

      setErrorMessage(friendlyError);
      setLastFailedQuery(q);

      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'assistant',
        timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        text: `⚠️ Analysis Unavailable: ${friendlyError}`,
        isError: true,
        failedQuery: q,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: `msg-${Date.now()}`,
        sender: 'assistant',
        timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        text: `Conversation cleared. I am ready to analyze ${quote.symbol} (${quote.name}). How can I assist with your quantitative research?`,
      },
    ]);
    setErrorMessage(null);
    setLastFailedQuery(null);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-white tracking-tight">
                AI Stock Research Analyst
              </h1>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                {activeModel}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Powered by {activeProvider}. Strictly separates factual observations from model hypotheses.
            </p>
          </div>
        </div>

        {/* API Status & Action Badges */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300">
            <Terminal className="w-3.5 h-3.5 text-blue-400" />
            <span>Target Stock: <strong className="text-white">{quote.symbol}</strong></span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300">
            <span className={`w-2 h-2 rounded-full ${isApiConnected ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
            <span>{isApiConnected ? `${activeProvider} Ready` : 'Key Missing (.env)'}</span>
          </div>

          <button
            onClick={handleClearChat}
            title="Reset Conversation"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Clear Chat</span>
          </button>
        </div>
      </div>

      {/* API Key Missing Notice Banner (Non-Intrusive) */}
      {!isApiConnected && (
        <div className="bg-amber-950/30 border border-amber-800/60 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-300 shadow-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <strong className="text-amber-200">AI Provider Key Not Configured</strong>
              <p className="text-slate-400 text-[11px]">
                To activate live AI responses, obtain an API key from Groq or Google AI Studio and place it in{' '}
                <code className="text-amber-300 bg-amber-950/60 px-1 py-0.5 rounded font-mono">backend/.env</code> as{' '}
                <code className="text-amber-300 bg-amber-950/60 px-1 py-0.5 rounded font-mono">GROQ_API_KEY=your_key</code> or{' '}
                <code className="text-amber-300 bg-amber-950/60 px-1 py-0.5 rounded font-mono">GEMINI_API_KEY=your_key</code>.
                The rest of the trading platform remains fully functional.
              </p>
            </div>
          </div>
          <a
            href="https://console.groq.com/keys"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 text-xs font-medium transition-colors"
          >
            <span>Get Groq Key</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* Main Conversation & Analysis Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Chat & Structured Intelligence */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4 min-h-[520px] flex flex-col justify-between">
            {/* Messages Scroll Area */}
            <div className="space-y-4 overflow-y-auto max-h-[580px] pr-1">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.sender === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1 text-[11px] text-slate-400">
                    <span>{msg.sender === 'user' ? 'You' : 'AI Market Analyst'}</span>
                    <span>•</span>
                    <span>{msg.timestamp}</span>
                  </div>

                  {msg.sender === 'user' ? (
                    <div className="bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-xs max-w-[85%] shadow-md leading-relaxed">
                      {msg.text}
                    </div>
                  ) : (
                    <div
                      className={`text-slate-200 rounded-2xl rounded-tl-sm p-4 text-xs max-w-[95%] space-y-4 shadow-md ${
                        msg.isError
                          ? 'bg-rose-950/30 border border-rose-800/60 text-rose-300'
                          : 'bg-slate-800/80 border border-slate-700/70'
                      }`}
                    >
                      {msg.text && (
                        <div className="leading-relaxed whitespace-pre-line font-medium text-slate-100">
                          {msg.text}
                        </div>
                      )}

                      {/* Inline Retry Action for Interrupted Requests */}
                      {msg.isError && msg.failedQuery && (
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => handleSend(msg.failedQuery)}
                            disabled={isLoading}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600/30 hover:bg-rose-600/50 border border-rose-500/40 text-rose-200 text-xs font-semibold transition-all cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                            <span>Retry Analysis</span>
                          </button>
                        </div>
                      )}

                      {/* Render Structured Gemini Analysis */}
                      {msg.structuredAnalysis && (
                        <div className="space-y-4 pt-2 border-t border-slate-700/60">
                          {/* 1. Observed Factual Data */}
                          {Object.keys(msg.structuredAnalysis.observed_facts).length > 0 && (
                            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2">
                              <div className="flex items-center gap-2 text-blue-400 font-bold text-xs uppercase tracking-wider">
                                <CheckCircle className="w-4 h-4" />
                                <span>Observed Quantitative Facts (Non-Generative)</span>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                                {Object.entries(msg.structuredAnalysis.observed_facts).map(([k, v]) => (
                                  <div key={k} className="bg-slate-900/90 p-2 rounded border border-slate-800 min-w-0 overflow-hidden" title={`${k}: ${v}`}>
                                    <span className="text-slate-400 block text-[10px] truncate">{k}</span>
                                    <span className="font-bold text-slate-200 truncate block">
                                      {typeof v === 'number'
                                        ? v % 1 !== 0
                                          ? v.toFixed(2)
                                          : v
                                        : String(v)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 2. Qualitative Interpretation */}
                          {msg.structuredAnalysis.interpretation && (
                            <div className="bg-slate-950/70 border border-indigo-900/40 rounded-xl p-3.5 space-y-2">
                              <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
                                <Sparkles className="w-4 h-4" />
                                <span>Model-Generated Interpretation (Hypothesis)</span>
                              </div>
                              <p className="text-slate-300 leading-relaxed text-xs whitespace-pre-line">
                                {msg.structuredAnalysis.interpretation}
                              </p>
                            </div>
                          )}

                          {/* 3. Supporting Evidence */}
                          {msg.structuredAnalysis.supporting_evidence.length > 0 && (
                            <div className="space-y-1.5">
                              <span className="font-bold text-slate-300 text-xs block">
                                Supporting Factual Evidence
                              </span>
                              <ul className="list-disc list-inside space-y-1 text-slate-300 text-[11px]">
                                {msg.structuredAnalysis.supporting_evidence.map((ev, i) => (
                                  <li key={i}>{ev}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* 4. News Analysis if provided */}
                          {msg.structuredAnalysis.news_analysis && msg.structuredAnalysis.news_analysis.length > 0 && (
                            <div className="space-y-2">
                              <span className="font-bold text-slate-300 text-xs block">
                                Synthesized News & Market Events
                              </span>
                              <div className="space-y-2">
                                {msg.structuredAnalysis.news_analysis.map((news, i) => (
                                  <div
                                    key={i}
                                    className="bg-slate-900/80 border border-slate-800 p-2.5 rounded-lg flex items-start gap-2.5"
                                  >
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 mt-0.5 ${
                                        news.impact === 'POSITIVE'
                                          ? 'bg-emerald-500/20 text-emerald-400'
                                          : news.impact === 'NEGATIVE'
                                          ? 'bg-rose-500/20 text-rose-400'
                                          : 'bg-slate-500/20 text-slate-300'
                                      }`}
                                    >
                                      {news.impact}
                                    </span>
                                    <div>
                                      <div className="font-semibold text-slate-200 text-xs">
                                        {news.headline}
                                      </div>
                                      <div className="text-[11px] text-slate-400 mt-0.5">
                                        {news.summary} • <span className="text-slate-500">{news.source}</span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 5. Key Risks & Uncertainties */}
                          {(msg.structuredAnalysis.key_risks.length > 0 || msg.structuredAnalysis.uncertainties.length > 0) && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                              {msg.structuredAnalysis.key_risks.length > 0 && (
                                <div className="bg-amber-950/20 border border-amber-900/40 rounded-xl p-3 space-y-1.5">
                                  <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs uppercase tracking-wider">
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    <span>Key Downside Risks</span>
                                  </div>
                                  <ul className="list-disc list-inside space-y-1 text-slate-300 text-[11px]">
                                    {msg.structuredAnalysis.key_risks.map((risk, i) => (
                                      <li key={i}>{risk}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {msg.structuredAnalysis.uncertainties.length > 0 && (
                                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-1.5">
                                  <div className="flex items-center gap-1.5 text-slate-400 font-bold text-xs uppercase tracking-wider">
                                    <HelpCircle className="w-3.5 h-3.5" />
                                    <span>Data Limitations & Uncertainties</span>
                                  </div>
                                  <ul className="list-disc list-inside space-y-1 text-slate-400 text-[11px]">
                                    {msg.structuredAnalysis.uncertainties.map((unc, i) => (
                                      <li key={i}>{unc}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Disclaimer */}
                          <p className="text-[10px] text-slate-500 italic pt-1">
                            {msg.structuredAnalysis.disclaimer}
                          </p>
                        </div>
                      )}

                      {/* Fallback to Stage 1 report if present */}
                      {!msg.structuredAnalysis && msg.structuredReport && (
                        <div className="space-y-4 pt-2 border-t border-slate-700">
                          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2">
                            <div className="flex items-center gap-2 text-blue-400 font-bold text-xs uppercase tracking-wider">
                              <CheckCircle className="w-4 h-4" />
                              <span>Observed Factual Data</span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                              <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 min-w-0">
                                <span className="text-slate-400 block text-[10px]">Price</span>
                                <div className="flex items-baseline gap-1.5 flex-wrap">
                                  <span className="font-bold text-slate-200 text-sm">₹{msg.structuredReport.observedFacts.price.toFixed(2)}</span>
                                  {msg.structuredReport.observedFacts.changePercent !== undefined && (
                                    <span className={`text-[10px] font-semibold ${msg.structuredReport.observedFacts.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                      {msg.structuredReport.observedFacts.changePercent >= 0 ? '+' : ''}{msg.structuredReport.observedFacts.changePercent.toFixed(2)}%
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 min-w-0">
                                <span className="text-slate-400 block text-[10px]">RSI (14)</span>
                                <span className="font-bold text-slate-200 text-sm">{msg.structuredReport.observedFacts.indicators['RSI (14)']}</span>
                              </div>
                              {msg.structuredReport.observedFacts.indicators['SMA 20'] !== undefined && (
                                <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 min-w-0">
                                  <span className="text-slate-400 block text-[10px]">SMA (20)</span>
                                  <span className="font-bold text-slate-200 text-sm">₹{Number(msg.structuredReport.observedFacts.indicators['SMA 20']).toFixed(2)}</span>
                                </div>
                              )}
                              {msg.structuredReport.observedFacts.indicators['MACD Line'] !== undefined && (
                                <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 min-w-0">
                                  <span className="text-slate-400 block text-[10px]">MACD</span>
                                  <span className="font-bold text-slate-200 text-sm">{Number(msg.structuredReport.observedFacts.indicators['MACD Line']).toFixed(2)}</span>
                                </div>
                              )}
                              <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 col-span-2 sm:col-span-2 md:col-span-4 min-w-0 overflow-hidden">
                                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Volume Context</span>
                                <span className="font-medium text-slate-300 text-xs mt-0.5 block break-words whitespace-normal leading-relaxed">
                                  {msg.structuredReport.observedFacts.volumeStatus}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="bg-slate-950/70 border border-indigo-900/40 rounded-xl p-3.5 space-y-2">
                            <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
                              <Sparkles className="w-4 h-4" />
                              <span>Model-Generated Interpretation</span>
                            </div>
                            <p className="text-slate-300 leading-relaxed text-xs">
                              {msg.structuredReport.interpretation.marketContext}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex items-center gap-2 text-xs text-indigo-400 py-3 px-2 bg-indigo-950/20 rounded-xl border border-indigo-900/30">
                  <Sparkles className="w-4 h-4 animate-spin text-indigo-400" />
                  <span>Synthesizing factual market context with {activeModel}...</span>
                </div>
              )}

              {/* Scroll anchor */}
              <div ref={messagesEndRef} />
            </div>

            {/* Input & Quick Chips Area */}
            <div className="space-y-3 pt-3 border-t border-slate-800">
              {/* Retry bar if last query failed */}
              {errorMessage && lastFailedQuery && (
                <div className="flex items-center justify-between gap-2 p-2 bg-rose-950/40 border border-rose-800/60 rounded-xl text-xs text-rose-300">
                  <div className="flex items-center gap-2 truncate">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span className="truncate">Failed query: "{lastFailedQuery}"</span>
                  </div>
                  <button
                    onClick={() => handleSend(lastFailedQuery)}
                    className="flex items-center gap-1 px-2.5 py-1 bg-rose-600/40 hover:bg-rose-600/60 rounded-lg text-rose-200 transition-colors shrink-0 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry</span>
                  </button>
                </div>
              )}

              {/* Quick Prompts */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                {quickPrompts.map((prompt, idx) => (
                  <button
                    key={idx}
                    disabled={isLoading}
                    onClick={() => handleSend(prompt)}
                    className="whitespace-nowrap px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-[11px] border border-slate-700 transition-colors cursor-pointer"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              {/* Chat Input */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={inputQuery}
                  disabled={isLoading}
                  maxLength={1000}
                  onChange={(e) => setInputQuery(e.target.value)}
                  placeholder={`Ask a research question about ${quote.symbol} indicators, signals, or backtests...`}
                  className="flex-1 bg-slate-800/90 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!inputQuery.trim() || isLoading}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white p-2.5 rounded-xl transition-all shadow-md shadow-blue-600/30 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Grounding & Model Guidelines */}
        <div className="space-y-4">
          {/* Grounding Context Provided */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md text-xs space-y-3">
            <div className="flex items-center gap-2 text-slate-200 font-bold">
              <FileText className="w-4 h-4 text-blue-400" />
              <span>Grounding Context Provided</span>
            </div>
            <p className="text-slate-400 text-[11px]">
              The Gemini model receives strictly validated structured parameters from the trading engine:
            </p>
            <div className="space-y-2 text-[11px] font-mono bg-slate-950 p-3 rounded-lg border border-slate-800 text-slate-300">
              <div>• Stock: {quote.symbol} ({quote.exchange})</div>
              <div>• Price: ₹{quote.price.toFixed(2)}</div>
              <div>• SMA 20: ₹{indicators.sma20.toFixed(2)}</div>
              <div>• SMA 50: ₹{indicators.sma50.toFixed(2)}</div>
              <div>• RSI 14: {indicators.rsi14.toFixed(1)}</div>
              <div>• MACD Hist: {indicators.macd.histogram >= 0 ? '+' : ''}{indicators.macd.histogram.toFixed(2)}</div>
              <div>• ATR 14: ₹{indicators.atr14.toFixed(2)}</div>
              {activeBacktestId && (
                <div className="text-indigo-400 font-semibold">• Backtest Active: {activeBacktestId}</div>
              )}
            </div>
          </div>

          {/* Model Security Guidelines */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md text-xs space-y-3">
            <div className="flex items-center gap-2 text-slate-200 font-bold">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <span>Safety & Hallucination Guardrails</span>
            </div>
            <ul className="space-y-2 text-slate-400 text-[11px]">
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1 shrink-0"></span>
                <span><strong>No Real Money Execution:</strong> The AI cannot place live orders or modify account balances.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1 shrink-0"></span>
                <span><strong>No Numerical Fabrication:</strong> The model cannot hallucinate price targets or change backtest results.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1 shrink-0"></span>
                <span><strong>Server-Side Credentials:</strong> GEMINI_API_KEY is kept strictly on the backend and never exposed to the frontend.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
