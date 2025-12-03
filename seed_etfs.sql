CREATE TABLE IF NOT EXISTS etfs (
  symbol TEXT PRIMARY KEY,
  name TEXT
);

DELETE FROM etfs;
INSERT OR IGNORE INTO etfs (symbol, name) VALUES
('SPY', 'SPDR S&P 500 ETF Trust'),
('QQQ', 'Invesco QQQ Trust');
