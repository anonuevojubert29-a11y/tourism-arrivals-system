export const COUNTRIES = [
  "United States", "China", "South Korea", "Japan", "Australia", "United Kingdom",
  "Canada", "Taiwan", "Singapore", "Malaysia", "India", "Germany", "France", "Vietnam",
  "Thailand", "Indonesia", "Hong Kong", "New Zealand", "Netherlands", "Spain",
  "Italy", "Russia", "Saudi Arabia", "United Arab Emirates", "Qatar", "Kuwait",
  "Israel", "Switzerland", "Sweden", "Norway", "Denmark", "Belgium", "Ireland",
  "Brazil", "Mexico", "Argentina", "South Africa", "Nigeria", "Egypt", "Turkey",
  "Pakistan", "Bangladesh", "Nepal", "Sri Lanka", "Myanmar", "Cambodia", "Laos",
  "Brunei", "Papua New Guinea", "Fiji", "Austria", "Poland", "Portugal", "Greece",
  "Finland", "Czech Republic", "Hungary", "Ukraine", "Colombia", "Chile", "Peru",
];

export const CATEGORY_COLORS = { local: "#0E5C63", domestic: "#3E8E7E", foreign: "#D6A54A" };
export const CHART_PALETTE = ["#0E5C63", "#D6A54A", "#3E8E7E", "#8A5A44", "#5C7A8A", "#A9721B", "#C1443D", "#6B7280"];

export const VISIT_TYPES = [
  { id: "overnight", label: "Overnight arrivals" },
  { id: "daytour", label: "Day tour" },
];
export const VISIT_TYPE_LABEL = Object.fromEntries(VISIT_TYPES.map((v) => [v.id, v.label]));

export function uid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fmt(n) {
  return (n || 0).toLocaleString();
}

export function emptyRecord() {
  return { maleLocal: 0, femaleLocal: 0, maleDomestic: 0, femaleDomestic: 0, foreignEntries: [] };
}

export function computeTotals(rec) {
  const fMale = (rec.foreignEntries || []).reduce((s, e) => s + (+e.male || 0), 0);
  const fFemale = (rec.foreignEntries || []).reduce((s, e) => s + (+e.female || 0), 0);
  const localMale = +rec.maleLocal || 0;
  const localFemale = +rec.femaleLocal || 0;
  const domesticMale = +rec.maleDomestic || 0;
  const domesticFemale = +rec.femaleDomestic || 0;
  const totalLocal = localMale + localFemale;
  const totalDomestic = domesticMale + domesticFemale;
  const totalForeign = fMale + fFemale;
  const totalMale = localMale + domesticMale + fMale;
  const totalFemale = localFemale + domesticFemale + fFemale;
  return {
    totalLocal, totalDomestic, totalForeign, totalMale, totalFemale, grandTotal: totalMale + totalFemale,
    localMale, localFemale, domesticMale, domesticFemale, foreignMale: fMale, foreignFemale: fFemale,
  };
}
