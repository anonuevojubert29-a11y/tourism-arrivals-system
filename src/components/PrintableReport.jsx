import React from "react";

export default function PrintableReport({ scopeLabel, from, to, agg, accName }) {
  const generatedAt = new Date().toLocaleString();
  return (
    <div className="print-report">
      <h1>Tourism Arrivals Report</h1>
      <p className="print-meta">{scopeLabel} &middot; {from} to {to}</p>
      <p className="print-meta print-muted">Generated {generatedAt}</p>

      <table className="print-table">
        <tbody>
          <tr>
            <th>Total arrivals</th><td>{agg.grandTotal}</td>
            <th>Male</th><td>{agg.totalMale}</td>
            <th>Female</th><td>{agg.totalFemale}</td>
          </tr>
        </tbody>
      </table>

      <h2>Arrivals by visit type and origin</h2>
      <table className="print-table">
        <thead>
          <tr>
            <th rowSpan="2">Visit type</th>
            <th className="origin-group" colSpan="2">This province</th>
            <th className="origin-group" colSpan="2">Other province</th>
            <th className="origin-group" colSpan="2">Foreign tourists</th>
            <th rowSpan="2">Total</th>
          </tr>
          <tr>
            <th>Male</th><th>Female</th>
            <th>Male</th><th>Female</th>
            <th>Male</th><th>Female</th>
          </tr>
        </thead>
        <tbody>
          {agg.visitTypeArr.map((r) => (
            <tr key={r.visitType}>
              <td>{r.visitTypeLabel}</td>
              <td>{r.localMale}</td><td>{r.localFemale}</td>
              <td>{r.domesticMale}</td><td>{r.domesticFemale}</td>
              <td>{r.foreignMale}</td><td>{r.foreignFemale}</td>
              <td>{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Breakdown by accommodation</h2>
      <table className="print-table">
        <thead>
          <tr>
            <th rowSpan="2">Accommodation</th>
            <th rowSpan="2">Visit type</th>
            <th className="origin-group" colSpan="2">This province</th>
            <th className="origin-group" colSpan="2">Other province</th>
            <th className="origin-group" colSpan="2">Foreign tourists</th>
            <th rowSpan="2">Total</th>
          </tr>
          <tr>
            <th>Male</th><th>Female</th>
            <th>Male</th><th>Female</th>
            <th>Male</th><th>Female</th>
          </tr>
        </thead>
        <tbody>
          {agg.byAccVisitArr.map((r) => (
            <tr key={`${r.id}-${r.visitType}`}>
              <td>{accName(r.id)}</td>
              <td>{r.visitTypeLabel}</td>
              <td>{r.localMale}</td><td>{r.localFemale}</td>
              <td>{r.domesticMale}</td><td>{r.domesticFemale}</td>
              <td>{r.foreignMale}</td><td>{r.foreignFemale}</td>
              <td>{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {agg.countryArr.length > 0 && (
        <>
          <h2>Top foreign countries</h2>
          <table className="print-table">
            <thead><tr><th>Country</th><th>Male</th><th>Female</th><th>Total</th></tr></thead>
            <tbody>
              {agg.countryArr.map((c) => (
                <tr key={c.name}><td>{c.name}</td><td>{c.male}</td><td>{c.female}</td><td>{c.value}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <p className="print-footer">Tourism Arrivals Registry — printable report</p>
    </div>
  );
}
