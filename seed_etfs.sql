CREATE TABLE IF NOT EXISTS etfs (
  symbol TEXT PRIMARY KEY,
  name TEXT,
  last_updated INTEGER
);

DELETE FROM etfs;
INSERT OR IGNORE INTO etfs (symbol, name) VALUES
('SPY', 'SPDR S&P 500 ETF Trust'),
('QQQ', 'Invesco QQQ Trust'),
('VTI', 'Vanguard Total Stock Market ETF'),
('VOO', 'Vanguard S&P 500 ETF'),
('IVV', 'iShares Core S&P 500 ETF'),
('DIA', 'SPDR Dow Jones Industrial Average ETF Trust'),
('IWM', 'iShares Russell 2000 ETF'),
('EFA', 'iShares MSCI EAFE ETF'),
('VWO', 'Vanguard FTSE Emerging Markets ETF'),
('AGG', 'iShares Core U.S. Aggregate Bond ETF');
