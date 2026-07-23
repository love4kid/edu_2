// INVENI 그룹 통합 기업현황 대시보드 — 데이터 수집 스크립트
//
// GitHub Actions가 주기적으로 이 스크립트를 실행해 KRX/DART에서 최신 데이터를 가져오고
// data/summary.json으로 저장합니다. dashboard.html은 그 정적 JSON 파일만 읽습니다
// (브라우저가 KRX/DART를 직접 호출할 수 없는 이유는 README 참고).
//
// 로컬 실행법: .env 파일에 KRX_AUTH_KEY / DART_KEY 설정 후 `node scripts/fetch-data.js`
"use strict";
const fs = require("fs");
const path = require("path");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvFile(path.join(__dirname, "..", ".env"));

const KRX_AUTH_KEY = process.env.KRX_AUTH_KEY;
const DART_KEY = process.env.DART_KEY;
if (!KRX_AUTH_KEY || !DART_KEY) {
  console.error("KRX_AUTH_KEY / DART_KEY가 설정되지 않았습니다. .env 파일(로컬) 또는 GitHub Actions Secrets를 확인하세요.");
  process.exit(1);
}
const KRX_KOSPI = "https://data-dbg.krx.co.kr/svc/apis/sto/stk_bydd_trd";
const KRX_KOSDAQ = "https://data-dbg.krx.co.kr/svc/apis/sto/ksq_bydd_trd";

const COMPANIES = [
  { name: "LS ELECTRIC", ticker: "010120", market: "KOSPI", biz: "전력기기·전력인프라·자동화 솔루션", color: "#A5C8ED", corpCode: "00105855" },
  { name: "LS에코에너지", ticker: "229640", market: "KOSPI", biz: "베트남 전력케이블·구리/알루미늄 소재", color: "#B2DFDB", corpCode: "01093007" },
  { name: "LS머트리얼즈", ticker: "417200", market: "KOSDAQ", biz: "울트라커패시터·경량 알루미늄 부품", color: "#FFECB3", corpCode: "01528141" },
  { name: "E1", ticker: "017940", market: "KOSPI", biz: "LPG 수입·충전·판매 에너지기업", color: "#E1BEE7", corpCode: "00165583" },
  { name: "인베니", ticker: "015360", market: "KOSPI", biz: "도시가스(예스코)·투자전문 지주회사", color: "#FFCCBC", corpCode: "00105101" },
];
const TICKER_SET = new Set(COMPANIES.map(c => c.ticker));

// ---------- KRX ----------
const fmtBasDd = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
const isWeekend = d => { const w = d.getDay(); return w === 0 || w === 6; };

async function fetchKrxDay(basDd) {
  const fetchOne = async url => {
    try {
      const res = await fetch(`${url}?basDd=${basDd}`, { headers: { AUTH_KEY: KRX_AUTH_KEY } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.respCode) return [];
      return json.OutBlock_1 || [];
    } catch { return []; }
  };
  const [k, q] = await Promise.all([fetchOne(KRX_KOSPI), fetchOne(KRX_KOSDAQ)]);
  return [...k, ...q].filter(r => TICKER_SET.has(r.ISU_CD));
}

async function findTradingSnapshot(target, maxLookback = 8) {
  const d = new Date(target);
  for (let i = 0; i <= maxLookback; i++) {
    if (!isWeekend(d)) {
      const basDd = fmtBasDd(d);
      const rows = await fetchKrxDay(basDd);
      if (rows.length === COMPANIES.length) return { date: basDd, rows };
    }
    d.setDate(d.getDate() - 1);
  }
  return null;
}

// 액면분할 등 비연속 구간 자동 감지 & 수정주가 환산
function splitAdjust(closes) {
  const adj = closes.slice();
  for (let i = 0; i < adj.length - 1; i++) {
    const ratio = adj[i + 1] / adj[i];
    if (ratio > 2.5 || ratio < 0.4) {
      const factor = adj[i + 1] / adj[i];
      for (let j = 0; j <= i; j++) adj[j] *= factor;
    }
  }
  return adj;
}

function buildSampleDates(anchor, stepDays, count) {
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(anchor);
    d.setDate(d.getDate() - i * stepDays);
    out.push(d);
  }
  return out;
}

