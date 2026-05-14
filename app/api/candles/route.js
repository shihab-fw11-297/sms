// app/api/market-data/route.js

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  const symbol = (searchParams.get('symbol') || 'XAUUSD').toUpperCase();
  const timeframe = searchParams.get('timeframe') || '5m';

  const apiKey = process.env.FINAGE_API_KEY;

  if (!apiKey) {
    return Response.json(
      {
        error: 'API key not configured',
      },
      { status: 500 }
    );
  }

  // =========================
  // TIMEFRAME MAP
  // =========================
  const timeframeMap = {
    '1m': { multiply: 1, time: 'minute' },
    '2m': { multiply: 2, time: 'minute' },
    '5m': { multiply: 5, time: 'minute' },
    '15m': { multiply: 15, time: 'minute' },
    '30m': { multiply: 30, time: 'minute' },
    '1h': { multiply: 1, time: 'hour' },
    '4h': { multiply: 4, time: 'hour' },
    '1D': { multiply: 1, time: 'day' },
  };

  const { multiply, time } =
    timeframeMap[timeframe] || timeframeMap['5m'];

  // =========================
  // DATE RANGE
  // =========================
  let startDate;
  let endDate;

  const startParam = searchParams.get('startDate');
  const endParam = searchParams.get('endDate');

  if (startParam && endParam) {
    startDate = new Date(startParam);
    endDate = new Date(endParam);
  } else {
    endDate = new Date();
    startDate = new Date();

    // Longer history for daily timeframe
    if (time === 'day') {
      startDate.setDate(endDate.getDate() - 365);
    } else {
      startDate.setDate(endDate.getDate() - 7);
    }
  }

  const formatDate = (date) =>
    date.toISOString().split('T')[0];

  // =========================
  // MARKET TYPE DETECTION
  // =========================

  // Crypto Symbols
  const cryptoSymbols = [
    'BTCUSD',
    'ETHUSD',
    'BNBUSD',
    'ETCUSD',
    'SOLUSD',
  ];

  // Forex & Metals
  const forexSymbols = [
    'XAUUSD',

    'EURUSD',
    'GBPUSD',
    'USDJPY',
    'USDCHF',
    'USDCAD',
    'AUDUSD',
    'NZDUSD',

    'EURGBP',
    'EURJPY',
    'GBPJPY',
    'AUDJPY',
  ];

  // Default = stock
  let marketType = 'stock';

  if (cryptoSymbols.includes(symbol)) {
    marketType = 'crypto';
  } else if (forexSymbols.includes(symbol)) {
    marketType = 'forex';
  }

  // =========================
  // BUILD ENDPOINT
  // =========================
  let endpoint = '';

  switch (marketType) {
    case 'crypto':
      endpoint = `https://api.finage.co.uk/agg/crypto/${symbol}/${multiply}/${time}/${formatDate(startDate)}/${formatDate(endDate)}`;
      break;

    case 'forex':
      endpoint = `https://api.finage.co.uk/agg/forex/${symbol}/${multiply}/${time}/${formatDate(startDate)}/${formatDate(endDate)}`;
      break;

    case 'stock':
    default:
      endpoint = `https://api.finage.co.uk/agg/stock/${symbol}/${multiply}/${time}/${formatDate(startDate)}/${formatDate(endDate)}`;
      break;
  }

  const url = `${endpoint}?apikey=${apiKey}&limit=30000`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Finage API error: ${response.status}`);
    }

    const data = await response.json();

    // Empty response
    if (!data.results) {
      return Response.json({
        candles: [],
        symbol,
        timeframe,
        marketType,
        count: 0,
      });
    }

    // Normalize candles
    const candles = data.results.map((candle) => ({
      timestamp: new Date(candle.t).toISOString(),
      open: candle.o,
      high: candle.h,
      low: candle.l,
      close: candle.c,
      volume: candle.v || 0,
    }));

    return Response.json({
      candles,
      symbol,
      timeframe,
      marketType,
      count: candles.length,
    });
  } catch (error) {
    console.error('Finage fetch error:', error);

    return Response.json(
      {
        error: 'Failed to fetch market data',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
