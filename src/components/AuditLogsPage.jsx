import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown, ChevronLeft, ChevronRight, ChevronUp, RefreshCw, Search, ScrollText,
} from "lucide-react";
import { fetchAuditLogs } from "../lib/data.js";

const PAGE_SIZE_OPTIONS = [10, 25, 50];

function humanize(value) {
  return String(value || "Unknown")
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function timestampDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text)
    ? `${text.replace(" ", "T")}Z`
    : text;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTimestamp(value) {
  const date = timestampDate(value);
  if (!date) return "Unknown time";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit",
  }).format(date);
}

function detailValue(value) {
  if (Array.isArray(value)) return value.map(humanize).join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value ?? "—");
}

function searchableText(record) {
  return [
    record.actorUsername, record.actorRole, record.action, record.entityType, record.entityId,
    record.method, record.route, record.ipAddress, JSON.stringify(record.details || {}),
  ].filter(Boolean).join(" ").toLowerCase();
}

export default function AuditLogsPage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("all");
  const [entityType, setEntityType] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [expandedId, setExpandedId] = useState(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRecords(await fetchAuditLogs({ limit: 500 }));
    } catch (loadError) {
      setError(loadError.message || "Audit records could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const actions = useMemo(
    () => [...new Set(records.map((record) => record.action).filter(Boolean))].sort(),
    [records]
  );
  const entityTypes = useMemo(
    () => [...new Set(records.map((record) => record.entityType).filter(Boolean))].sort(),
    [records]
  );
  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    return records.filter((record) => (
      (action === "all" || record.action === action)
      && (entityType === "all" || record.entityType === entityType)
      && (!query || searchableText(record).includes(query))
    ));
  }, [records, action, entityType, search]);

  const pageCount = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const visibleRecords = filteredRecords.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { setPage(1); }, [search, action, entityType, pageSize]);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  return (
    <section className="audit-page" aria-labelledby="audit-title">
      <div className="tas-pagehead audit-pagehead">
        <div>
          <h1 id="audit-title">Audit logs</h1>
          <p>Read-only history of successful changes made through the system</p>
        </div>
        <button type="button" className="btn btn-outline" onClick={loadRecords} disabled={loading}>
          <RefreshCw size={15} className={loading ? "audit-spin" : ""} />
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="tas-card audit-filter-card">
        <div className="filter-toolbar">
          <div className="tas-field audit-search-field">
            <label htmlFor="audit-search">Search records</label>
            <div className="audit-search-control">
              <Search size={15} aria-hidden="true" />
              <input
                id="audit-search"
                type="search"
                placeholder="Actor, action, target, or IP"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
          <div className="tas-field audit-filter-field">
            <label htmlFor="audit-action">Action</label>
            <select id="audit-action" value={action} onChange={(event) => setAction(event.target.value)}>
              <option value="all">All actions</option>
              {actions.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
            </select>
          </div>
          <div className="tas-field audit-filter-field">
            <label htmlFor="audit-entity">Record type</label>
            <select id="audit-entity" value={entityType} onChange={(event) => setEntityType(event.target.value)}>
              <option value="all">All record types</option>
              {entityTypes.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
            </select>
          </div>
          <div className="tas-field audit-page-size">
            <label htmlFor="audit-page-size">Rows</label>
            <select id="audit-page-size" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
              {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </div>
        </div>
      </div>

      {error && <div className="banner banner-error" role="alert">{error}</div>}

      <div className="tas-card audit-table-card" aria-busy={loading}>
        <div className="audit-results-summary" aria-live="polite">
          <span>{filteredRecords.length} record{filteredRecords.length === 1 ? "" : "s"}</span>
          {records.length === 500 && <small>Showing the latest 500 records</small>}
        </div>

        {loading && records.length === 0 ? (
          <div className="empty-state audit-empty" role="status">
            <RefreshCw className="audit-spin" size={30} />
            <strong>Loading audit records</strong>
            <span>Please wait while the latest activity is retrieved.</span>
          </div>
        ) : !error && visibleRecords.length === 0 ? (
          <div className="empty-state audit-empty">
            <ScrollText size={32} />
            <strong>{records.length === 0 ? "No audit records yet" : "No records match these filters"}</strong>
            <span>{records.length === 0 ? "Successful data changes will appear here." : "Try clearing or changing the filters."}</span>
          </div>
        ) : visibleRecords.length > 0 ? (
          <div className="table-scroll" role="region" aria-label="Audit records" tabIndex="0">
            <table className="tas-table audit-table">
              <thead>
                <tr><th>Date and time</th><th>Actor</th><th>Action</th><th>Target</th><th><span className="sr-only">Details</span></th></tr>
              </thead>
              <tbody>
                {visibleRecords.map((record) => {
                  const expanded = expandedId === record.id;
                  return (
                    <React.Fragment key={record.id}>
                      <tr>
                        <td><time dateTime={record.createdAt}>{formatTimestamp(record.createdAt)}</time></td>
                        <td>
                          <strong className="audit-actor">{record.actorUsername || "Unauthenticated request"}</strong>
                          <span className="audit-secondary">{record.actorRole ? humanize(record.actorRole) : "No signed-in actor"}</span>
                        </td>
                        <td><span className="audit-action-badge">{humanize(record.action)}</span></td>
                        <td>
                          <strong>{humanize(record.entityType)}</strong>
                          <span className="audit-secondary tas-mono">{record.entityId || "Multiple records"}</span>
                        </td>
                        <td className="audit-expand-cell">
                          <button
                            type="button"
                            className="audit-expand-button"
                            aria-label={`${expanded ? "Hide" : "Show"} details for ${humanize(record.action)}`}
                            aria-expanded={expanded}
                            onClick={() => setExpandedId(expanded ? null : record.id)}
                          >
                            {expanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
                          </button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="audit-detail-row">
                          <td colSpan="5">
                            <div className="audit-detail-grid">
                              <div><span>Request</span><code>{record.method} {record.route}</code></div>
                              <div><span>IP address</span><code>{record.ipAddress || "Not recorded"}</code></div>
                              <div className="audit-user-agent"><span>User agent</span><code>{record.userAgent || "Not recorded"}</code></div>
                              <div className="audit-change-summary">
                                <span>Change summary</span>
                                {record.details && Object.keys(record.details).length > 0 ? (
                                  <dl>
                                    {Object.entries(record.details).map(([key, value]) => (
                                      <div key={key}><dt>{humanize(key)}</dt><dd>{detailValue(value)}</dd></div>
                                    ))}
                                  </dl>
                                ) : <p>No additional details were recorded.</p>}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {filteredRecords.length > pageSize && (
          <div className="audit-pagination" aria-label="Audit log pagination">
            <span>Page {page} of {pageCount}</span>
            <div>
              <button type="button" className="btn btn-outline btn-sm" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>
                <ChevronLeft size={15} /> Previous
              </button>
              <button type="button" className="btn btn-outline btn-sm" disabled={page === pageCount} onClick={() => setPage((value) => value + 1)}>
                Next <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