async function fetchSeriesForPeriod(anchor, stepDays, count) {
  const dates = buildSampleDates(anchor, stepDays, count);
  const snaps = await Promise.all(dates.map(d => findTradingSnapshot(d, 4)));
  const valid = snaps.filter(Boolean);
  const byDate = new Map(valid.map(s => [s.date, s]));
  const ordered = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (ordered.length < 4) return null;
  const perTicker = {};
  COMPANIES.forEach(c => {
    perTicker[c.ticker] = splitAdjust(ordered.map(s => Number(s.rows.find(r => r.ISU_CD === c.ticker).TDD_CLSPRC)));
  });
  return ordered.map((_, i) => COMPANIES.map(c => {
    const base = perTicker[c.ticker][0];
    return Math.round(((perTicker[c.ticker][i] / base) - 1) * 10000) / 100;
  }));
}

async function getLatest() {
  return findTradingSnapshot(new Date());
}

async function getSeries() {
  const anchor = new Date();
  const [oneM, threeM, oneY] = await Promise.all([
    fetchSeriesForPeriod(anchor, 4, 9),
    fetchSeriesForPeriod(anchor, 13, 8),
    fetchSeriesForPeriod(anchor, 31, 13),
  ]);
  return { "1M": oneM, "3M": threeM, "1Y": oneY };
}

// ---------- DART ----------
function quarterSequence(refDate, n) {
  const codes = ["11013", "11012", "11014", "11011"]; // 1Q, 반기, 3Q, 사업(연간)
  const endMonths = [3, 6, 9, 12];
  let y = refDate.getFullYear();
  let idx = -1;
  for (let i = 3; i >= 0; i--) { if (refDate.getMonth() + 1 > endMonths[i]) { idx = i; break; } }
  if (idx === -1) { idx = 3; y -= 1; }
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ bsns_year: String(y), reprt_code: codes[idx] });
    idx--; if (idx < 0) { idx = 3; y--; }
  }
  return out;
}

async function fetchCompanyFinancial(corpCode) {
  for (const { bsns_year, reprt_code } of quarterSequence(new Date(), 6)) {
    try {
      const url = `https://opendart.fss.or.kr/api/fnlttSinglAcnt.json?crtfc_key=${DART_KEY}&corp_code=${corpCode}&bsns_year=${bsns_year}&reprt_code=${reprt_code}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.status !== "000") continue;
      let rev = null, op = null, period = null;
      for (const item of json.list) {
        if (item.sj_div === "IS" && item.fs_div === "CFS") {
          if (item.account_nm.includes("매출액") && !item.account_nm.includes("매출원가")) {
            rev = Number(item.thstrm_amount.replace(/,/g, ""));
            period = item.thstrm_dt;
          }
          if (item.account_nm === "영업이익" || item.account_nm === "영업이익(손실)") {
            op = Number(item.thstrm_amount.replace(/,/g, ""));
          }
        }
      }
      if (rev !== null && op !== null) return { rev: rev / 1e8, op: op / 1e8, period, bsns_year, reprt_code };
    } catch { /* try older quarter */ }
  }
  return null;
}

async function getFinancials() {
  return Promise.all(COMPANIES.map(c => fetchCompanyFinancial(c.corpCode)));
}

// ---------- 실행 ----------
async function main() {
  console.log("KRX/DART 데이터 수집 시작...");
  const [latest, series, fin] = await Promise.all([getLatest(), getSeries(), getFinancials()]);
  const summary = {
    generatedAt: new Date().toISOString(),
    companies: COMPANIES.map(({ corpCode, ...c }) => c),
    latest, series, fin,
  };

  const outDir = path.join(__dirname, "..", "data");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));

  console.log("완료:", path.join(outDir, "summary.json"));
  console.log("latest.date:", latest && latest.date);
  console.log("series points:", Object.fromEntries(Object.entries(series).map(([k, v]) => [k, v ? v.length : 0])));
  console.log("fin ok:", fin.filter(Boolean).length, "/", fin.length);
}

main().catch(err => {
  console.error("데이터 수집 실패:", err);
  process.exit(1);
});
