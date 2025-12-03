interface Env {
	etf_db: D1Database;
	ALPHA_VANTAGE_API_KEY: string;
}

interface EtfProfile {
	net_expense_ratio: string;
	holdings: {
		symbol: string;
		weight: string;
	}[];
}

interface MonthlyTimeSeries {
	"Meta Data": {
		"2. Symbol": string;
	};
	"Monthly Adjusted Time Series": {
		[date: string]: {
			"5. adjusted close": string;
		};
	};
}

export default {
	async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
		const apiKey = env.ALPHA_VANTAGE_API_KEY;

		if (!apiKey) {
			console.error('ALPHA_VANTAGE_API_KEY is not set');
			return;
		}

		try {
			// 1. Get list of ETFs (Rolling Batch: Oldest 5)
			// COALESCE(last_updated, 0) ensures nulls (never updated) come first
			const { results } = await env.etf_db.prepare('SELECT symbol FROM etfs ORDER BY COALESCE(last_updated, 0) ASC LIMIT 5').all<{ symbol: string }>();

			if (!results || results.length === 0) {
				console.log('No ETFs found in database');
				return;
			}

			console.log(`Starting batch update for ${results.length} ETFs`);

			// 2. Process each ETF
			for (const row of results) {
				const symbol = row.symbol;
				console.log(`Processing ${symbol}...`);

				try {
					// Fetch Data
					const [profile, timeSeries] = await Promise.all([
						fetchEtfProfile(symbol, apiKey),
						fetchMonthlyTimeSeries(symbol, apiKey)
					]);

					if (!profile || !timeSeries) {
						console.error(`Failed to fetch data for ${symbol}`);
						continue;
					}

					// Calculate CAGRs
					const cagrs = calculateCagrs(timeSeries);

					// Store Data in D1
					await storeData(env.etf_db, symbol, profile, cagrs);

					// Update last_updated timestamp
					await env.etf_db.prepare('UPDATE etfs SET last_updated = ? WHERE symbol = ?')
						.bind(Date.now(), symbol)
						.run();

					console.log(`Successfully updated data for ${symbol}`);

					// Alpha Vantage has rate limits (e.g., 5 calls/min for free tier, higher for premium).
					// Adding a small delay to be safe, though for 40 ETFs on free tier this will still fail.
					// Assuming user has a key that supports this volume or understands the limit.
					// 12 seconds delay = 5 calls/minute max.
					// await new Promise(resolve => setTimeout(resolve, 12000)); 

				} catch (err) {
					console.error(`Error processing ${symbol}:`, err);
				}
			}

		} catch (error) {
			console.error('Error in scheduled task:', error);
		}
	},
};

async function fetchEtfProfile(symbol: string, apiKey: string): Promise<EtfProfile | null> {
	const url = `https://www.alphavantage.co/query?function=ETF_PROFILE&symbol=${symbol}&apikey=${apiKey}`;
	const response = await fetch(url);
	if (!response.ok) {
		console.error(`Error fetching ETF profile: ${response.statusText}`);
		return null;
	}
	return await response.json() as EtfProfile;
}

async function fetchMonthlyTimeSeries(symbol: string, apiKey: string): Promise<MonthlyTimeSeries | null> {
	const url = `https://www.alphavantage.co/query?function=TIME_SERIES_MONTHLY_ADJUSTED&symbol=${symbol}&apikey=${apiKey}`;
	const response = await fetch(url);
	if (!response.ok) {
		console.error(`Error fetching time series: ${response.statusText}`);
		return null;
	}
	return await response.json() as MonthlyTimeSeries;
}

function calculateCagrs(data: MonthlyTimeSeries) {
	const timeSeries = data["Monthly Adjusted Time Series"];
	const dates = Object.keys(timeSeries).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

	if (dates.length === 0) return { cagr1yr: 0, cagr3yr: 0, cagr5yr: 0 };

	const latestDate = dates[0];
	const latestPrice = parseFloat(timeSeries[latestDate]["5. adjusted close"]);

	const getPriceYearsAgo = (years: number) => {
		// Approximate months
		const targetIndex = years * 12;
		if (targetIndex >= dates.length) return null;

		const targetDate = dates[targetIndex];
		return parseFloat(timeSeries[targetDate]["5. adjusted close"]);
	};

	const calculateCagr = (years: number) => {
		const pastPrice = getPriceYearsAgo(years);
		if (!pastPrice) return 0;
		return Math.pow(latestPrice / pastPrice, 1 / years) - 1;
	};

	return {
		cagr1yr: calculateCagr(1),
		cagr3yr: calculateCagr(3),
		cagr5yr: calculateCagr(5)
	};
}

async function storeData(db: D1Database, symbol: string, profile: EtfProfile, cagrs: { cagr1yr: number, cagr3yr: number, cagr5yr: number }) {
	// 1. Upsert Fundamentals
	await db.prepare(`
		INSERT INTO etf_fundamentals (etf, expense_ratio, "1yr_cagr", "3yr_cagr", "5yr_cagr")
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(etf) DO UPDATE SET
			expense_ratio = excluded.expense_ratio,
			"1yr_cagr" = excluded."1yr_cagr",
			"3yr_cagr" = excluded."3yr_cagr",
			"5yr_cagr" = excluded."5yr_cagr"
	`).bind(
		symbol,
		parseFloat(profile.net_expense_ratio),
		cagrs.cagr1yr,
		cagrs.cagr3yr,
		cagrs.cagr5yr
	).run();

	// 2. Replace Holdings
	// Transaction would be better here, but D1 batching is good enough for now
	await db.prepare('DELETE FROM etf_holdings WHERE etf = ?').bind(symbol).run();

	const stmt = db.prepare('INSERT INTO etf_holdings (etf, holding, weight) VALUES (?, ?, ?)');
	const batch = profile.holdings.map(h => stmt.bind(symbol, h.symbol, parseFloat(h.weight)));

	if (batch.length > 0) {
		await db.batch(batch);
	}
}
