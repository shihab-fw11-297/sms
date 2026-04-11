'use client';
// components/InteractiveChart.js
// Fully responsive TradingView-style chart with mobile, landscape & touch support

import { useEffect, useRef, useState, useCallback } from 'react';

// ─── Responsive Hook ──────────────────────────────────────────────────────────
function useResponsive() {
  const [state, setState] = useState({
    isMobile: false,
    isLandscape: false,
    isTablet: false,
    width: 0,
    height: 0,
  });

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setState({
        isMobile: w < 768,
        isTablet: w >= 768 && w < 1024,
        isLandscape: w > h,
        width: w,
        height: h,
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return state;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function InteractiveChart({
  candles,
  signals,
  htfData,
  settings,
  visualSettings,
}) {
  const canvasRef    = useRef(null);
  const containerRef = useRef(null);
  const animFrameRef = useRef(null);
  const lastRenderRef    = useRef(0);
  const renderTimeoutRef = useRef(null);

  const { isMobile, isTablet, isLandscape } = useResponsive();
  const [dimensions, setDimensions]   = useState({ width: 0, height: 0 });
  const [offset, setOffset]           = useState(0);
  const [candleWidth, setCandleWidth] = useState(8);
  const [hoveredCandle, setHoveredCandle]     = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging]   = useState(false);
  const [dragStart, setDragStart]     = useState({ x: 0, y: 0 });
  const [lastOffset, setLastOffset]   = useState(0);
  const [showControls, setShowControls] = useState(false);
  // Pinch-to-zoom
  const lastPinchDistRef = useRef(null);
  const lastCandleWidthRef = useRef(candleWidth);

  // ── Chart height based on device/orientation ──────────────────────────────
  const chartHeight = (() => {
    if (isMobile && isLandscape) return Math.min(window.innerHeight - 80, 320);
    if (isMobile)  return 380;
    if (isTablet)  return 480;
    return 600;
  })();

  // ── Responsive padding ────────────────────────────────────────────────────
  const padding = (() => {
    if (isMobile) return { top: 28, right: 68, bottom: 32, left: 6 };
    return { top: 40, right: 100, bottom: 40, left: 10 };
  })();

  // ── Default candle width for device ──────────────────────────────────────
  useEffect(() => {
    const defaultW = isMobile ? 6 : 8;
    setCandleWidth(defaultW);
    lastCandleWidthRef.current = defaultW;
  }, [isMobile]);

  // ── Dimension observer ────────────────────────────────────────────────────
  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        const r = containerRef.current.getBoundingClientRect();
        setDimensions({ width: r.width, height: r.height });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // ── Init offset ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (candles?.length > 0 && dimensions.width > 0) {
      const avail = dimensions.width - padding.left - padding.right;
      const visible = Math.floor(avail / candleWidth);
      setOffset(Math.max(0, candles.length - visible));
    }
  }, [candles, dimensions.width]);

  const getMaxOffset = useCallback(() => {
    if (!candles || !dimensions.width) return 0;
    const avail = dimensions.width - padding.left - padding.right;
    const visible = Math.floor(avail / candleWidth);
    return Math.max(0, candles.length - visible);
  }, [candles, dimensions.width, candleWidth, padding]);

  // ─────────────────────────────────────────────────────────────────────────
  // Mouse events
  // ─────────────────────────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setLastOffset(offset);
  }, [offset]);

  const handleMouseMove = useCallback((e) => {
    if (!canvasRef.current || !candles) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isDragging) {
      const deltaX    = e.clientX - dragStart.x;
      const moved     = Math.round(deltaX / candleWidth);
      const maxOffset = getMaxOffset();
      const newOff    = Math.max(0, Math.min(maxOffset, lastOffset - moved));
      if (newOff !== offset) setOffset(newOff);
    } else {
      const candleIdx = Math.floor((x - padding.left) / candleWidth) + offset;
      if (candleIdx >= 0 && candleIdx < candles.length) {
        setHoveredCandle(candleIdx);
        const tw = 220, th = 200;
        let tx = x + tw + 20 > dimensions.width ? x - tw - 20 : x + 20;
        tx = Math.max(10, tx);
        let ty = y + th + 20 > dimensions.height ? Math.max(10, y - th - 20) : y + 20;
        setTooltipPosition({ x: tx, y: ty });
      } else {
        setHoveredCandle(null);
      }
    }
  }, [isDragging, dragStart, offset, lastOffset, candleWidth, candles, dimensions, getMaxOffset, padding]);

  const handleMouseUp    = useCallback(() => setIsDragging(false), []);
  const handleMouseLeave = useCallback(() => { setIsDragging(false); setHoveredCandle(null); }, []);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current);
    renderTimeoutRef.current = setTimeout(() => {
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      const newW   = Math.max(isMobile ? 3 : 4, Math.min(isMobile ? 20 : 40, candleWidth * factor));
      const avail  = dimensions.width - padding.left - padding.right;
      const oldVis = Math.floor(avail / candleWidth);
      const newVis = Math.floor(avail / newW);
      const center = offset + Math.floor(oldVis / 2);
      let newOff   = Math.max(0, center - Math.floor(newVis / 2));
      newOff       = Math.min(newOff, Math.max(0, candles.length - newVis));
      setCandleWidth(newW);
      lastCandleWidthRef.current = newW;
      setOffset(newOff);
    }, 10);
  }, [candleWidth, offset, dimensions.width, candles, isMobile, padding]);

  // ─────────────────────────────────────────────────────────────────────────
  // Touch events (pan + pinch-to-zoom)
  // ─────────────────────────────────────────────────────────────────────────
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      setLastOffset(offset);
      lastPinchDistRef.current = null;
    } else if (e.touches.length === 2) {
      setIsDragging(false);
      const dx   = e.touches[0].clientX - e.touches[1].clientX;
      const dy   = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDistRef.current      = Math.hypot(dx, dy);
      lastCandleWidthRef.current    = candleWidth;
    }
  }, [offset, candleWidth]);

  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    if (!candles) return;

    if (e.touches.length === 2) {
      // Pinch zoom
      const dx   = e.touches[0].clientX - e.touches[1].clientX;
      const dy   = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (lastPinchDistRef.current) {
        const scale = dist / lastPinchDistRef.current;
        const newW  = Math.max(3, Math.min(20, lastCandleWidthRef.current * scale));
        const avail = dimensions.width - padding.left - padding.right;
        const newVis = Math.floor(avail / newW);
        const newOff = Math.min(offset, Math.max(0, candles.length - newVis));
        setCandleWidth(newW);
        setOffset(newOff);
      }
    } else if (e.touches.length === 1 && isDragging) {
      // Pan
      const deltaX = e.touches[0].clientX - dragStart.x;
      const moved  = Math.round(deltaX / candleWidth);
      const newOff = Math.max(0, Math.min(getMaxOffset(), lastOffset - moved));
      if (newOff !== offset) setOffset(newOff);
    }
  }, [candles, isDragging, dragStart, offset, lastOffset, candleWidth, dimensions, getMaxOffset, padding]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    lastPinchDistRef.current = null;
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Keyboard
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (!candles) return;
      const max = getMaxOffset();
      switch (e.key) {
        case 'ArrowLeft': e.preventDefault(); setOffset(o => Math.max(0, o - 10)); break;
        case 'ArrowRight': e.preventDefault(); setOffset(o => Math.min(max, o + 10)); break;
        case '+': case '=': e.preventDefault(); setCandleWidth(w => Math.min(40, w * 1.15)); break;
        case '-': case '_': e.preventDefault(); setCandleWidth(w => Math.max(4, w * 0.85)); break;
        case 'Home': e.preventDefault(); setOffset(0); break;
        case 'End':  e.preventDefault(); setOffset(max); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [candles, getMaxOffset]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render loop
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current || !candles?.length || !dimensions.width || !dimensions.height) return;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d', { alpha: false });
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = dimensions.width * dpr;
      canvas.height = dimensions.height * dpr;
      canvas.style.width  = `${dimensions.width}px`;
      canvas.style.height = `${dimensions.height}px`;
      ctx.scale(dpr, dpr);

      ctx.fillStyle = '#0f1419';
      ctx.fillRect(0, 0, dimensions.width, dimensions.height);

      const avail   = dimensions.width - padding.left - padding.right;
      const visible = Math.ceil(avail / candleWidth) + 1;
      const startIdx = Math.max(0, offset);
      const endIdx   = Math.min(candles.length, startIdx + visible);
      const slice    = candles.slice(startIdx, endIdx);
      if (!slice.length) return;

      renderChart(ctx, slice, signals, htfData, {
        width: dimensions.width,
        height: dimensions.height,
        candleWidth,
        startIdx,
        hoveredCandle,
        settings,
        visualSettings,
        padding,
        isMobile,
      });
    };

    const now = Date.now();
    if (now - lastRenderRef.current > 16) {
      render();
      lastRenderRef.current = now;
    } else {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = requestAnimationFrame(render);
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current);
    };
  }, [candles, signals, htfData, dimensions, offset, candleWidth, hoveredCandle, settings, visualSettings, isMobile, padding]);

  // ─────────────────────────────────────────────────────────────────────────
  // JSX
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '4px' : '8px', width: '100%' }}>
      {/* Landscape hint on mobile */}
      {isMobile && !isLandscape && (
        <LandscapeHint />
      )}

      {/* Chart wrapper */}
      <div
        ref={containerRef}
        style={{
          height: `${chartHeight}px`,
          width: '100%',
          position: 'relative',
          background: '#0f1419',
          border: '1px solid #21262d',
          borderRadius: isMobile ? '6px' : '8px',
          overflow: 'hidden',
          cursor: isDragging ? 'grabbing' : 'crosshair',
          touchAction: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
        }}
      >
        {/* HTF Bias badge */}
        {htfData?.bias && visualSettings?.showHTFBias && (
          <div
            style={{
              position: 'absolute',
              top: isMobile ? 6 : 10,
              left: isMobile ? 6 : 10,
              zIndex: 10,
              background: htfData.bias === 'BULLISH' ? '#00d4aa22' : '#ff497622',
              border: `1px solid ${htfData.bias === 'BULLISH' ? '#00d4aa' : '#ff4976'}`,
              borderRadius: 4,
              padding: isMobile ? '2px 6px' : '4px 10px',
              display: 'flex',
              gap: 4,
              alignItems: 'center',
              fontSize: isMobile ? 9 : 11,
              fontFamily: '"JetBrains Mono", monospace',
              color: htfData.bias === 'BULLISH' ? '#00d4aa' : '#ff4976',
              letterSpacing: 1,
            }}
          >
            <span style={{ opacity: 0.7 }}>HTF:</span>
            <strong>{htfData.bias}</strong>
            <span style={{ opacity: 0.6, fontSize: isMobile ? 8 : 9 }}>
              ({(htfData.confidence * 100).toFixed(0)}%)
            </span>
          </div>
        )}

        {/* Mobile controls toggle */}
        {isMobile && (
          <button
            onClick={() => setShowControls(v => !v)}
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              zIndex: 20,
              background: '#21262d',
              border: '1px solid #30363d',
              borderRadius: 4,
              color: '#8b949e',
              fontSize: 14,
              width: 30,
              height: 30,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            ⚙
          </button>
        )}

        {/* Mobile floating controls panel */}
        {isMobile && showControls && (
          <MobileControlsPanel
            onZoomIn={() => setCandleWidth(w => Math.min(20, w * 1.2))}
            onZoomOut={() => setCandleWidth(w => Math.max(3, w * 0.8))}
            onResetZoom={() => { setCandleWidth(6); setOffset(getMaxOffset()); }}
            onGoToStart={() => setOffset(0)}
            onGoToEnd={() => setOffset(getMaxOffset())}
            onClose={() => setShowControls(false)}
          />
        )}

        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ display: 'block', width: '100%', height: '100%' }}
        />

        {/* Tooltip — hidden on mobile */}
        {!isMobile && hoveredCandle !== null && candles[hoveredCandle] && visualSettings?.showTooltip && (
          <CandleTooltip candle={candles[hoveredCandle]} position={tooltipPosition} />
        )}

        {/* Mobile bottom bar (crosshair candle info) */}
        {isMobile && hoveredCandle !== null && candles[hoveredCandle] && (
          <MobileCandleBar candle={candles[hoveredCandle]} />
        )}
      </div>

      {/* Desktop controls */}
      {!isMobile && (
        <ChartControls
          onZoomIn={() => setCandleWidth(w => Math.min(40, w * 1.15))}
          onZoomOut={() => setCandleWidth(w => Math.max(4, w * 0.85))}
          onResetZoom={() => setCandleWidth(8)}
          onGoToStart={() => setOffset(0)}
          onGoToEnd={() => setOffset(getMaxOffset())}
        />
      )}

      {/* Mobile swipe hint */}
      {isMobile && (
        <div style={{
          textAlign: 'center',
          fontSize: 10,
          color: '#8b949e',
          fontFamily: '"JetBrains Mono", monospace',
          letterSpacing: 0.5,
          padding: '2px 0',
        }}>
          ← swipe to pan · pinch to zoom →
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas Render
// ─────────────────────────────────────────────────────────────────────────────
function renderChart(ctx, candles, signals, htfData, options) {
  const { width, height, candleWidth, startIdx, hoveredCandle, settings, visualSettings, padding, isMobile } = options;

  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const prices    = candles.flatMap(c => [c.high, c.low]);
  const maxPrice  = Math.max(...prices);
  const minPrice  = Math.min(...prices);
  const priceRange  = maxPrice - minPrice;
  const pricePad    = priceRange * 0.05;

  const scaleY = (price) =>
    padding.top + ((maxPrice + pricePad - price) / (priceRange + 2 * pricePad)) * chartH;

  if (visualSettings?.showHTFLevels && htfData?.levels)
    drawHTFLevels(ctx, htfData.levels, scaleY, padding, chartW);

  if (visualSettings?.showDealingRange && htfData?.dealingRange)
    drawDealingRange(ctx, htfData.dealingRange, scaleY, padding, chartW);

  if (visualSettings?.showGrid)
    drawGrid(ctx, padding, chartW, chartH);

  candles.forEach((candle, i) => {
    const x = padding.left + i * candleWidth;
    drawCandle(ctx, candle, x, candleWidth, scaleY, (startIdx + i) === hoveredCandle);
  });

  if (signals && visualSettings?.showSignals) {
    signals.forEach(signal => {
      const li = signal.index - startIdx;
      if (li >= 0 && li < candles.length) {
        const x = padding.left + li * candleWidth;
        if (checkSignalVisibility(signal.type, visualSettings))
          drawSignal(ctx, signal, x, candleWidth, scaleY, candles[li], settings, isMobile);
      }
    });
  }

  if (visualSettings?.showPriceAxis)
    drawPriceAxis(ctx, width, padding, minPrice, maxPrice, scaleY, isMobile);

  if (visualSettings?.showCurrentPrice && candles.length > 0)
    drawPriceLine(ctx, candles[candles.length - 1].close, scaleY, width, padding, isMobile);

  if (visualSettings?.showTimeAxis)
    drawTimeAxis(ctx, candles, padding, chartW, candleWidth, height, isMobile);
}

function checkSignalVisibility(signalType, vs) {
  const map = {
    SSL: vs?.showSweeps, BSL: vs?.showSweeps,
    BUY: vs?.showConfirmed, SELL: vs?.showConfirmed,
    IMPULSE_UP: vs?.showImpulse, IMPULSE_DOWN: vs?.showImpulse,
    MOMENTUM_BURST: vs?.showMomentum, HIGH_PROBABILITY: vs?.showHighProb,
  };
  return map[signalType] !== false;
}

// ── Drawing helpers ───────────────────────────────────────────────────────────

function drawHTFLevels(ctx, levels, scaleY, padding, chartW) {
  ctx.save();
  const drawLevel = (lvl, color, label, above) => {
    const y = scaleY(lvl.level);
    ctx.strokeStyle = color + '40'; ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(padding.left + chartW, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color; ctx.font = '10px "JetBrains Mono"'; ctx.textAlign = 'left';
    ctx.fillText(`${label} (${lvl.touches}x)`, padding.left + 5, above ? y - 5 : y + 15);
  };
  levels.support?.forEach(l => drawLevel(l, '#00d4aa', 'SUPPORT', true));
  levels.resistance?.forEach(l => drawLevel(l, '#ff4976', 'RESISTANCE', false));
  ctx.restore();
}

function drawDealingRange(ctx, { high, low, mid }, scaleY, padding, chartW) {
  const yH = scaleY(high), yL = scaleY(low), yM = scaleY(mid);
  ctx.fillStyle = '#ff497615'; ctx.fillRect(padding.left, yH, chartW, yM - yH);
  ctx.fillStyle = '#00d4aa15'; ctx.fillRect(padding.left, yM, chartW, yL - yM);
  ctx.strokeStyle = '#ffd60a80'; ctx.lineWidth = 2; ctx.setLineDash([10, 10]);
  ctx.beginPath(); ctx.moveTo(padding.left, yM); ctx.lineTo(padding.left + chartW, yM); ctx.stroke();
  ctx.setLineDash([]);
  const labels = [['PREMIUM ZONE','#ff4976',yH+15],['DISCOUNT ZONE','#00d4aa',yL-5],['EQUILIBRIUM','#ffd60a',yM-5]];
  ctx.font = 'bold 11px "JetBrains Mono"'; ctx.textAlign = 'right';
  labels.forEach(([text, color, y]) => { ctx.fillStyle = color; ctx.fillText(text, padding.left + chartW - 5, y); });
}

function drawGrid(ctx, padding, chartW, chartH) {
  ctx.strokeStyle = '#21262d'; ctx.lineWidth = 1;
  for (let i = 0; i <= 8; i++) {
    const y = padding.top + (chartH / 8) * i;
    ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(padding.left + chartW, y); ctx.stroke();
  }
  for (let i = 0; i <= 12; i++) {
    const x = padding.left + (chartW / 12) * i;
    ctx.beginPath(); ctx.moveTo(x, padding.top); ctx.lineTo(x, padding.top + chartH); ctx.stroke();
  }
}

function drawCandle(ctx, candle, x, width, scaleY, isHovered) {
  const isBull  = candle.close > candle.open;
  const color   = isBull ? '#00d4aa' : '#ff4976';
  const bw      = Math.max(1, width * 0.8);
  const high    = scaleY(candle.high), low = scaleY(candle.low);
  const open    = scaleY(candle.open), close = scaleY(candle.close);

  if (isHovered) {
    ctx.fillStyle = '#30363d40';
    ctx.fillRect(x - bw/2 - 2, high - 10, bw + 4, low - high + 20);
  }

  // Wick
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, width * 0.1);
  ctx.beginPath(); ctx.moveTo(x + bw/2, high); ctx.lineTo(x + bw/2, low); ctx.stroke();

  // Body
  const bodyTop = Math.min(open, close), bodyH = Math.abs(close - open);
  if (bodyH < 1) {
    ctx.lineWidth = Math.max(1, width * 0.15);
    ctx.beginPath(); ctx.moveTo(x, close); ctx.lineTo(x + bw, close); ctx.stroke();
  } else {
    if (isHovered) { ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.strokeRect(x, bodyTop, bw, bodyH); }
    ctx.fillStyle = color; ctx.fillRect(x, bodyTop, bw, bodyH);
  }
}

function drawSignal(ctx, signal, x, candleWidth, scaleY, candle, settings, isMobile) {
  const { type } = signal;
  const fontSize = isMobile ? 8 : 10;

  if (type === 'SSL' || type === 'BSL') {
    const y = type === 'SSL' ? scaleY(candle.low) : scaleY(candle.high);
    const color = type === 'SSL' ? '#00d4aa' : '#ff4976';
    ctx.fillStyle = color; ctx.font = `bold ${fontSize}px "JetBrains Mono"`;
    ctx.textAlign = 'center';
    ctx.fillText(type, x + candleWidth/2, y + (type==='SSL'?20:-10));
    ctx.strokeStyle = color+'60'; ctx.lineWidth=1; ctx.setLineDash([3,3]);
    ctx.beginPath(); ctx.moveTo(x-30,y); ctx.lineTo(x+30,y); ctx.stroke();
    ctx.setLineDash([]);
  }

  if (type === 'BUY' || type === 'SELL') {
    const y = scaleY(candle.close), color = type==='BUY'?'#00d4aa':'#ff4976';
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = isMobile?5:10;
    ctx.beginPath();
    if (type==='BUY') { ctx.moveTo(x+candleWidth/2,y+20); ctx.lineTo(x+candleWidth/2-5,y+30); ctx.lineTo(x+candleWidth/2+5,y+30); }
    else               { ctx.moveTo(x+candleWidth/2,y-20); ctx.lineTo(x+candleWidth/2-5,y-30); ctx.lineTo(x+candleWidth/2+5,y-30); }
    ctx.fill(); ctx.shadowBlur=0;
    ctx.font=`bold ${fontSize}px "JetBrains Mono"`; ctx.textAlign='center';
    ctx.fillText(type, x+candleWidth/2, y+(type==='BUY'?45:-38));
  }

  if (type==='IMPULSE_UP'||type==='IMPULSE_DOWN') {
    const color = type==='IMPULSE_UP'?'#58a6ff':'#f85149';
    ctx.shadowColor=color; ctx.shadowBlur=isMobile?8:15;
    ctx.fillStyle=color+'30';
    ctx.fillRect(x, scaleY(candle.high), candleWidth, scaleY(candle.low)-scaleY(candle.high));
    ctx.shadowBlur=0;
    const y2 = type==='IMPULSE_UP'?scaleY(candle.low):scaleY(candle.high);
    ctx.font=`bold ${fontSize}px "JetBrains Mono"`; ctx.fillStyle=color; ctx.textAlign='center';
    ctx.fillText(type==='IMPULSE_UP'?'▲ BUYERS':'▼ SELLERS', x+candleWidth/2, y2+(type==='IMPULSE_UP'?18:-8));
  }

  if (type==='MOMENTUM_BURST') {
    ctx.fillStyle='#ffd60a'; ctx.font=`${isMobile?10:14}px Arial`; ctx.textAlign='center';
    ctx.fillText('⚡', x+candleWidth/2, scaleY(candle.high)-8);
  }

  if (type==='HIGH_PROBABILITY') {
    const yT=scaleY(candle.high), yB=scaleY(candle.low);
    const color = signal.direction==='bullish'?'#00d4aa':'#ff4976';
    ctx.fillStyle=color+'15'; ctx.fillRect(x-12,yT,candleWidth+24,yB-yT);
    ctx.strokeStyle=color; ctx.lineWidth=2; ctx.shadowColor=color; ctx.shadowBlur=isMobile?6:12;
    ctx.strokeRect(x-12,yT,candleWidth+24,yB-yT); ctx.shadowBlur=0;
    ctx.font=`bold ${fontSize}px "JetBrains Mono"`; ctx.fillStyle=color; ctx.textAlign='center';
    ctx.fillText('🔥 INST', x+candleWidth/2, yT-10);
    if (signal.mtfConfirmed) ctx.fillText('MTF✓', x+candleWidth/2, yT-1);
  }
}

function drawPriceAxis(ctx, width, padding, minPrice, maxPrice, scaleY, isMobile) {
  const steps = isMobile ? 5 : 8;
  const step  = (maxPrice - minPrice) / steps;
  ctx.font = `${isMobile?9:10}px "JetBrains Mono"`;
  ctx.textAlign = 'left';
  for (let i = 0; i <= steps; i++) {
    const price = minPrice + step * i;
    const y = scaleY(price);
    ctx.strokeStyle='#30363d'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(width-padding.right,y); ctx.lineTo(width-padding.right+4,y); ctx.stroke();
    ctx.fillStyle='#8b949e';
    ctx.fillText(price.toFixed(isMobile?1:2), width-padding.right+5, y+4);
  }
}

function drawPriceLine(ctx, price, scaleY, width, padding, isMobile) {
  const y = scaleY(price);
  ctx.strokeStyle='#58a6ff'; ctx.lineWidth=1; ctx.setLineDash([5,5]);
  ctx.beginPath(); ctx.moveTo(padding.left,y); ctx.lineTo(width-padding.right,y); ctx.stroke();
  ctx.setLineDash([]);
  const bw = isMobile?56:70, bh=isMobile?16:20;
  ctx.fillStyle='#58a6ff';
  ctx.fillRect(width-padding.right+4, y-bh/2, bw, bh);
  ctx.fillStyle='#0a0e14';
  ctx.font=`bold ${isMobile?9:11}px "JetBrains Mono"`;
  ctx.textAlign='center';
  ctx.fillText(price.toFixed(isMobile?1:2), width-padding.right+4+bw/2, y+4);
}

function drawTimeAxis(ctx, candles, padding, chartW, candleWidth, height, isMobile) {
  if (!candles.length) return;
  ctx.fillStyle='#8b949e';
  ctx.font=`${isMobile?8:10}px "JetBrains Mono"`;
  ctx.textAlign='center';
  const step = Math.max(1, Math.floor(candles.length / (isMobile?4:8)));
  for (let i=0; i<candles.length; i+=step) {
    const x = padding.left + i * candleWidth + candleWidth/2;
    const d = new Date(candles[i].timestamp);
    const s = d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
    ctx.fillText(s, x, height - (isMobile?6:20));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UI Components
// ─────────────────────────────────────────────────────────────────────────────

function LandscapeHint() {
  return (
    <div style={{
      display:'flex', alignItems:'center', justifyContent:'center', gap:8,
      background:'#161b22', border:'1px solid #30363d', borderRadius:6,
      padding:'6px 12px', fontSize:11, color:'#8b949e',
      fontFamily:'"JetBrains Mono", monospace',
    }}>
      <span style={{fontSize:16}}>↻</span>
      Rotate for a better view · Landscape mode recommended
    </div>
  );
}

function MobileCandleBar({ candle }) {
  const isBull = candle.close > candle.open;
  const color  = isBull ? '#00d4aa' : '#ff4976';
  const pct    = ((candle.close-candle.open)/candle.open*100).toFixed(2);
  const style  = {
    position:'absolute', bottom:0, left:0, right:0, zIndex:10,
    background:'#161b22ee', borderTop:'1px solid #21262d',
    display:'flex', gap:8, padding:'4px 8px', flexWrap:'wrap',
    fontSize:9, fontFamily:'"JetBrains Mono", monospace',
  };
  const cell = (label, val, c) => (
    <span key={label} style={{display:'flex',gap:3,alignItems:'center'}}>
      <span style={{color:'#8b949e'}}>{label}</span>
      <span style={{color: c||'#e6edf3'}}>{val}</span>
    </span>
  );
  return (
    <div style={style}>
      {cell('O', candle.open.toFixed(2))}
      {cell('H', candle.high.toFixed(2), '#00d4aa')}
      {cell('L', candle.low.toFixed(2), '#ff4976')}
      {cell('C', candle.close.toFixed(2), color)}
      {cell('Δ', `${pct}%`, color)}
      {candle.volume>0 && cell('V', (candle.volume/1000).toFixed(1)+'K')}
    </div>
  );
}

function MobileControlsPanel({ onZoomIn, onZoomOut, onResetZoom, onGoToStart, onGoToEnd, onClose }) {
  const btn = (label, fn, title) => (
    <button
      key={label}
      onClick={fn}
      title={title}
      style={{
        background:'#21262d', border:'1px solid #30363d', borderRadius:6,
        color:'#c9d1d9', fontSize:11, fontFamily:'"JetBrains Mono", monospace',
        padding:'8px 14px', cursor:'pointer', whiteSpace:'nowrap',
      }}
    >
      {label}
    </button>
  );
  return (
    <div style={{
      position:'absolute', top:40, right:6, zIndex:30,
      background:'#0d1117ee', border:'1px solid #30363d', borderRadius:8,
      padding:10, display:'flex', flexDirection:'column', gap:6,
      backdropFilter:'blur(8px)',
    }}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:2}}>
        <span style={{fontSize:10,color:'#8b949e',fontFamily:'"JetBrains Mono",monospace'}}>CHART CONTROLS</span>
        <button onClick={onClose} style={{background:'none',border:'none',color:'#8b949e',cursor:'pointer',fontSize:14}}>✕</button>
      </div>
      {btn('⏮ Start', onGoToStart, 'Go to start')}
      {btn('− Zoom Out', onZoomOut, 'Zoom out')}
      {btn('⊙ Reset', onResetZoom, 'Reset zoom')}
      {btn('+ Zoom In', onZoomIn, 'Zoom in')}
      {btn('End ⏭', onGoToEnd, 'Go to end')}
    </div>
  );
}

function CandleTooltip({ candle, position }) {
  const date   = new Date(candle.timestamp);
  const isBull = candle.close > candle.open;
  const row    = (label, val, color) => (
    <div key={label} style={{display:'flex',justifyContent:'space-between',gap:16}}>
      <span style={{color:'#8b949e'}}>{label}</span>
      <span style={{color: color||'#e6edf3'}}>{val}</span>
    </div>
  );
  return (
    <div style={{
      position:'absolute', left:position.x, top:position.y,
      pointerEvents:'none', zIndex:1000,
      background:'#161b22', border:'1px solid #30363d', borderRadius:8,
      padding:'10px 14px', minWidth:200,
      fontFamily:'"JetBrains Mono", monospace', fontSize:11,
      boxShadow:'0 8px 24px #00000080',
    }}>
      <div style={{color:'#58a6ff',marginBottom:8,fontSize:10}}>
        {date.toLocaleString()}
      </div>
      {row('Open',   candle.open.toFixed(2))}
      {row('High',   candle.high.toFixed(2), '#00d4aa')}
      {row('Low',    candle.low.toFixed(2), '#ff4976')}
      {row('Close',  candle.close.toFixed(2), isBull?'#00d4aa':'#ff4976')}
      {row('Change', ((candle.close-candle.open)/candle.open*100).toFixed(2)+'%', isBull?'#00d4aa':'#ff4976')}
      {candle.volume > 0 && row('Volume', candle.volume.toLocaleString())}
    </div>
  );
}

function ChartControls({ onZoomIn, onZoomOut, onResetZoom, onGoToStart, onGoToEnd }) {
  const btn = (label, fn, title) => (
    <button
      key={label}
      onClick={fn}
      title={title}
      style={{
        background:'#161b22', border:'1px solid #30363d', borderRadius:6,
        color:'#8b949e', fontSize:11, fontFamily:'"JetBrains Mono", monospace',
        padding:'6px 12px', cursor:'pointer', transition:'all 0.15s',
      }}
      onMouseEnter={e => { e.target.style.background='#21262d'; e.target.style.color='#c9d1d9'; }}
      onMouseLeave={e => { e.target.style.background='#161b22'; e.target.style.color='#8b949e'; }}
    >
      {label}
    </button>
  );
  return (
    <div style={{
      display:'flex', gap:6, flexWrap:'wrap', alignItems:'center',
      justifyContent:'center', padding:'4px 0',
    }}>
      {btn('⏮ First', onGoToStart, 'Go to start (Home)')}
      {btn('− Zoom Out', onZoomOut, 'Zoom out (-)')}
      {btn('⊙ Reset', onResetZoom, 'Reset zoom')}
      {btn('+ Zoom In', onZoomIn, 'Zoom in (+)')}
      {btn('Last ⏭', onGoToEnd, 'Go to end (End)')}
    </div>
  );
}
