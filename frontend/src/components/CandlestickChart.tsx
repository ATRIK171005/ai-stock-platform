import React, { useEffect, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
} from 'lightweight-charts';
import type { OHLCVCandle } from '../types';
import type { IndicatorValuesPayload } from '../services/api';

export type CandleWithOptionalIndicators = OHLCVCandle & {
  indicators?: IndicatorValuesPayload;
};

interface CandlestickChartProps {
  candles: CandleWithOptionalIndicators[];
  symbol: string;
  showSMA?: boolean;
  showEMA?: boolean;
  height?: number;
}

export const CandlestickChart: React.FC<CandlestickChartProps> = ({
  candles,
  symbol,
  showSMA: initialShowSMA = true,
  showEMA: initialShowEMA = false,
  height = 420,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const [showSMA, setShowSMA] = useState(initialShowSMA);
  const [showEMA, setShowEMA] = useState(initialShowEMA);

  useEffect(() => {
    if (!chartContainerRef.current || candles.length === 0) return;

    // Clear previous chart DOM
    chartContainerRef.current.innerHTML = '';

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0f172a' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: 'rgba(51, 65, 85, 0.3)' },
        horzLines: { color: 'rgba(51, 65, 85, 0.3)' },
      },
      crosshair: {
        vertLine: { color: '#64748b', width: 1, style: 2 },
        horzLine: { color: '#64748b', width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor: '#334155',
        scaleMargins: {
          top: 0.08,
          bottom: 0.22,
        },
      },
      timeScale: {
        borderColor: '#334155',
        timeVisible: true,
        secondsVisible: false,
      },
      width: chartContainerRef.current.clientWidth,
      height: height,
    });

    chartRef.current = chart;

    // 1. Candlestick Series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e',
    });

    const candleData = candles.map((c) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    candleSeries.setData(candleData);

    // 2. Volume Sub-chart overlay
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '', // independent scale overlay
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    const volumeData = candles.map((c) => ({
      time: c.time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(16, 185, 129, 0.35)' : 'rgba(244, 63, 94, 0.35)',
    }));
    volumeSeries.setData(volumeData);

    // Check if backend indicators are already attached to candles
    const hasBackendIndicators = candles.some((c) => c.indicators !== undefined);

    // 3. SMA Overlays (SMA 20 & SMA 50)
    if (showSMA) {
      let sma20Data: { time: string; value: number }[] = [];
      let sma50Data: { time: string; value: number }[] = [];

      if (hasBackendIndicators) {
        // Use backend indicator values as single source of truth (skipping null warm-up)
        sma20Data = candles
          .filter((c) => c.indicators?.sma20 != null)
          .map((c) => ({ time: c.time, value: c.indicators!.sma20! }));

        sma50Data = candles
          .filter((c) => c.indicators?.sma50 != null)
          .map((c) => ({ time: c.time, value: c.indicators!.sma50! }));
      } else {
        // Fallback calculation if no backend indicators attached
        if (candles.length >= 20) {
          for (let i = 19; i < candles.length; i++) {
            let sum = 0;
            for (let j = 0; j < 20; j++) sum += candles[i - j].close;
            sma20Data.push({ time: candles[i].time, value: Math.round((sum / 20) * 100) / 100 });
          }
        }
        if (candles.length >= 50) {
          for (let i = 49; i < candles.length; i++) {
            let sum = 0;
            for (let j = 0; j < 50; j++) sum += candles[i - j].close;
            sma50Data.push({ time: candles[i].time, value: Math.round((sum / 50) * 100) / 100 });
          }
        }
      }

      if (sma20Data.length > 0) {
        const sma20Series = chart.addSeries(LineSeries, {
          color: '#f59e0b',
          lineWidth: 2,
          title: 'SMA 20',
        });
        sma20Series.setData(sma20Data);
      }

      if (sma50Data.length > 0) {
        const sma50Series = chart.addSeries(LineSeries, {
          color: '#3b82f6',
          lineWidth: 2,
          title: 'SMA 50',
        });
        sma50Series.setData(sma50Data);
      }
    }

    // 4. EMA Overlays (EMA 12 & EMA 26)
    if (showEMA && hasBackendIndicators) {
      const ema12Data = candles
        .filter((c) => c.indicators?.ema12 != null)
        .map((c) => ({ time: c.time, value: c.indicators!.ema12! }));

      const ema26Data = candles
        .filter((c) => c.indicators?.ema26 != null)
        .map((c) => ({ time: c.time, value: c.indicators!.ema26! }));

      if (ema12Data.length > 0) {
        const ema12Series = chart.addSeries(LineSeries, {
          color: '#10b981',
          lineWidth: 1,
          title: 'EMA 12',
        });
        ema12Series.setData(ema12Data);
      }

      if (ema26Data.length > 0) {
        const ema26Series = chart.addSeries(LineSeries, {
          color: '#ec4899',
          lineWidth: 1,
          title: 'EMA 26',
        });
        ema26Series.setData(ema26Data);
      }
    }

    chart.timeScale().fitContent();

    // Debounced Resize Observer
    const handleResize = () => {
      if (chartContainerRef.current && chart) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [candles, symbol, showSMA, showEMA, height]);

  if (candles.length === 0) {
    return (
      <div
        className="w-full flex items-center justify-center bg-slate-900 border border-slate-800 rounded-xl text-slate-400 text-xs"
        style={{ height: `${height}px` }}
      >
        No historical candles available for {symbol}.
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
      <div className="flex flex-wrap items-center justify-between px-4 py-2.5 bg-slate-800/60 border-b border-slate-800 text-xs gap-2">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-200">{symbol} Daily Candlesticks</span>

          {/* Indicator Toggles */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSMA(!showSMA)}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                showSMA
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
            >
              <span className="w-2 h-0.5 bg-amber-400 inline-block rounded-full"></span>
              SMA (20/50)
            </button>

            <button
              onClick={() => setShowEMA(!showEMA)}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                showEMA
                  ? 'bg-pink-500/15 text-pink-300 border-pink-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
            >
              <span className="w-2 h-0.5 bg-pink-400 inline-block rounded-full"></span>
              EMA (12/26)
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 text-slate-400 text-[11px]">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>TradingView Lightweight Charts v5</span>
        </div>
      </div>
      <div ref={chartContainerRef} className="w-full" style={{ height: `${height}px` }} />
    </div>
  );
};
