require('dotenv').config();
const XLSX = require('xlsx');
const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const path = require('path');
const dayjs = require('dayjs');

const app = express();
const PORT = process.env.PORT || 3001;

// PostgreSQL connection setup
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false, // Necessary for connecting to Render's managed database
    },
});

console.log('Connected to PostgreSQL database.');

// Create the `batteries` table if it doesn't exist
const createTableQuery = `
    CREATE TABLE IF NOT EXISTS batteries (
        id SERIAL PRIMARY KEY,
        car_brand TEXT,
        car_model TEXT,
        car_year INTEGER,
        battery_brand TEXT,
        battery_model TEXT,
        battery_ampere TEXT,
        battery_serial TEXT,
        price_sold_at REAL,
        currency TEXT,
        payment_mode TEXT,
        date_sold DATE,
        entry_time TEXT
    );
`;

pool.query(createTableQuery)
    .then(() => console.log('Ensured `batteries` table exists.'))
    .catch((err) => {
        console.error('Error creating table:', err);
        process.exit(1);
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

app.post('/battery-sales-entry', async (req, res) => {
    const {
        car_brand, car_model, car_year, battery_brand,
        battery_model, battery_ampere, battery_serial,
        price_sold_at, date_sold, currency, payment_mode
    } = req.body;

    // Validate price_sold_at
    if (isNaN(price_sold_at) || price_sold_at <= 0) {
        return res.send('Invalid price.');
    }

    // Validate and format date_sold
    const formattedDate = dayjs(date_sold, 'YYYY-MM-DD', true);
    if (!formattedDate.isValid()) {
        return res.send('Invalid date.');
    }
    const formattedDateString = formattedDate.format('DD-MM-YYYY');

    // Capture current time as entry_time
    const entryTime = dayjs().format('DD-MM-YYYY HH:mm:ss');

    const insertQuery = `
        INSERT INTO batteries (
            car_brand, car_model, car_year, battery_brand,
            battery_model, battery_ampere, battery_serial,
            price_sold_at, currency, payment_mode, date_sold, entry_time
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `;

    try {
        await pool.query(insertQuery, [
            car_brand, car_model, car_year, battery_brand,
            battery_model, battery_ampere, battery_serial,
            price_sold_at, currency, payment_mode,
            formattedDateString, entryTime
        ]);
        console.log('Data saved successfully!');
        res.redirect('/battery-sales-records?status=success');
    } catch (error) {
        console.error('Error saving data:', error);
        res.send('Error saving data.');
    }
});

app.post('/delete-record', async (req, res) => {
    const { id } = req.body;

    if (!id) {
        return res.redirect('/battery-sales-records?status=error&message=Invalid+Record+ID');
    }

    try {
        const deleteQuery = `DELETE FROM batteries WHERE id = $1`;
        const result = await pool.query(deleteQuery, [id]);

        if (result.rowCount > 0) {
            console.log(`Record with ID ${id} deleted.`);
            res.redirect('/battery-sales-records?status=success&message=Record+deleted+successfully');
        } else {
            res.redirect('/battery-sales-records?status=error&message=Record+not+found');
        }
    } catch (error) {
        console.error('Error deleting record:', error);
        res.redirect('/battery-sales-records?status=error&message=Server+error');
    }
});

app.get('/battery-sales-records', async (req, res) => {
    const selectQuery = `SELECT * FROM batteries`;
    try {
        const { rows } = await pool.query(selectQuery);
        const { status, message } = req.query; // Extract query parameters
        res.render('sales_records', { batteries: rows, status, message });
    } catch (error) {
        console.error('Error fetching records:', error);
        res.send('Error fetching records.');
    }
});

app.get('/download-records', async (req, res) => {
    const selectQuery = `SELECT * FROM batteries`;

    try {
        const { rows } = await pool.query(selectQuery);

        // Convert the records to a worksheet
        const worksheet = XLSX.utils.json_to_sheet(rows);

        // Create a workbook and append the worksheet
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Battery Sales');

        // Write the workbook to a buffer
        const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        // Set response headers for file download
        res.setHeader('Content-Disposition', 'attachment; filename="battery_sales_records.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        
        // Send the Excel file as the response
        res.send(excelBuffer);
    } catch (error) {
        console.error('Error generating Excel file:', error);
        res.status(500).send('Error generating Excel file.');
    }
});

const alterTableQuery = `
    ALTER TABLE batteries 
    ADD COLUMN IF NOT EXISTS entry_time TEXT,
    ADD COLUMN IF NOT EXISTS payment_mode TEXT,
    ADD COLUMN IF NOT EXISTS currency TEXT;
`;

pool.query(alterTableQuery)
    .then(() => console.log('Table altered successfully.'))
    .catch((err) => console.error('Error altering table:', err));

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
