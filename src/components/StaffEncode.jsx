import React, { useState, useEffect, useMemo } from "react";
import { Loader2, CheckCircle2, Plus, Trash2 } from "lucide-react";
import StatTile from "./StatTile.jsx";
import CategoryStatTile from "./CategoryStatTile.jsx";
import { PlainStepper } from "./NumberField.jsx";
import { fetchArrival, saveArrival } from "../lib/data.js";
import { todayStr, computeTotals, emptyRecord, uid, COUNTRIES, CATEGORY_COLORS, VISIT_TYPE_LABEL } from "../lib/helpers.js";

export default function StaffEncode({ accommodation, visitType, date, setDate, notify }) {
  const [rec, setRec] = useState(emptyRecord());
  const [loadingRec, setLoadingRec] = useState(true);
  const [saving, setSaving] = useState(false);
  const typeLabel = VISIT_TYPE_LABEL[visitType] || "arrivals";

  useEffect(() => {
    let cancelled = false;
    setLoadingRec(true);
    fetchArrival(accommodation.id, visitType, date).then((existing) => {
      if (cancelled) return;
      setRec(existing ? { ...emptyRecord(), ...existing } : emptyRecord());
      setLoadingRec(false);
    });
    return () => { cancelled = true; };
  }, [accommodation.id, visitType, date]);

  const totals = useMemo(() => computeTotals(rec), [rec]);

  function updateForeign(id, field, value) {
    setRec((r) => ({
      ...r,
      foreignEntries: r.foreignEntries.map((e) => (e.id === id ? { ...e, [field]: value } : e)),
    }));
  }
  function addForeign() {
    setRec((r) => ({ ...r, foreignEntries: [...r.foreignEntries, { id: uid(), country: "", male: 0, female: 0 }] }));
  }
  function removeForeign(id) {
    setRec((r) => ({ ...r, foreignEntries: r.foreignEntries.filter((e) => e.id !== id) }));
  }

  async function handleSave() {
    setSaving(true);
    const cleaned = {
      ...rec,
      foreignEntries: rec.foreignEntries.filter((e) => e.country.trim()),
      updatedAt: new Date().toISOString(),
    };
    const ok = await saveArrival(accommodation.id, visitType, date, cleaned);
    setSaving(false);
    notify(ok ? "success" : "error", ok ? `Saved ${typeLabel.toLowerCase()} for ${date}.` : "Could not save. Please try again.");
  }

  return (
    <div>
      <div className="tas-card">
        <div className="entry-toolbar">
          <div className="tas-field" style={{ marginBottom: 0 }}>
            <label>Date of {visitType === "daytour" ? "visit" : "arrival"}</label>
            <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} />
          </div>
          {loadingRec && (
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              <Loader2 size={13} className="spin" style={{ display: "inline", marginRight: 4 }} />
              loading entry…
            </span>
          )}
        </div>

        <div className="stat-row">
          <StatTile label="Total guests" value={totals.grandTotal} />
          <CategoryStatTile label="This province" total={totals.totalLocal} male={totals.localMale} female={totals.localFemale} tone="sea" />
          <CategoryStatTile label="Other province" total={totals.totalDomestic} male={totals.domesticMale} female={totals.domesticFemale} />
          <CategoryStatTile label="Foreign" total={totals.totalForeign} male={totals.foreignMale} female={totals.foreignFemale} tone="gold" />
        </div>

        <div className="cat-block">
          <div className="cat-title"><span className="swatch" style={{ background: CATEGORY_COLORS.local }} /> This province (local)</div>
          <div className="sex-split">
            <div className="sex-col">
              <div className="sex-tag male"><span className="dot" /> Male</div>
              <PlainStepper value={rec.maleLocal} onChange={(v) => setRec((r) => ({ ...r, maleLocal: v }))} />
            </div>
            <div className="sex-divider">/</div>
            <div className="sex-col">
              <div className="sex-tag female"><span className="dot" /> Female</div>
              <PlainStepper value={rec.femaleLocal} onChange={(v) => setRec((r) => ({ ...r, femaleLocal: v }))} />
            </div>
          </div>
        </div>

        <div className="cat-block">
          <div className="cat-title"><span className="swatch" style={{ background: CATEGORY_COLORS.domestic }} /> Other province (domestic)</div>
          <div className="sex-split">
            <div className="sex-col">
              <div className="sex-tag male"><span className="dot" /> Male</div>
              <PlainStepper value={rec.maleDomestic} onChange={(v) => setRec((r) => ({ ...r, maleDomestic: v }))} />
            </div>
            <div className="sex-divider">/</div>
            <div className="sex-col">
              <div className="sex-tag female"><span className="dot" /> Female</div>
              <PlainStepper value={rec.femaleDomestic} onChange={(v) => setRec((r) => ({ ...r, femaleDomestic: v }))} />
            </div>
          </div>
        </div>

        <div className="cat-block">
          <div className="cat-title"><span className="swatch" style={{ background: CATEGORY_COLORS.foreign }} /> Foreign tourists (by country)</div>
          {rec.foreignEntries.length === 0 && (
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 8 }}>No foreign entries yet for this date.</div>
          )}
          {rec.foreignEntries.length > 0 && (
            <div className="foreign-head">
              <span>Country</span><span>Male</span><span>Female</span><span></span>
            </div>
          )}
          {rec.foreignEntries.map((e) => (
            <div className="foreign-row" key={e.id}>
              <input list="tas-countries" placeholder="Country" value={e.country} onChange={(ev) => updateForeign(e.id, "country", ev.target.value)} />
              <input type="number" min="0" placeholder="Male" value={e.male} onChange={(ev) => updateForeign(e.id, "male", Math.max(0, parseInt(ev.target.value || "0", 10) || 0))} />
              <input type="number" min="0" placeholder="Female" value={e.female} onChange={(ev) => updateForeign(e.id, "female", Math.max(0, parseInt(ev.target.value || "0", 10) || 0))} />
              <button className="icon-btn" onClick={() => removeForeign(e.id)}><Trash2 size={15} /></button>
            </div>
          ))}
          <datalist id="tas-countries">
            {COUNTRIES.map((c) => <option value={c} key={c} />)}
          </datalist>
          <button className="btn btn-outline btn-sm" onClick={addForeign}><Plus size={13} /> Add country</button>
        </div>

        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />}
          {saving ? "Saving…" : `Save ${typeLabel.toLowerCase()}`}
        </button>
      </div>
    </div>
  );
}
