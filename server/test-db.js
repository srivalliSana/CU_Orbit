const mysql = require('mysql2/promise');
require('dotenv').config();

async function testConnection() {
    console.log('--- Database Connection Test ---');
    const config = {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASS || '@123456Valli',
        database: process.env.DB_NAME || 'cu_orbit',
        port: parseInt(process.env.DB_PORT) || 3306
    };

    console.log(`Target: ${config.user}@${config.host}:${config.port}`);
    console.log(`Database: ${config.database}`);

    try {
        const connection = await mysql.createConnection(config);
        console.log('✅ Success! Connection established.');
        await connection.end();
    } catch (err) {
        console.error('❌ Failed! Could not connect to database.');
        console.error('Error Code:', err.code);
        console.error('Error Message:', err.message);
        
        if (err.code === 'ER_ACCESS_DENIED_ERROR') {
            console.log('\n👉 Tip: The password or username is incorrect.');
            console.log('Check your .env file and ensure DB_USER and DB_PASS are correct.');
        } else if (err.code === 'ECONNREFUSED') {
            console.log('\n👉 Tip: The MySQL server is not running or the host/port is wrong.');
        }
    }
}

testConnection();
