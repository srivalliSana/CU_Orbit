# CU Orbit - Professional Messenger

A modern messaging application with Status and Calls features.

## 🚀 Server Setup

The server is built with Node.js and Express. It uses MySQL for data storage.

### Prerequisites
- Node.js installed
- MySQL Server installed and running

### Installation
1. Navigate to the `server` directory.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file from the example:
   ```bash
   cp .env.example .env
   ```
4. Edit the `.env` file with your database credentials:
   - `DB_USER`: Your MySQL username (default: root)
   - `DB_PASS`: Your MySQL password
   - `DB_NAME`: Your database name (default: cu_orbit)
   - `DB_HOST`: Your database host (default: localhost)

### Running the Server
```bash
npm start
```

## 📱 Android App Setup

1. Open the project in Android Studio.
2. Build and run the `app` module.

## 🛠️ Troubleshooting

### "Access denied for user 'root'@'localhost'"
This error means the server cannot connect to MySQL with the provided password.
- Ensure your MySQL server is running.
- Verify that the `DB_USER` and `DB_PASS` in your `.env` file are correct.
- If you haven't created a `.env` file, the server defaults to `root` with password `@123456Valli`.

### Checking Server Health
You can check if the server and database are correctly connected by visiting:
`https://cumessenger.thegttech.com/api/health`
(or `http://localhost:3000/api/health` if running locally)