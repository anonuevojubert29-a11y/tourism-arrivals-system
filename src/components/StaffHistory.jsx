import React, { useState, useEffect, useCallback } from "react";
import { ClipboardList, Loader2, Pencil } from "lucide-react";
import { daysAgoStr, todayStr, computeTotals, fmt, VISIT_TYPES, VISIT_TYPE_LABEL } from "../lib/helpers.js";
import { fetchArrivalsInRange } from "../lib/data.js";

function combineDayTourRecords(records) {
  const byDate = new Map();
  for (const record of records) {
    const combined = byDate.get(record.date) || {
      ...record,
      visitType: "daytour",
      maleLocal: 0,
      femaleLocal: 0,
      maleDomestic: 0,
      femaleDomestic: 0,
      foreignEntries: [],
    };
    combined.maleLocal += +record.maleLocal || 0;
    combined.femaleLocal += +record.femaleLocal || 0;
    combined.maleDomestic += +record.maleDomestic || 0;
    combined.femaleDomestic += +record.femaleDomestic || 0;
    combined.foreignEntries.push(...(record.foreignEntries || []));
    byDate.set(record.date, combined);
  }
  return [...byDate.values()];
}

export default function StaffHistory({ accommodation, onEdit }) {
  const [visitType, setVisitType] = useState("overnight");
  const [records, setRecords] = useState(null);

  const load = useCallback(() => {
    setRecords(null);
    const storedVisitType = visitType === "daytour" ? "all" : "overnight";
    fetchArrivalsInRange(daysAgoStr(60), todayStr(), accommodation.id, storedVisitType).then((recs) => {
      const displayedRecords = visitType === "daytour" ? combineDayTourRecords(recs) : recs;
      displayedRecords.sort((a, b) => (a.date < b.date ? 1 : -1));
      setRecords(displayedRecords);
    });
  }, [accommodation.id, visitType]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="tas-card">
      <div className="tas-cardhead"><ClipboardList size={15} /> Last 60 days</div>
      <div className="seg-control" style={{ marginBottom: 14 }}>
        {VISIT_TYPES.map((v) => (
          <button key={v.id} className={visitType === v.id ? "active" : ""} onClick={() => setVisitType(v.id)}>
            {v.id === "daytour" ? `${v.label} (includes overnight)` : v.label}
          </button>
        ))}
      </div>
      {records === null ? (
        <div className="empty-state"><Loader2 size={18} className="spin" /></div>
      ) : records.length === 0 ? (
        <div className="empty-state">No {VISIT_TYPE_LABEL[visitType].toLowerCase()} recorded yet. Use "{VISIT_TYPE_LABEL[visitType]}" to add your first entry.</div>
      ) : (
        <div className="table-scroll" role="region" aria-label="Arrival history" tabIndex="0">
        <table className="tas-table">
          <thead>
            <tr>
              <th>Date</th><th className="num">Local</th><th className="num">Domestic</th>
              <th className="num">Foreign</th><th className="num">Male</th><th className="num">Female</th>
              <th className="num">Total</th><th></th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => {
              const t = computeTotals(r);
              return (
                <tr key={r.date}>
                  <td className="tas-mono">{r.date}</td>
                  <td className="num">{fmt(t.totalLocal)}</td>
                  <td className="num">{fmt(t.totalDomestic)}</td>
                  <td className="num">{fmt(t.totalForeign)}</td>
                  <td className="num">{fmt(t.totalMale)}</td>
                  <td className="num">{fmt(t.totalFemale)}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmt(t.grandTotal)}</td>
                  <td><button className="btn-ghost" onClick={() => onEdit(r.date, visitType)}><Pencil size={13} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
