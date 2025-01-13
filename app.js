const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 3001;

// Correct database path
const dbPath = path.resolve(__dirname, 'battery_sales.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');

        // Create the table if it does not exist
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
        
        db.run(createTableQuery, (err) => {
            if (err) {
                console.error('Error creating table:', err.message);
            } else {
                console.log('Table created or already exists.');
            }
        });
    }
});


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

    const query = `
        INSERT INTO batteries (
            car_brand, car_model, car_year, battery_brand,
            battery_model, battery_ampere, battery_serial,
            price_sold_at, date_sold
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(query, [car_brand, car_model, car_year, battery_brand, battery_model, battery_ampere, battery_serial, price_sold_at, date_sold], function (err) {
        if (err) {
            console.error('Error saving data:', err.message);
            return res.send('Error saving data');
        }
        console.log('Data saved successfully!');
        res.redirect('/battery-sales-records');
    });
});


app.get('/battery-sales-records', (req, res) => {
    const query = `SELECT * FROM batteries`;
    db.all(query, [], (err, rows) => {
        if (err) return res.send('Error fetching records');
        res.render('sales_records', { batteries: rows });
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
