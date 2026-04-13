export async function GET(request) {
  const { searchParams } = new URL(request.url);

  const symbol = searchParams.get('symbol') || 'XAUUSD';
  const timeframe = searchParams.get('timeframe') || '5m';

  const apiKey = process.env.FINAGE_API_KEY;

  if (!apiKey) {
    return Response.json({
      error: 'API key not configured'
    }, { status: 500 });
  }

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

  const { multiply, time } = timeframeMap[timeframe] || timeframeMap['5m'];

  let startDate, endDate;

  const startParam = searchParams.get('startDate');
  const endParam = searchParams.get('endDate');

  if (startParam && endParam) {
    startDate = new Date(startParam);
    endDate = new Date(endParam);
  } else {
    endDate = new Date();
    startDate = new Date();

    if (time === 'day') {
      startDate.setDate(endDate.getDate() - 365);
    } else {
      startDate.setDate(endDate.getDate() - 7);
    }
  }

  const formatDate = (date) => date.toISOString().split('T')[0];

  const isCrypto = ['BTCUSD', 'ETHUSD', 'BNBUSD', 'SOLUSD'].includes(symbol);

  const endpoint = isCrypto
    ? `https://api.finage.co.uk/agg/crypto/${symbol}/${multiply}/${time}/${formatDate(startDate)}/${formatDate(endDate)}`
    : `https://api.finage.co.uk/agg/forex/${symbol}/${multiply}/${time}/${formatDate(startDate)}/${formatDate(endDate)}`;

  const url = `${endpoint}?apikey=${apiKey}&limit=5000`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Finage API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.results) {
      return Response.json({ candles: [] });
    }

    const candles = data.results.map(c => ({
      timestamp: new Date(c.t).toISOString(),
      open: c.o,
      high: c.h,
      low: c.l,
      close: c.c,
      volume: c.v || 0,
    }));

    return Response.json({
      candles,
      symbol,
      timeframe,
      count: candles.length,
    });

  } catch (error) {
    return Response.json({
      error: 'Failed to fetch data',
      details: error.message
    }, { status: 500 });
  }
        }
