// Records Bazaar and lowest-BIN prices once per run and keeps daily averages for the last 7 days.
// Run hourly by .github/workflows/prices.yml on the "data" branch. Writes:
//   history.json  daily sums per item (input for the next run)
//   avg.json      what the app downloads: 3-day and 7-day averages per item
import fs from "node:fs";

const DIR = process.argv[2] || ".";
const KEEP_DAYS = 7;
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(`${DIR}/${f}`, "utf8")); } catch { return d; } };
const round = v => v >= 100 ? Math.round(v) : Math.round(v * 100) / 100;

const [bz, bin] = await Promise.all([
  fetch("https://api.hypixel.net/v2/skyblock/bazaar").then(r => r.json()),
  fetch("https://lb.tricked.dev/lowestbins").then(r => r.json()),
]);
if (!bz.success) throw new Error("Bazaar request failed");

const today = new Date().toISOString().slice(0, 10);
const hist = read("history.json", {days: []});
let day = hist.days.find(d => d.d === today);
if (!day) { day = {d: today, bz: {}, bin: {}}; hist.days.push(day); }
// bazaar: [sum of instant-sell (bid), sum of instant-buy (ask), samples]
for (const [id, p] of Object.entries(bz.products || {})) {
  const q = p.quick_status; if (!q || !(q.sellPrice > 0) || !(q.buyPrice > 0)) continue;
  const s = day.bz[id] ||= [0, 0, 0];
  s[0] += q.sellPrice; s[1] += q.buyPrice; s[2]++;
}
// lowest BIN: [sum, samples]
for (const [id, v] of Object.entries(bin)) {
  if (!(v > 0)) continue;
  const s = day.bin[id] ||= [0, 0];
  s[0] += v; s[1]++;
}
hist.days = hist.days.sort((a, b) => a.d.localeCompare(b.d)).slice(-KEEP_DAYS);

// averages: each day counts equally (a day's own average), so a partial today doesn't dominate
function averages(days) {
  const bzAcc = {}, binAcc = {};
  for (const d of days) {
    for (const [id, [b, a, n]] of Object.entries(d.bz)) { const x = bzAcc[id] ||= [0, 0, 0]; x[0] += b / n; x[1] += a / n; x[2]++; }
    for (const [id, [s, n]] of Object.entries(d.bin)) { const x = binAcc[id] ||= [0, 0]; x[0] += s / n; x[1]++; }
  }
  const outBz = {}, outBin = {};
  for (const [id, [b, a, n]] of Object.entries(bzAcc)) outBz[id] = [round(b / n), round(a / n)];
  for (const [id, [s, n]] of Object.entries(binAcc)) outBin[id] = round(s / n);
  return {bz: outBz, bin: outBin};
}
const d3 = hist.days.slice(-3), d7 = hist.days;
const a3 = averages(d3), a7 = averages(d7);
const avg = {
  t: Date.now(),
  days3: d3.length, days7: d7.length,
  from: d7[0]?.d, samplesToday: Object.values(day.bz)[0]?.[2] || 0,
  bz: Object.fromEntries(Object.entries(a3.bz).map(([id, v]) => [id, [...v, ...(a7.bz[id] || v)]])),     // [bid3, ask3, bid7, ask7]
  bin: Object.fromEntries(Object.entries(a3.bin).map(([id, v]) => [id, [v, a7.bin[id] ?? v]])),          // [bin3, bin7]
};
fs.writeFileSync(`${DIR}/history.json`, JSON.stringify(hist));
fs.writeFileSync(`${DIR}/avg.json`, JSON.stringify(avg));
console.log(`Saved ${Object.keys(avg.bz).length} Bazaar and ${Object.keys(avg.bin).length} BIN averages over ${d7.length} day(s).`);
