import { NavLink, Link } from 'react-router-dom';
import { ShieldCheck, Upload, List, Lock } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import './Header.css';

export default function Header() {
  return (
    <header className="header">
      <div className="header-container">
        <Link to="/" className="logo">
          <div className="logo-icon">
            <ShieldCheck size={22} />
          </div>
          <div className="logo-text">
            <span className="logo-title">SecureTransfer</span>
            <span className="logo-subtitle">Encrypted · Compressed</span>
          </div>
        </Link>

        <nav className="nav" aria-label="Primary">
          <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Upload size={16} />
            <span>Send</span>
          </NavLink>
          <NavLink to="/transfers" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <List size={16} />
            <span>Transfers</span>
          </NavLink>
        </nav>

        <div className="header-actions">
          <div className="header-badge" title="AES-256-GCM authenticated encryption">
            <Lock size={12} />
            <span>AES-256-GCM</span>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
