// save as sync.js in your project
const express = require('express');
const fs = require('fs');
const app = express();

app.use(express.json());

app.post('/update', (req, res) => {
  fs.writeFileSync('data.json', JSON.stringify(req.body, null, 2));
  console.log('data.json updated successfully!');
  res.sendStatus(200);
});

app.listen(3000, () => console.log('Local sync server running on port 3000'));