import React, { useEffect, useState } from "react";
import {
  LogOut, BarChart3, Building2, Users, Database, Moon, Sun,
  ClipboardList, Settings as SettingsIcon, Menu, X,
} from "lucide-react";

const NAV = {
  admin: [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "accommodations", label: "Accommodations", icon: Building2 },
    { id: "settings", label: "Settings", icon: SettingsIcon },
  ],
  superadmin: [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "accommodations", label: "Accommodations", icon: Building2 },
    { id: "admins", label: "Admin accounts", icon: Users },
    { id: "data", label: "Data", icon: Database },
    { id: "settings", label: "Settings", icon: SettingsIcon },
  ],
};

function staffNav(approved) {
  const items = [];
  if (approved) {
    items.push({ id: "summary", label: "Overview", icon: BarChart3 });
    items.push({ id: "overnight", label: "Overnight", icon: Moon });
    items.push({ id: "daytour", label: "Day tour", icon: Sun });
    items.push({ id: "history", label: "History", icon: ClipboardList });
  }
  items.push({ id: "settings", label: "Settings", icon: SettingsIcon });
  return items;
}

export default function Sidebar({ user, mainTab, setMainTab, onLogout, onOpenAccount, staffApproved }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = user.role === "staff" ? staffNav(staffApproved) : NAV[user.role];
  const roleLabel = user.role === "superadmin" ? "Super Admin" : user.role === "admin" ? "Admin" : "Accommodation Staff";

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  function navigate(tab) {
    setMainTab(tab);
    setMobileOpen(false);
  }

  return (
    <>
      <header className="tas-mobilebar">
        <div className="tas-mobilebrand">
          <img src="/wadi1.png" alt="Wadi logo" />
          <span>Tourism Casiguran<br />Arrivals System</span>
        </div>
        <button
          type="button"
          className="tas-menubtn"
          aria-label="Open navigation menu"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
        >
          <Menu size={22} />
        </button>
      </header>

      <button
        type="button"
        className={`tas-menuoverlay ${mobileOpen ? "open" : ""}`}
        aria-label="Close navigation menu"
        tabIndex={mobileOpen ? 0 : -1}
        onClick={() => setMobileOpen(false)}
      />

      <aside className={`tas-sidebar ${mobileOpen ? "mobile-open" : ""}`} aria-label="Main navigation">
        <div className="tas-brand">
          <img className="sidebar-logo" src="/wadi1.png" alt="Wadi logo" />
          <div className="tas-brand-name"><div className="name">Tourism Casiguran<br />Arrivals System</div></div>
          <button type="button" className="tas-menuclose" aria-label="Close navigation menu" onClick={() => setMobileOpen(false)}>
            <X size={21} />
          </button>
        </div>
        <nav className="tas-nav" aria-label="System sections">
          {items.map((it) => (
            <button key={it.id} className={`tas-navbtn ${mainTab === it.id ? "active" : ""}`} onClick={() => navigate(it.id)}>
              <it.icon size={17} /> {it.label}
            </button>
          ))}
        </nav>
        <div className="tas-sidefoot">
          <button
            className={`tas-userchip ${mainTab === "settings" ? "active" : ""}`}
            onClick={() => { onOpenAccount(); setMobileOpen(false); }}
          >
            <b>{user.name || user.username}</b>{roleLabel}
          </button>
          <button className="tas-logout" onClick={onLogout}><LogOut size={14} /> Log out</button>
        </div>
      </aside>
    </>
  );
}
