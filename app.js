const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3001;

const defaultDbPath = '/var/data/battery_sales.db'; // Render's persistent storage directory
const dbPath = process.env.DATABASE_PATH || defaultDbPath;

// Ensure the directory exists
const dbDirectory = path.dirname(dbPath);
if (!fs.existsSync(dbDirectory)) {
    fs.mkdirSync(dbDirectory, { recursive: true });
}


// Initialize the SQLite database
const db = new Database(dbPath, { verbose: console.log });

console.log('Connected to the SQLite database using better-sqlite3.');

const createTableQuery = `
    CREATE TABLE IF NOT EXISTS batteries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        car_brand TEXT,
        car_model TEXT,
        car_year INTEGER,
        battery_brand TEXT,
        battery_model TEXT,
        battery_ampere TEXT,
        battery_serial TEXT,
        price_sold_at REAL,
        date_sold TEXT
    );
`;

const prepareTable = db.prepare(createTableQuery);
prepareTable.run();

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');

// Routes
app.get('/', (req, res) => {
    res.render('index');
});

app.get('/battery-sales-entry', (req, res) => {
    res.render('sales_entry');
});

app.post('/battery-sales-entry', (req, res) => {
    const {
        car_brand, car_model, car_year, battery_brand,
        battery_model, battery_ampere, battery_serial,
        price_sold_at, date_sold
    } = req.body;

    // Validate price_sold_at
    if (isNaN(price_sold_at) || price_sold_at <= 0) {
        return res.send('Invalid price.');
    }

    // Validate date_sold
    if (!Date.parse(date_sold)) {
        return res.send('Invalid date.');
    }

    const insertQuery = `
        INSERT INTO batteries (
            car_brand, car_model, car_year, battery_brand,
            battery_model, battery_ampere, battery_serial,
            price_sold_at, date_sold
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const insert = db.prepare(insertQuery);
    const result = insert.run(car_brand, car_model, car_year, battery_brand, battery_model, battery_ampere, battery_serial, price_sold_at, date_sold);

    if (result) {
        console.log('Data saved successfully!');
        res.redirect('/battery-sales-records');
    } else {
        console.error('Error saving data');
        res.send('Error saving data');
    }
});

app.get('/battery-sales-records', (req, res) => {
    const selectQuery = `SELECT * FROM batteries`;
    const rows = db.prepare(selectQuery).all();

    if (rows) {
        res.render('sales_records', { batteries: rows });
    } else {
        console.error('Error fetching records');
        res.send('Error fetching records');
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
