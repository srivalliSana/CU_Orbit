import React, { useState } from 'react';

const LandingPage = ({ os }) => {
  const [showIosModal, setShowIosModal] = useState(false);

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col p-6 font-sans">
      {/* Header */}
      <header className="flex flex-col items-center mt-8 mb-12 text-center">
        <div className="w-20 h-20 bg-blue-500 rounded-3xl flex items-center justify-center shadow-2xl mb-4 rotate-3">
          <i className="fa-solid fa-satellite-dish text-4xl text-slate-900"></i>
        </div>
        <h1 className="text-4xl font-black tracking-tight">CU Mess</h1>
        <p className="text-blue-400 font-bold text-sm tracking-widest uppercase">Centurion University</p>
      </header>

      {/* App Details */}
      <main className="flex-1 max-w-lg mx-auto w-full">
        <section className="bg-slate-900/50 rounded-[2rem] p-8 border border-slate-800 shadow-xl mb-8">
          <h2 className="text-2xl font-bold mb-2">Eat Smart. Stay Connected.</h2>
          <p className="text-slate-400 leading-relaxed mb-6">
            The official university companion for mess menus, meal bookings, real-time feedback, and campus communication.
          </p>

          <ul className="space-y-3 mb-8">
            {['Daily Mess Menu', 'Instant Meal Booking', '@Mentions & Tagging', 'Secure Payments'].map((f, i) => (
              <li key={i} className="flex items-center space-x-3 text-sm text-slate-300">
                <i className="fa-solid fa-circle-check text-green-500"></i>
                <span>{f}</span>
              </li>
            ))}
          </ul>

          {/* Download Buttons */}
          <div className="grid grid-cols-1 gap-4">
            <a
              href="/downloads/cu_orbit.apk"
              download
              className="bg-blue-500 hover:bg-blue-400 text-slate-900 font-black py-5 px-8 rounded-2xl flex items-center justify-center space-x-4 transition-all shadow-lg active:scale-95"
            >
              <i className="fa-brands fa-android text-3xl"></i>
              <div className="text-left">
                <div className="text-[10px] uppercase opacity-70">Download for</div>
                <div className="text-lg leading-none">Android APK</div>
              </div>
            </a>

            <button
              onClick={() => setShowIosModal(true)}
              className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-5 px-8 rounded-2xl flex items-center justify-center space-x-4 transition-all border border-slate-700"
            >
              <i className="fa-brands fa-apple text-3xl"></i>
              <div className="text-left">
                <div className="text-[10px] uppercase opacity-50">Coming Soon</div>
                <div className="text-lg leading-none">iOS Version</div>
              </div>
            </button>
          </div>
        </section>

        <p className="text-center text-[10px] text-slate-500 uppercase tracking-widest mb-10">
          Developed by Centurion University <br /> Version 1.0.21 | System: {os}
        </p>
      </main>

      {/* iOS Modal */}
      {showIosModal && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-50 flex items-center justify-center p-6">
          <div className="bg-slate-900 p-10 rounded-[2.5rem] border border-slate-800 text-center max-w-sm shadow-2xl scale-in">
             <i className="fa-brands fa-apple text-6xl text-white mb-6 animate-pulse"></i>
             <h3 className="text-2xl font-bold mb-4">Coming Soon 🍎</h3>
             <p className="text-slate-400 mb-8">The iOS version of CU Mess is under development. Stay tuned for the App Store release!</p>
             <button
              onClick={() => setShowIosModal(false)}
              className="w-full bg-slate-800 py-4 rounded-2xl font-bold hover:bg-slate-700 transition-colors"
             >
               Close
             </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LandingPage;
