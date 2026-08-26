import React, { useState, useEffect, useMemo } from "react";
import { BarChart3, Globe2, MapPin, TrendingUp, ClipboardList, Download, Loader2, Printer } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";
import StatTile from "./StatTile.jsx";
import CategoryStatTile from "./CategoryStatTile.jsx";
import PrintableReport from "./PrintableReport.jsx";
import { daysAgoStr, todayStr, computeTotals, fmt, CATEGORY_COLORS, VISIT_TYPES, VISIT_TYPE_LABEL } from "../lib/helpers.js";
import { fetchArrivalsInRange } from "../lib/data.js";

const emptyOriginSexBreakdown = () => ({
  localMale: 0,
  localFemale: 0,
  domesticMale: 0,
  domesticFemale: 0,
  foreignMale: 0,
  foreignFemale: 0,
  total: 0,
});

function addOriginSexBreakdown(target, totals) {
  target.localMale += totals.localMale;
  target.localFemale += totals.localFemale;
  target.domesticMale += totals.domesticMale;
  target.domesticFemale += totals.domesticFemale;
  target.foreignMale += totals.foreignMale;
  target.foreignFemale += totals.foreignFemale;
  target.total += totals.grandTotal;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default function Overview({ accommodations, initialAccId, dailyArrivals = false, showAccommodationFilter = true, showAccommodationBreakdown = true }) {
  const approved = useMemo(() => accommodations.filter((a) => a.status === "approved"), [accommodations]);
  const [from, setFrom] = useState(daysAgoStr(30));
  const [to, setTo] = useState(todayStr());
  const [accFilter, setAccFilter] = useState(initialAccId || "all");
  const [visitTypeFilter, setVisitTypeFilter] = useState("all");
  const [records, setRecords] = useState(null);

  useEffect(() => { setAccFilter(initialAccId || "all"); }, [initialAccId]);

  useEffect(() => {
    setRecords(null);
    fetchArrivalsInRange(from, to, accFilter, visitTypeFilter).then(setRecords);
  }, [from, to, accFilter, visitTypeFilter]);

  const agg = useMemo(() => {
    if (!records) return null;
    let totalMale = 0, totalFemale = 0, totalLocal = 0, totalDomestic = 0, totalForeign = 0;
    let localMale = 0, localFemale = 0, domesticMale = 0, domesticFemale = 0, foreignMale = 0, foreignFemale = 0;
    let overnightTotal = 0, daytourTotal = 0;
    let overnightMale = 0, overnightFemale = 0, daytourMale = 0, daytourFemale = 0;
    const byAcc = {}; const byCountry = {}; const byDate = {};
    const byVisitType = { overnight: emptyOriginSexBreakdown(), daytour: emptyOriginSexBreakdown() };
    const seenVisitTypes = new Set();
    for (const r of records) {
      const t = computeTotals(r);
      const visitType = r.visitType === "daytour" ? "daytour" : "overnight";
      totalMale += t.totalMale; totalFemale += t.totalFemale;
      totalLocal += t.totalLocal; totalDomestic += t.totalDomestic; totalForeign += t.totalForeign;
      localMale += t.localMale; localFemale += t.localFemale;
      domesticMale += t.domesticMale; domesticFemale += t.domesticFemale;
      foreignMale += t.foreignMale; foreignFemale += t.foreignFemale;
      addOriginSexBreakdown(byVisitType[visitType], t);
      seenVisitTypes.add(visitType);
      if (visitType === "daytour") {
        daytourTotal += t.grandTotal;
        daytourMale += t.totalMale;
        daytourFemale += t.totalFemale;
      } else {
        overnightTotal += t.grandTotal;
        overnightMale += t.totalMale;
        overnightFemale += t.totalFemale;
      }
      byAcc[r.accommodationId] = byAcc[r.accommodationId] || {
        local: 0, domestic: 0, foreign: 0, male: 0, female: 0, total: 0,
        visitTypes: { overnight: emptyOriginSexBreakdown(), daytour: emptyOriginSexBreakdown() },
        seenVisitTypes: new Set(),
      };
      byAcc[r.accommodationId].local += t.totalLocal;
      byAcc[r.accommodationId].domestic += t.totalDomestic;
      byAcc[r.accommodationId].foreign += t.totalForeign;
      byAcc[r.accommodationId].male += t.totalMale;
      byAcc[r.accommodationId].female += t.totalFemale;
      byAcc[r.accommodationId].total += t.grandTotal;
      addOriginSexBreakdown(byAcc[r.accommodationId].visitTypes[visitType], t);
      byAcc[r.accommodationId].seenVisitTypes.add(visitType);
      byDate[r.date] = (byDate[r.date] || 0) + t.grandTotal;
      for (const fe of r.foreignEntries || []) {
        if (!fe.country) continue;
        byCountry[fe.country] = byCountry[fe.country] || { male: 0, female: 0, value: 0 };
        byCountry[fe.country].male += +fe.male || 0;
        byCountry[fe.country].female += +fe.female || 0;
        byCountry[fe.country].value += (+fe.male || 0) + (+fe.female || 0);
      }
    }
    const sortedAccEntries = Object.entries(byAcc).sort(([, a], [, b]) => b.total - a.total);
    const byAccArr = sortedAccEntries
      .map(([id, v]) => ({ id, local: v.local, domestic: v.domestic, foreign: v.foreign, male: v.male, female: v.female, total: v.total }));
    const byAccVisitArr = sortedAccEntries
      .flatMap(([id, v]) => VISIT_TYPES
        .filter((type) => v.seenVisitTypes.has(type.id))
        .map((type) => ({ id, visitType: type.id, visitTypeLabel: type.label, ...v.visitTypes[type.id] })));
    return {
      totalMale, totalFemale, totalLocal, totalDomestic, totalForeign,
      localMale, localFemale, domesticMale, domesticFemale, foreignMale, foreignFemale,
      overnightTotal, daytourTotal, overnightMale, overnightFemale, daytourMale, daytourFemale,
      grandTotal: totalMale + totalFemale,
      visitTypeArr: VISIT_TYPES.filter((type) => seenVisitTypes.has(type.id)).map((type) => ({ visitType: type.id, visitTypeLabel: type.label, ...byVisitType[type.id] })),
      byAccArr,
      byAccVisitArr,
      countryArr: Object.entries(byCountry).map(([name, values]) => ({ name, ...values })).sort((a, b) => b.value - a.value).slice(0, 8),
      dateArr: Object.entries(byDate).map(([date, total]) => ({ date, total })).sort((a, b) => (a.date < b.date ? -1 : 1)),
    };
  }, [records]);

  const accName = (id) => accommodations.find((a) => a.id === id)?.name || "Unknown";

  function saveReportCopy() {
    if (!agg) return;
    const scopeLabel = (accFilter === "all" ? "All accommodations" : accName(accFilter)) +
      (visitTypeFilter === "all" ? "" : ` - ${VISIT_TYPE_LABEL[visitTypeFilter]}`);
    const rows = [
      ["Tourism Arrivals Report"],
      ["Scope", scopeLabel],
      ["From", from, "To", to],
      [],
      ["Visit type", "This Province - Male", "This Province - Female", "Other Province - Male", "Other Province - Female", "Foreign Tourists - Male", "Foreign Tourists - Female", "Total"],
      ...agg.visitTypeArr.map((r) => [r.visitTypeLabel, r.localMale, r.localFemale, r.domesticMale, r.domesticFemale, r.foreignMale, r.foreignFemale, r.total]),
      [],
      ["Accommodation", "Visit type", "This Province - Male", "This Province - Female", "Other Province - Male", "Other Province - Female", "Foreign Tourists - Male", "Foreign Tourists - Female", "Total"],
      ...agg.byAccVisitArr.map((r) => [accName(r.id), r.visitTypeLabel, r.localMale, r.localFemale, r.domesticMale, r.domesticFemale, r.foreignMale, r.foreignFemale, r.total]),
    ];
    if (agg.countryArr.length > 0) {
      rows.push([], ["Foreign country", "Male", "Female", "Total"]);
      agg.countryArr.forEach((country) => rows.push([country.name, country.male, country.female, country.value]));
    }
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `tourism-arrivals-report-${from}-to-${to}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="tas-card">
        <div className="filter-toolbar">
          <div className="tas-field" style={{ marginBottom: 0 }}><label>From</label><input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="tas-field" style={{ marginBottom: 0 }}><label>To</label><input type="date" value={to} min={from} max={todayStr()} onChange={(e) => setTo(e.target.value)} /></div>
          {showAccommodationFilter && (
            <div className="tas-field" style={{ marginBottom: 0, minWidth: 200 }}>
              <label>Accommodation</label>
              <select value={accFilter} onChange={(e) => setAccFilter(e.target.value)}>
                <option value="all">All accommodations</option>
                {approved.map((a) => <option value={a.id} key={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}
          <div className="tas-field" style={{ marginBottom: 0, minWidth: 180 }}>
            <label>Visit type</label>
            <select value={visitTypeFilter} onChange={(e) => setVisitTypeFilter(e.target.value)}>
              <option value="all">Overnight + Day tour</option>
              {VISIT_TYPES.map((v) => <option value={v.id} key={v.id}>{v.label}</option>)}
            </select>
          </div>
          <div className="toolbar-actions">
            <button
              type="button"
              className="btn btn-outline"
              onClick={saveReportCopy}
              disabled={!agg || records.length === 0}
            >
              <Download size={14} /> Save copy
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => window.print()}
              disabled={!agg || records.length === 0}
            >
              <Printer size={14} /> Print report
            </button>
          </div>
        </div>
      </div>

      {agg && records.length > 0 && (
        <PrintableReport
          scopeLabel={
            (accFilter === "all" ? "All accommodations" : accName(accFilter)) +
            (visitTypeFilter === "all" ? "" : ` · ${VISIT_TYPE_LABEL[visitTypeFilter]}`)
          }
          from={from}
          to={to}
          agg={agg}
          accName={accName}
        />
      )}

      {!agg ? (
        <div className="empty-state"><Loader2 size={18} className="spin" /> Loading arrivals…</div>
      ) : records.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 16 }}>No arrivals recorded for this filter yet.</div>
      ) : (
        <>
          <div className="stat-row" style={{ marginTop: 16 }}>
            <StatTile label="Total arrivals" value={agg.grandTotal} male={agg.totalMale} female={agg.totalFemale} />
            {visitTypeFilter === "all" && (
              <>
                <StatTile label="Overnight" value={agg.overnightTotal} male={agg.overnightMale} female={agg.overnightFemale} />
                <StatTile label="Day tour" value={agg.daytourTotal} male={agg.daytourMale} female={agg.daytourFemale} />
              </>
            )}
            <CategoryStatTile label="This province" total={agg.totalLocal} male={agg.localMale} female={agg.localFemale} tone="sea" />
            <CategoryStatTile label="Other province" total={agg.totalDomestic} male={agg.domesticMale} female={agg.domesticFemale} />
            <CategoryStatTile label="Foreign" total={agg.totalForeign} male={agg.foreignMale} female={agg.foreignFemale} tone="gold" />
          </div>

          <div className="tas-grid2 chart-grid">
            <div className="tas-card">
              <div className="tas-cardhead">{dailyArrivals ? <TrendingUp size={15} /> : <BarChart3 size={15} />} {dailyArrivals ? "Daily arrivals" : "Arrivals by accommodation"}</div>
              <ResponsiveContainer width="100%" height={240}>
                {dailyArrivals ? (
                  <LineChart data={agg.dateArr}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E6ECEA" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="total" stroke="#0E5C63" strokeWidth={2} dot={false} />
                  </LineChart>
                ) : (
                  <BarChart data={agg.byAccArr.map((r) => ({ name: accName(r.id), total: r.total }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E6ECEA" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="total" fill="#0E5C63" radius={[3, 3, 0, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>

            <div className="tas-card">
              <div className="tas-cardhead"><Globe2 size={15} /> Origin breakdown</div>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={[
                      { name: "This province", value: agg.totalLocal },
                      { name: "Other province", value: agg.totalDomestic },
                      { name: "Foreign", value: agg.totalForeign },
                    ]}
                    dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label
                  >
                    <Cell fill={CATEGORY_COLORS.local} />
                    <Cell fill={CATEGORY_COLORS.domestic} />
                    <Cell fill={CATEGORY_COLORS.foreign} />
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="tas-card">
              <div className="tas-cardhead"><MapPin size={15} /> Top foreign countries</div>
              {agg.countryArr.length === 0 ? <div className="empty-state">No foreign entries yet.</div> : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={agg.countryArr} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E6ECEA" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#D6A54A" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

          </div>

          {showAccommodationBreakdown && (
            <div className="tas-card">
              <div className="tas-cardhead"><ClipboardList size={15} /> Breakdown by accommodation</div>
              <div className="table-scroll" role="region" aria-label="Arrivals breakdown" tabIndex="0">
              <table className="tas-table">
                <thead>
                  <tr>
                    <th rowSpan="2">Accommodation</th>
                    <th rowSpan="2">Visit type</th>
                    <th className="num origin-group" colSpan="2">This province</th>
                    <th className="num origin-group" colSpan="2">Other province</th>
                    <th className="num origin-group" colSpan="2">Foreign tourists</th>
                    <th className="num" rowSpan="2">Total</th>
                  </tr>
                  <tr>
                    <th className="num">Male</th><th className="num">Female</th>
                    <th className="num">Male</th><th className="num">Female</th>
                    <th className="num">Male</th><th className="num">Female</th>
                  </tr>
                </thead>
                <tbody>
                  {agg.byAccVisitArr.map((r) => (
                    <tr key={`${r.id}-${r.visitType}`}>
                      <td>{accName(r.id)}</td>
                      <td>{r.visitTypeLabel}</td>
                      <td className="num">{fmt(r.localMale)}</td>
                      <td className="num">{fmt(r.localFemale)}</td>
                      <td className="num">{fmt(r.domesticMale)}</td>
                      <td className="num">{fmt(r.domesticFemale)}</td>
                      <td className="num">{fmt(r.foreignMale)}</td>
                      <td className="num">{fmt(r.foreignFemale)}</td>
                      <td className="num" style={{ fontWeight: 700 }}>{fmt(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
