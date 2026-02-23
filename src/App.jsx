import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from "chart.js";

import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
);

function yyyymmToLabel(yyyymm) {
  const s = String(yyyymm);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}`;
}

function LegendItem({ color, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
      <div
        style={{
          width: 18,
          height: 18,
          background: color,
          marginRight: 8,
          borderRadius: 4,
        }}
      />
      <span>{label}</span>
    </div>
  );
}

export default function App() {
  const [rows, setRows] = useState([]);
  const [selectedGeo, setSelectedGeo] = useState("");
  const [icbGeo, setIcbGeo] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [selectedAge, setSelectedAge] = useState("Adult");

  // Load CSV
  useEffect(() => {
    Papa.parse(`${import.meta.env.BASE_URL}dental.csv`, {
      download: true,
      header: true,
      complete: (result) => {
        const data = (result.data || []).filter(Boolean);
        setRows(data);

        const geos = Array.from(
          new Set(
            data
              .filter((d) => d.GEOGRAPHY_CODE !== "E92000001")
              .map((d) => d.GEOGRAPHY_CODE)
          )
        );

        if (geos.length) setSelectedGeo(geos[0]);
      },
    });
  }, []);

  // Load GeoJSON
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}icb_boundaries.geojson`)
      .then((res) => res.json())
      .then((data) => setIcbGeo(data));
  }, []);

  // Available months (Final only)
  const availableMonths = useMemo(() => {
    const set = new Set();
    for (const r of rows) {
      if (
        r.STATUS === "Final" &&
        r.GEOGRAPHY_CODE !== "E92000001" &&
        (r.AGE === "Adult" || r.AGE === "Child")
      ) {
        set.add(Number(r.TREATMENT_MONTH));
      }
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [rows]);

  useEffect(() => {
    if (!selectedMonth && availableMonths.length) {
      setSelectedMonth(availableMonths.at(-1));
    }
  }, [availableMonths, selectedMonth]);

  // Value lookup for map
  const valueByGeo = useMemo(() => {
    const map = new Map();
    if (!selectedMonth) return map;

    for (const r of rows) {
      if (
        r.STATUS === "Final" &&
        r.AGE === selectedAge &&
        r.GEOGRAPHY_CODE !== "E92000001" &&
        Number(r.TREATMENT_MONTH) === selectedMonth
      ) {
        const geo = r.GEOGRAPHY_CODE;
        const v = Number(r.VALUE);
        map.set(geo, (map.get(geo) ?? 0) + v);
      }
    }
    return map;
  }, [rows, selectedMonth, selectedAge]);

  // Line chart data (selected ICB)
  const monthsForGeo = availableMonths;

  const adultSeries = monthsForGeo.map((m) => {
    let sum = 0;
    for (const r of rows) {
      if (
        r.STATUS === "Final" &&
        r.AGE === "Adult" &&
        r.GEOGRAPHY_CODE === selectedGeo &&
        Number(r.TREATMENT_MONTH) === m
      ) {
        sum += Number(r.VALUE);
      }
    }
    return sum;
  });

  const childSeries = monthsForGeo.map((m) => {
    let sum = 0;
    for (const r of rows) {
      if (
        r.STATUS === "Final" &&
        r.AGE === "Child" &&
        r.GEOGRAPHY_CODE === selectedGeo &&
        Number(r.TREATMENT_MONTH) === m
      ) {
        sum += Number(r.VALUE);
      }
    }
    return sum;
  });

  const lineData = {
    labels: monthsForGeo.map(yyyymmToLabel),
    datasets: [
      {
        label: "Adult",
        data: adultSeries,
        borderColor: "#0d47a1",
        backgroundColor: "rgba(13,71,161,0.15)",
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: "#0d47a1",
        borderWidth: 3,
      },
      {
        label: "Child",
        data: childSeries,
        borderColor: "#81D4FA",
        backgroundColor: "rgba(129,212,250,0.25)", 
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: "#4FC3F7",
        borderWidth: 3,
      },
    ],
  };

  function getColor(v) {
    if (!v) return "#f0f0f0";
    if (v > 35000) return "#08306b";
    if (v > 30000) return "#08519c";
    if (v > 25000) return "#2171b5";
    if (v > 20000) return "#4292c6";
    if (v > 15000) return "#6baed6";
    return "#9ecae1";
  }

  const geoJsonStyle = (feature) => {
    const code = feature.properties.ICB24CDH;
    const v = valueByGeo.get(code);
    return {
      weight: 1,
      color: "#666",
      fillOpacity: 0.75,
      fillColor: getColor(v),
    };
  };

  const onEachFeature = (feature, layer) => {
    const code = feature.properties.ICB24CDH;
    const name = feature.properties.ICB23NM;
    const v = valueByGeo.get(code);
    
    // Bind popup on click to display region details
    layer.bindPopup(
      `<b>${name}</b><br/>${selectedAge} ${yyyymmToLabel(selectedMonth)}: ${v ?? "No data"}`
    );
    
    // Highlight boundary on hover (without triggering popup)
    layer.on("mouseover", () => {
      layer.setStyle({ weight: 3, color: "#111" });
      layer.bringToFront();
    });
    
    // Reset boundary style when mouse leaves
    layer.on("mouseout", () => {
      layer.setStyle(geoJsonStyle(feature));
    });
    
    // Update selected ICB when region is clicked
    layer.on("click", () => {
      setSelectedGeo(code);
    });
  };

  return (
    <div style={{ padding: "20px 40px", width: "100vw", marginLeft: "calc(50% - 50vw)", boxSizing: "border-box", }}>
      <h1>Monthly NHS Dental Activity in England (ICB Level)</h1>

      <div style={{ color: "#444" }}>
        <h3 style={{ marginBottom: 8 }}>Where Is NHS Dental Care Most Active — And Who Is Being Served?</h3>

        <p style={{ lineHeight: 1.6 }}>
          NHS dental services form a crucial part of England’s healthcare system, yet public debate often focuses on shortages and access barriers. But what does the data reveal about how dental care is distributed across regions? This interactive map and timeline trace monthly dental activity across England’s Integrated Care Boards. By selecting a region and comparing adult and child services, users can uncover patterns of concentration, fluctuation, and disparity. The story that emerges is not just about numbers — but about how geography shapes healthcare experience.
        </p>

        <h3 style={{ marginTop: 20, marginBottom: 8 }}>Data sources</h3>

        <p style={{ lineHeight: 1.6 }}>
          Dental activity data are sourced from the NHS Business Services Authority Open Data Portal. ICB boundary data (April 2023) are provided by data.gov.uk, and the basemap is powered by OpenStreetMap.
        </p>
      </div>

      <div style={{ display: "flex", gap: 24, marginTop: 20, marginBottom: 10, alignItems: "stretch", width: "100%", }}>
        <label>
          ICB:
          <select
            value={selectedGeo}
            onChange={(e) => setSelectedGeo(e.target.value)}
            style={{
              fontSize: 16,
              padding: "6px 12px",
              height: 38,
              borderRadius: 6,
            }}
          >
            {Array.from(
              new Map(
                rows
                .filter(
                  (r) =>
                    r?.GEOGRAPHY_CODE &&
                  r.GEOGRAPHY_CODE !== "E92000001" &&
                  r?.GEOGRAPHY_NAME
                )
                .map((r) => [r.GEOGRAPHY_CODE, r.GEOGRAPHY_NAME])
              ).entries()
            )
            .sort((a, b) => String(a[1]).localeCompare(String(b[1])))
            .map(([code, name]) => (
            <option key={code} value={code}>
              {name} ({code})
              </option>
            ))}
          </select>
        </label>

        <label>
          Month:
          <select
            value={selectedMonth ?? ""}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            style={{
              fontSize: 16,
              padding: "6px 12px",
              height: 38,
              borderRadius: 6,
            }}
          >
            {availableMonths.map((m) => (
              <option key={m} value={m}>
                {yyyymmToLabel(m)}
              </option>
            ))}
          </select>
        </label>

        <label>
          Age:
          <select
            value={selectedAge}
            onChange={(e) => setSelectedAge(e.target.value)}
            style={{
              fontSize: 16,
              padding: "6px 12px",
              height: 38,
              borderRadius: 6,
            }}
          >
            <option value="Adult">Adult</option>
            <option value="Child">Child</option>
          </select>
        </label>
      </div>

      <div
        style={{
          display: "flex",
          gap: 24,
          marginTop: 20,
          alignItems: "stretch",
        }}
      >
        {/* Left panel: Choropleth map */}
        <div
          style={{
            flex: 1.4,
            minWidth: 0,
            height: "75vh",
            minHeight: 650,
            borderRadius: 16,
            overflow: "hidden",
            position: "relative",
          }}
        >
          <MapContainer
            style={{ height: "100%", width: "100%" }}
            center={[52.8, -1.6]}
            zoom={6.4}
          >
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {icbGeo && (
              <GeoJSON
                data={icbGeo}
                style={geoJsonStyle}
                onEachFeature={onEachFeature}
              />
            )}
          </MapContainer>

          {/* Choropleth legend */}
          <div
          style={{
            position: "absolute",
            top: 20,
            right: 20,
            zIndex: 1000,
            pointerEvents: "auto",
            background: "white",
            padding: "12px 14px",
            borderRadius: 12,
            boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
            fontSize: 13,
            lineHeight: 1.4,
            }}
          >
            <div style={{ fontWeight: "bold", marginBottom: 8 }}>
              {selectedAge} Activity
            </div>
            
            <LegendItem color="#08306b" label="> 35,000" />
            <LegendItem color="#08519c" label="30,000 – 35,000" />
            <LegendItem color="#2171b5" label="25,000 – 30,000" />
            <LegendItem color="#4292c6" label="20,000 – 25,000" />
            <LegendItem color="#6baed6" label="15,000 – 20,000" />
            <LegendItem color="#9ecae1" label="< 15,000" />
            </div>
        </div>

        {/* Right panel: Time-series chart */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            background: "#fff",
            padding: 24,
            borderRadius: 16,
            boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Monthly totals for selected ICB</h2>
          <div style={{ flex: 1 }}>
            <Line data={lineData} options={{ maintainAspectRatio: false }} />
          </div>
        </div>
      </div>

      <div style={{ color: "#444" }}>
        <h3 style={{ marginBottom: 8 }}>Why Do These Patterns Matter?</h3>

        <p style={{ lineHeight: 1.6 }}>
          Differences in dental activity may reflect variations in population size, funding allocation, workforce availability, or demand. However, raw activity data does not directly measure unmet need — regions with lower activity may not necessarily have lower demand. As with all spatial data, interpretation requires caution.
        </p>
      </div>
    </div>
  )};