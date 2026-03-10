const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/markets', require('./routes/markets'));
app.use('/api/leaderboard', require('./routes/leaderboard'));

app.get('/api/health', (req, res) => res.json({ success: true, message: 'FooliMarket API' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ success: false, message: err.message || 'Server error' });
});

module.exports = app;
