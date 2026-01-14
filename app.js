/* Wejuman MVP A — ultra minimal
Core rules:
- Silence by default
- Zoom is language
- Map follows you (soft follow)
- Human actions appear only when lens is active
*/

const DEFAULT_VIEW = { lat: 43.7696, lng: 11.2558, z: 13 }; // Florence fallback
const ZOOM_SPEAK = 14; // threshold: start "speaking"
const FOLLOW_GRACE_MS = 12000; // pause follow after user touches map
const WHISPER_MS = 3200;

let map;
let userMarker = null;
let lastUserLatLng = null;
let lastUserTouchAt = 0;
let following = true;

let currentLens = "nearby"; // nearby | culture | urban | actions
let actionsLayer = L.layerGroup();
let actionsLoaded = false;

const elWhisper = document.getElementById("whisper");
const elMenu = document.getElementById("menu");
const elMenuBtn = document.getElementById("menuBtn");
const elRecenterBtn = document.getElementById("recenterBtn");
const elStatus = document.getElementById("status");

init();

function init() {
// 1) map (no visible controls)
map = L.map("map", {
zoomControl: false,
attributionControl: false,
preferCanvas: true,
}).setView([DEFAULT_VIEW.lat, DEFAULT_VIEW.lng], DEFAULT_VIEW.z);

// Minimal dark tiles (CartoDB Dark Matter)
L.tileLayer(
"https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
{ maxZoom: 19 }
).addTo(map);

// 2) whisper once
window.setTimeout(() => {
elWhisper.style.opacity = "0";
window.setTimeout(() => elWhisper.remove(), 800);
}, WHISPER_MS);

// 3) UI events
elMenuBtn.addEventListener("click", () => {
elMenu.hidden = !elMenu.hidden;
});

elRecenterBtn.addEventListener("click", () => {
following = true;
if (lastUserLatLng) map.setView(lastUserLatLng, Math.max(map.getZoom(), 15), { animate: true });
maybeSpeak();
});

document.querySelectorAll(".menuItem").forEach(btn => {
btn.addEventListener("click", () => {
setLens(btn.dataset.lens);
highlightActiveLens();
elMenu.hidden = true;
});
});
highlightActiveLens();

// 4) detect user interaction -> pause follow
map.on("dragstart zoomstart", () => {
lastUserTouchAt = Date.now();
following = false;
});

// 5) zoom/pan -> maybe speak (but only after user intent)
map.on("zoomend moveend", () => {
maybeSpeak();
});

// 6) geolocation (watch)
startGeolocation();

// Start in silence
hideStatus();
}

function startGeolocation() {
if (!navigator.geolocation) {
showStatus("Geolocation not supported on this device.");
return;
}

navigator.geolocation.watchPosition(
(pos) => {
const { latitude, longitude } = pos.coords;
lastUserLatLng = L.latLng(latitude, longitude);

if (!userMarker) {
userMarker = L.circleMarker(lastUserLatLng, {
radius: 7,
weight: 1,
opacity: 0.9,
fillOpacity: 0.9,
}).addTo(map);
} else {
userMarker.setLatLng(lastUserLatLng);
}

// soft follow: only recenter if no recent user touch
const now = Date.now();
const touchedRecently = (now - lastUserTouchAt) < FOLLOW_GRACE_MS;

if (following && !touchedRecently) {
const z = Math.max(map.getZoom(), 15);
map.setView(lastUserLatLng, z, { animate: true });
}

// keep silence unless zoom threshold reached
maybeSpeak();
},
(err) => {
showStatus("Location permission needed to test the MVP.");
console.warn(err);
},
{
enableHighAccuracy: true,
maximumAge: 15000,
timeout: 15000,
}
);
}

function setLens(lens) {
currentLens = lens;

// Clear layers unless actions lens
if (map.hasLayer(actionsLayer)) map.removeLayer(actionsLayer);

if (currentLens === "actions") {
ensureActionsLoaded().then(() => {
actionsLayer.addTo(map);
maybeSpeak(true);
});
} else {
hideStatus(); // back to silence until zoom triggers
maybeSpeak(true);
}
}

function maybeSpeak(force = false) {
const z = map.getZoom();

// Silence by default: only speak after user intent (zoom threshold)
if (!force && z < ZOOM_SPEAK) {
hideStatus();
return;
}

if (z < ZOOM_SPEAK) {
hideStatus();
return;
}

if (currentLens === "actions") {
showStatus("Human actions are present in this area.");
return;
}

if (currentLens === "culture") {
showStatus("Cultural places are present in this area.");
return;
}

if (currentLens === "urban") {
showStatus("Urban spaces are present in this area.");
return;
}

showStatus("Look around. The map responds.");
}

function showStatus(text) {
elStatus.textContent = text;
elStatus.hidden = false;
}

function hideStatus() {
elStatus.hidden = true;
elStatus.textContent = "";
}

function highlightActiveLens() {
document.querySelectorAll(".menuItem").forEach(btn => {
btn.classList.toggle("active", btn.dataset.lens === currentLens);
});
}

async function ensureActionsLoaded() {
if (actionsLoaded) return;
actionsLoaded = true;

try {
const res = await fetch("./data/actions.json", { cache: "no-store" });
if (!res.ok) throw new Error("actions.json not found");
const geojson = await res.json();
addActionsGeoJSON(geojson);
} catch (e) {
console.warn("Using fallback actions sample:", e);
const sample = {
"type": "FeatureCollection",
"features": [
{ "type": "Feature", "properties": { "name": "Sample action (edit data/actions.json)" }, "geometry": { "type": "Point", "coordinates": [11.2558, 43.7696] } }
]
};
addActionsGeoJSON(sample);
}
}

function addActionsGeoJSON(geojson) {
const layer = L.geoJSON(geojson, {
pointToLayer: (feature, latlng) => {
return L.circleMarker(latlng, { radius: 6, weight: 1, opacity: 0.9, fillOpacity: 0.9 });
},
onEachFeature: (feature, layer) => {
const name = feature?.properties?.name || "Human action";
layer.bindPopup(`<div style="font-size:13px;line-height:1.2">${escapeHtml(name)}</div>`, { closeButton: false });
}
});
actionsLayer.addLayer(layer);
}

function escapeHtml(str) {
return String(str).replace(/[&<>"']/g, (m) => ({
"&": "&amp;",
"<": "&lt;",
">": "&gt;",
'"': "&quot;",
"'": "&#39;"
}[m]));
}
