const mysql = require('mysql2/promise');
require('dotenv').config();

async function setup() {
    const config = {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASS || '@123456Valli',
        port: parseInt(process.env.DB_PORT) || 3306
    };

    try {
        const connection = await mysql.createConnection(config);
        console.log('✅ Connected to MySQL server.');

        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'cu_orbit'}\`;`);
        console.log(`✅ Database '${process.env.DB_NAME || 'cu_orbit'}' ensured.`);

        await connection.end();
        console.log('\n🚀 Database setup complete. You can now start the server.');
    } catch (err) {
        console.error('❌ Setup Failed!');
        console.error(err.message);
        console.log('\n👉 Tip: Make sure your MySQL password is correct in server.js or .env file.');
    }
}

setup();
