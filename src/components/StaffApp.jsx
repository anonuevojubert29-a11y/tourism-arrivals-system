import React, { useState } from "react";
import { Clock, XCircle } from "lucide-react";
import Banner from "./Banner.jsx";
import StaffEncode from "./StaffEncode.jsx";
import StaffHistory from "./StaffHistory.jsx";
import StaffSettings from "./StaffSettings.jsx";
import Overview from "./Overview.jsx";
import { todayStr, VISIT_TYPE_LABEL } from "../lib/helpers.js";

const TAB_SUBTITLE = {
  overnight: VISIT_TYPE_LABEL.overnight,
  daytour: VISIT_TYPE_LABEL.daytour,
  summary: "Arrivals summary",
  history: "Arrivals history",
  settings: "Accommodation profile",
};

export default function StaffApp({ accommodation, tab, onNavigate, notify, onUpdateBookingStatus, onUpdateInfo, onUpdateAccount }) {
  const approved = accommodation.status === "approved";
  const effectiveTab = approved ? tab : "settings";
  const [date, setDate] = useState(todayStr());

  return (
    <div>
      <div className="tas-pagehead">
        <div><h1>{accommodation.name}</h1><p>{accommodation.municipality} · {TAB_SUBTITLE[effectiveTab] || "Daily arrivals encoding"}</p></div>
      </div>

      {accommodation.status === "pending" && (
        <Banner type="pending" icon={Clock}>
          Your accommodation is <b>pending approval</b>. Once a system administrator approves your
          registration, you'll be able to encode daily arrivals here. You can still update your
          profile details under Settings while you wait.
        </Banner>
      )}
      {accommodation.status === "rejected" && (
        <Banner type="rejected" icon={XCircle}>
          This accommodation's registration was <b>not approved</b>. Please contact the tourism office
          for details.
        </Banner>
      )}

      {approved && (
        <div className="tas-card">
          <div className="tas-cardhead">Booking status</div>
          <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 10px" }}>
            Let the tourism office know whether you can still accept guests today.
          </p>
          <div className="seg-control">
            <button
              className={!accommodation.fullyBooked ? "active" : ""}
              onClick={() => onUpdateBookingStatus(false)}
            >
              Accepting guests
            </button>
            <button
              className={accommodation.fullyBooked ? "active" : ""}
              onClick={() => onUpdateBookingStatus(true)}
            >
              Fully booked
            </button>
          </div>
        </div>
      )}

      {effectiveTab === "summary" && (
        <Overview accommodations={[accommodation]} initialAccId={accommodation.id} dailyArrivals showAccommodationFilter={false} showAccommodationBreakdown={false} />
      )}

      {(effectiveTab === "overnight" || effectiveTab === "daytour") && (
        <StaffEncode accommodation={accommodation} visitType={effectiveTab} date={date} setDate={setDate} notify={notify} />
      )}
      {effectiveTab === "history" && (
        <StaffHistory accommodation={accommodation} onEdit={(d, visitType) => { setDate(d); onNavigate(visitType); }} />
      )}
      {effectiveTab === "settings" && (
        <StaffSettings accommodation={accommodation} onSave={onUpdateInfo} onUpdateAccount={onUpdateAccount} notify={notify} />
      )}
    </div>
  );
}
