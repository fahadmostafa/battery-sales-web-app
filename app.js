require('dotenv').config();
const ExcelJS = require('exceljs');
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

        // Format the date_sold to 'DD-MM-YYYY' before passing to the view
        rows.forEach(record => {
            record.date_sold = dayjs(record.date_sold).format('DD-MM-YYYY');
        });

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

        // Create a new Excel workbook and worksheet using ExcelJS
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Battery Sales');

        // Define columns
        worksheet.columns = [
            { header: 'Car Brand', key: 'car_brand', width: 20 },
            { header: 'Car Model', key: 'car_model', width: 20 },
            { header: 'Car Year', key: 'car_year', width: 10 },
            { header: 'Battery Brand', key: 'battery_brand', width: 20 },
            { header: 'Battery Model', key: 'battery_model', width: 20 },
            { header: 'Battery Ampere', key: 'battery_ampere', width: 15 },
            { header: 'Battery Serial', key: 'battery_serial', width: 25 },
            { header: 'Price Sold At', key: 'price_sold_at', width: 15 },
            { header: 'Currency', key: 'currency', width: 10 },
            { header: 'Payment Mode', key: 'payment_mode', width: 15 },
            { header: 'Date Sold', key: 'date_sold', width: 15 },
            { header: 'Entry Time', key: 'entry_time', width: 20 }
        ];

        // Add rows to the worksheet
        rows.forEach(record => {
            worksheet.addRow({
                car_brand: record.car_brand,
                car_model: record.car_model,
                car_year: record.car_year,
                battery_brand: record.battery_brand,
                battery_model: record.battery_model,
                battery_ampere: record.battery_ampere,
                battery_serial: record.battery_serial,
                price_sold_at: record.price_sold_at,
                currency: record.currency,
                payment_mode: record.payment_mode,
                date_sold: dayjs(record.date_sold).format('DD-MM-YYYY'),  // Format the date correctly
                entry_time: record.entry_time
            });
        });

        // Set the response headers to trigger the download
        res.setHeader('Content-Disposition', 'attachment; filename="battery_sales_records.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        // Write the Excel file and send it in the response
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error generating Excel file:', error);
        res.status(500).send('Error generating Excel file.');
    }
});


// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
