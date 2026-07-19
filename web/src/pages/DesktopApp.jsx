import React, { useState, useEffect } from 'react';
import api from '../api/api';

const DesktopApp = ({ os }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('orbit_session');
    if (saved) setUser(JSON.parse(saved));
    setLoading(false);
  }, []);

  if (loading) return <div className="h-screen bg-[#0f172a] flex items-center justify-center text-blue-500 font-bold">Orbiting...</div>;

  if (!user) return <LoginView onLogin={setUser} />;

  return (
    <div className="h-screen bg-[#0f172a] flex text-white overflow-hidden font-sans">
      {/* Sidebar */}
      <nav className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col shadow-2xl z-20">
        <div className="p-8 border-b border-slate-800/50 flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center font-black text-slate-900 shadow-lg shadow-blue-500/20">CU</div>
            <div className="font-black text-xl tracking-tighter text-white">Orbit Web</div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {['Mess Menu', 'Meal Booking', 'Feedback', 'Payments', 'Directory'].map((item) => (
                <div key={item} className="flex items-center space-x-4 p-4 rounded-2xl hover:bg-slate-800/50 cursor-pointer group transition-all">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-700 group-hover:bg-blue-500 transition-colors"></div>
                    <span className="text-sm font-bold text-slate-400 group-hover:text-white transition-colors uppercase tracking-widest">{item}</span>
                </div>
            ))}
        </div>

        <div className="p-6 bg-slate-950/40 border-t border-slate-800 flex items-center space-x-4">
            <img
                src={user.avatarUrl ? `https://cumess.cutm.ac.in${user.avatarUrl}` : `https://ui-avatars.com/api/?name=${user.name}&background=random`}
                className="w-12 h-12 rounded-2xl object-cover bg-slate-800 border border-slate-700 shadow-xl"
            />
            <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{user.name}</p>
                <p className="text-[9px] text-blue-400 font-black uppercase tracking-tighter">System: {os}</p>
            </div>
            <button
                onClick={() => { localStorage.removeItem('orbit_session'); window.location.reload(); }}
                className="p-3 text-slate-500 hover:text-red-400 transition-colors"
            >
                <i className="fa-solid fa-power-off text-lg"></i>
            </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative">
          <header className="h-20 bg-slate-900/50 backdrop-blur-md border-b border-slate-800 flex items-center px-10 justify-between">
              <h2 className="text-2xl font-black tracking-tight text-white uppercase italic">Today's Mess Menu</h2>
              <div className="flex items-center space-x-4">
                  <div className="px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 text-green-500 text-[10px] font-black tracking-widest uppercase">Verified Hub</div>
              </div>
          </header>

          <section className="flex-1 overflow-y-auto p-10">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {/* SKELETON LOADING EXAMPLE */}
                  {[1,2,3].map(i => (
                    <div key={i} className="bg-slate-900/40 border border-slate-800/50 rounded-[2.5rem] p-8 hover:border-blue-500/30 transition-all group relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-100 transition-opacity">
                            <i className="fa-solid fa-utensils text-4xl text-blue-500"></i>
                        </div>
                        <div className="h-6 w-32 bg-slate-800 rounded-lg mb-4 animate-pulse"></div>
                        <div className="h-4 w-48 bg-slate-800 rounded-lg mb-2 animate-pulse"></div>
                        <div className="h-4 w-40 bg-slate-800 rounded-lg animate-pulse"></div>
                    </div>
                  ))}
              </div>
          </section>
      </main>
    </div>
  );
};

const LoginView = ({ onLogin }) => {
    const [phone, setPhone] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        if (phone.length < 10) return;
        setLoading(true);
        try {
            const res = await api.post('/auth/login', { phone });
            if (res.data.success) {
                localStorage.setItem('orbit_session', JSON.stringify(res.data.user));
                onLogin(res.data.user);
            } else alert('Unauthorized access');
        } catch (e) { alert('Network Error'); }
        setLoading(false);
    };

    return (
        <div className="h-screen bg-slate-950 flex items-center justify-center p-6 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-950 to-slate-950 font-sans">
            <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-[3rem] p-12 shadow-2xl text-center">
                <div className="w-20 h-20 bg-blue-500 rounded-3xl mx-auto flex items-center justify-center mb-8 rotate-3 shadow-xl shadow-blue-500/20">
                    <i className="fa-solid fa-lock text-3xl text-slate-900"></i>
                </div>
                <h1 className="text-4xl font-black text-white mb-2 italic">Web Access</h1>
                <p className="text-slate-400 mb-10 text-sm font-medium tracking-wide">Secure university login via phone number</p>

                <input
                    type="tel"
                    placeholder="Enter 10-digit number"
                    className="w-full bg-slate-950 border border-slate-800 p-5 rounded-2xl mb-4 focus:ring-2 focus:ring-blue-500 outline-none text-center text-lg font-bold tracking-widest text-white placeholder-slate-600 transition-all"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                />

                <button
                    onClick={handleLogin}
                    disabled={loading || phone.length < 10}
                    className="w-full bg-blue-500 hover:bg-blue-400 text-slate-950 font-black p-5 rounded-2xl shadow-lg shadow-blue-500/20 disabled:opacity-30 transition-all active:scale-95"
                >
                    {loading ? 'AUTHENTICATING...' : 'AUTHORIZE LOGIN'}
                </button>
            </div>
        </div>
    );
};

export default DesktopApp;
