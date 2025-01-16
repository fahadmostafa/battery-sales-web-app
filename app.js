require('dotenv').config();
const ExcelJS = require('exceljs');
const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const path = require('path');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

const app = express();
const PORT = process.env.PORT || 3001;

// PostgreSQL connection setup
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || '',
    ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("railway.app")
        ? { rejectUnauthorized: false } // Necessary for Railway's managed database
        : false,
    max: 10, // Max connections in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
});

if (!process.env.DATABASE_URL) {
    console.error('Error: DATABASE_URL environment variable is not set.');
    process.exit(1); // Exit the application if the database URL is missing
}

pool.connect((err, client, release) => {
    if (err) {
        console.error('Database connection error details:', err);
        return;
    }
    console.log('Connected to the database!');
    release();
});

console.log('DATABASE_URL:', process.env.DATABASE_URL);
console.log('Connected to PostgreSQL database.');

// Create the `batteries` table if it doesn't exist
const createTableQuery = `
    CREATE TABLE IF NOT EXISTS batteries (
        id SERIAL PRIMARY KEY,
        car_brand VARCHAR(100),
        car_model VARCHAR(100),
        car_year INTEGER,
        battery_brand VARCHAR(100),
        battery_model VARCHAR(100),
        battery_ampere VARCHAR(50),
        battery_serial VARCHAR(255),
        price_sold_at NUMERIC(10, 2),
        currency VARCHAR(10),
        payment_mode VARCHAR(50),
        date_sold DATE,
        entry_time TIMESTAMP
    );
`;

pool.query(createTableQuery)
    .then(() => console.log('Ensured `batteries` table exists.'))
    .catch((err) => {
        console.error('Error creating table:', err);
        process.exit(1);
    });

// Middleware
app.use(express.json());
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

    if (isNaN(price_sold_at) || price_sold_at <= 0) {
        return res.send('Invalid price.');
    }

    let formattedDate = dayjs(date_sold, 'DD-MM-YYYY', true);
    if (!formattedDate.isValid()) {
        formattedDate = dayjs(date_sold, 'YYYY-MM-DD', true);
    }

    if (!formattedDate.isValid()) {
        return res.send('Invalid date. Please make sure the format is DD-MM-YYYY or YYYY-MM-DD.');
    }

    const formattedDateString = formattedDate.format('YYYY-MM-DD');

    // Set entry_time to UAE time zone
    const entryTime = dayjs().tz('Asia/Dubai').format('YYYY-MM-DD HH:mm:ss');  // Format as YYYY-MM-DD HH:mm:ss for consistency

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
            price_sold_at, currency, payment_mode, formattedDateString, entryTime
        ]);
        res.redirect('/battery-sales-records?status=success');
    } catch (error) {
        console.error('Error saving data:', error);
        res.send(`Error saving data: ${error.message}`);
    }
});

app.get('/battery-sales-records', async (req, res) => {
    const { page = 1, limit = 20, status = '', message = '' } = req.query; // Default to empty strings if not set
    const offset = (page - 1) * limit;

    const selectQuery = `
        SELECT * FROM batteries
        ORDER BY date_sold DESC
        LIMIT $1 OFFSET $2
    `;

    try {
        const { rows } = await pool.query(selectQuery, [limit, offset]);

        rows.forEach(record => {
            record.date_sold = dayjs(record.date_sold).format('DD-MM-YYYY');
        });

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

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Battery Sales');

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

        rows.forEach(record => {
            worksheet.addRow({
                ...record,
                date_sold: dayjs(record.date_sold).format('DD-MM-YYYY'),
            });
        });

        res.setHeader('Content-Disposition', 'attachment; filename="battery_sales_records.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error generating Excel file:', error);
        res.status(500).send('Error generating Excel file.');
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
