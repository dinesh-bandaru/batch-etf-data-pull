DROP TABLE IF EXISTS etf_holdings;
CREATE TABLE etf_holdings (
  etf TEXT,
  holding TEXT,
  weight REAL,
  PRIMARY KEY (etf, holding)
);

CREATE TABLE IF NOT EXISTS etf_fundamentals (
  etf TEXT PRIMARY KEY,
  expense_ratio REAL,
  "1yr_cagr" REAL,
  "3yr_cagr" REAL,
  "5yr_cagr" REAL
);
