const express = require('express');
const path = require('path');
const app = express();

// Set the path to your APK file
// Make sure you place your 'cu_orbit.apk' inside the landing_page folder!
const apkPath = path.join(__dirname, 'cu_orbit.apk');

app.get('/', (req, res) => {
    const userAgent = req.get('User-Agent');

    // Check if the user is on a mobile device (Android, iPhone, etc.)
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

    if (isMobile) {
        // If mobile, start the download
        res.download(apkPath, 'CU_Orbit.apk', (err) => {
            if (err) {
                res.status(404).send('<h1>APK file not found. Please upload it to the server.</h1>');
            }
        });
    } else {
        // If web/desktop, show the status message
        res.send(`
            <div style="height: 100vh; display: flex; align-items: center; justify-content: center; font-family: sans-serif; background: #0f172a; color: white;">
                <div style="text-align: center; padding: 40px; border: 1px solid #1e293b; border-radius: 20px; background: #1e293b;">
                    <h1 style="color: #38bdf8;">CU Orbit</h1>
                    <p style="font-size: 1.2rem; opacity: 0.8;">Web application will come soon for this.</p>
                    <p style="font-size: 0.9rem; color: #94a3b8; margin-top: 20px;">Open this link on your mobile to download the app.</p>
                </div>
            </div>
        `);
    }
});

module.exports = app;
