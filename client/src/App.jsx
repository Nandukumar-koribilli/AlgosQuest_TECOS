import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import { ToastProvider } from './components/Toaster';
import Home from './pages/Home';
import Download from './pages/Download';
import Transfers from './pages/Transfers';
import NotFound from './pages/NotFound';
import './App.css';

export default function App() {
  return (
    <Router>
      <ToastProvider>
        <div className="app">
          <div className="orbs" aria-hidden="true">
            <span className="orb orb-1" />
            <span className="orb orb-2" />
            <span className="orb orb-3" />
          </div>
          <Header />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/download/:id" element={<Download />} />
              <Route path="/transfers" element={<Transfers />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
        </div>
      </ToastProvider>
    </Router>
  );
}
