import React from 'react';
import { useDeviceDetect } from './hooks/useDeviceDetect';
import LandingPage from './pages/LandingPage';
import DesktopApp from './pages/DesktopApp';

const App = () => {
  const { isMobile, os } = useDeviceDetect();

  // If on mobile/tablet, show the landing/download page
  if (isMobile) {
    return <LandingPage os={os} />;
  }

  // If on desktop/laptop, show the full web application
  return <DesktopApp os={os} />;
};

export default App;
