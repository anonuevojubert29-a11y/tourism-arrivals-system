import React, { useMemo, useState } from "react";
import {
  Bell, Building2, Check, CheckCheck, CircleAlert, ClipboardCheck, Info, Trash2,
} from "lucide-react";
import ConfirmDialog from "./ConfirmDialog.jsx";

const ICONS = {
  registration: Building2,
  status: CircleAlert,
  booking: Bell,
  arrival: ClipboardCheck,
  info: Info,
};

function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return new Intl.DateTimeFormat(undefined, sameDay
    ? { hour: "numeric", minute: "2-digit" }
    : {
        month: "short",
        day: "numeric",
        year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
        hour: "numeric",
        minute: "2-digit",
      }
  ).format(date);
}

export default function NotificationsPage({
  notifications, loading, onRefresh, onMarkRead, onMarkAllRead, onDelete, onClear, onNavigate,
}) {
  const [filter, setFilter] = useState("all");
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const unreadCount = notifications.filter((item) => !item.read).length;
  const visible = useMemo(
    () => filter === "unread" ? notifications.filter((item) => !item.read) : notifications,
    [filter, notifications]
  );

  async function openNotification(item) {
    if (!item.read) await onMarkRead(item.id);
    if (item.actionTab) onNavigate(item.actionTab);
  }

  async function clearAll() {
    setClearing(true);
    const cleared = await onClear();
    setClearing(false);
    if (cleared) setConfirmClear(false);
  }

  return (
    <section className="notifications-page" aria-labelledby="notifications-title">
      <div className="tas-pagehead notifications-head">
        <div>
          <h1 id="notifications-title">Notifications</h1>
          <p>Updates about registrations, approval status, and accommodation availability</p>
        </div>
        <div className="notifications-toolbar">
          <button type="button" className="btn btn-outline" onClick={onRefresh} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          {unreadCount > 0 && (
            <button type="button" className="btn btn-outline" onClick={onMarkAllRead}>
              <CheckCheck size={16} /> Mark all as read
            </button>
          )}
          {notifications.length > 0 && (
            <button type="button" className="btn btn-danger" onClick={() => setConfirmClear(true)}>
              <Trash2 size={15} /> Clear all
            </button>
          )}
        </div>
      </div>

      <div className="notification-filters" role="group" aria-label="Filter notifications">
        <button type="button" className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>
          All <span>{notifications.length}</span>
        </button>
        <button type="button" className={filter === "unread" ? "active" : ""} onClick={() => setFilter("unread")}>
          Unread <span>{unreadCount}</span>
        </button>
      </div>

      <div className="notification-list" aria-live="polite" aria-busy={loading}>
        {visible.length === 0 ? (
          <div className="tas-card notification-empty">
            <Bell size={32} />
            <h2>{filter === "unread" ? "You're all caught up" : "No notifications yet"}</h2>
            <p>{filter === "unread" ? "You have read every notification." : "Important system updates will appear here."}</p>
          </div>
        ) : visible.map((item) => {
          const Icon = ICONS[item.type] || Info;
          return (
            <article key={item.id} className={`notification-item ${item.read ? "read" : "unread"}`}>
              <div className={`notification-icon type-${item.type}`} aria-hidden="true"><Icon size={19} /></div>
              <div className="notification-content">
                <div className="notification-title-row">
                  <h2>{item.title}</h2>
                  {!item.read && <span className="notification-new">New</span>}
                </div>
                <p>{item.message}</p>
                <time dateTime={item.createdAt}>{formatTimestamp(item.createdAt)}</time>
              </div>
              <div className="notification-actions">
                {item.actionTab && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => openNotification(item)}>
                    View
                  </button>
                )}
                {!item.read && (
                  <button type="button" className="notification-icon-button" onClick={() => onMarkRead(item.id)} aria-label={`Mark ${item.title} as read`} title="Mark as read">
                    <Check size={16} />
                  </button>
                )}
                <button type="button" className="notification-icon-button danger" onClick={() => onDelete(item.id)} aria-label={`Delete ${item.title}`} title="Delete notification">
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Clear all notifications?"
        message="This will permanently remove every notification from your inbox. This action cannot be undone."
        confirmLabel="Clear all"
        busy={clearing}
        onCancel={() => setConfirmClear(false)}
        onConfirm={clearAll}
      />
    </section>
  );
}
