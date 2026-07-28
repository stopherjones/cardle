import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Serve vehicles.json specifically
app.get('/vehicles.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'vehicles.json'));
});

// Serve static files with .html fallback
app.use(express.static(__dirname, { extensions: ['html'] }));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
});

