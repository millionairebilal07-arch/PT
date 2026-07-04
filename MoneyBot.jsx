import { useState, useEffect, useCallback } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
// NOTE: This app is a SIMULATOR. All "signals" below are generated from a
// deterministic sine-wave function (see generateMarketData), NOT real market
// data or real technical analysis. It exists for UI/UX practice only and must
// never be presented as a real trading tool.
const ASSETS = [
  "EUR/USD","GBP/USD","USD/JPY","USD/CAD","AUD/USD","NZD/USD",
  "USD/CHF","EUR/GBP","EUR/JPY","GBP/JPY","USD/PKR","USD/BRL",
  "USD/INR","EUR/AUD","GBP/CAD","XAU/USD","XAG/USD",
  "BTC/USD","ETH/USD","LTC/USD","BNB/USD","SOL/USD",
  "EUR/USD OTC","GBP/USD OTC","USD/JPY OTC","AUD/USD OTC",
  "EUR/JPY OTC","XAU/USD OTC","BTC/USD OTC","ETH/USD OTC",
];

const TIMEFRAMES = [
  { label: "5s", value: 5 },
  { label: "10s", value: 10 },
  { label: "15s", value: 15 },
  { label: "30s", value: 30 },
  { label: "1m", value: 60 },
  { label: "2m", value: 120 },
  { label: "5m", value: 300 },
  { label: "30m", value: 1800 },
];

// Flags / icons for the asset selector
const FLAGS = {
  USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵", CAD: "🇨🇦",
  AUD: "🇦🇺", NZD: "🇳🇿", CHF: "🇨🇭", PKR: "🇵🇰", BRL: "🇧🇷", INR: "🇮🇳",
};
const CRYPTO_ICONS = { BTC: "₿", ETH: "Ξ", LTC: "Ł", BNB: "🔶", SOL: "◎" };
const METAL_ICONS = { XAU: "🥇", XAG: "⚪" };

function getAssetIcon(asset) {
  const base = asset.replace(" OTC", "");
  const [a, b] = base.split("/");
  if (CRYPTO_ICONS[a]) return CRYPTO_ICONS[a];
  if (METAL_ICONS[a]) return METAL_ICONS[a];
  return `${FLAGS[a] || ""}${FLAGS[b] || ""}`;
}

// ─── MARKET SIMULATOR ─────────────────────────────────────────────────────────
// Generates FAKE, deterministic "market conditions" from a sine wave for demo
// purposes. This is NOT connected to any real price feed.
function generateMarketData(asset, timeframe) {
  const seed = asset.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const t = Date.now();
  const cyclePeriod = 47000 + (seed % 13000);
  const phase = ((t % cyclePeriod) / cyclePeriod) * Math.PI * 2;
  const trendCycle = Math.sin(phase);
  const momentumCycle = Math.sin(phase * 1.3 + 0.4);
  const noiseFactor = Math.sin(phase * 7.1 + seed) * 0.18;

  const ema21 = 1.1000 + trendCycle * 0.005 + noiseFactor * 0.001;
  const ema52 = 1.1000 + trendCycle * 0.003;
  const rsi = 50 + momentumCycle * 22 + noiseFactor * 8;
  const macdLine = trendCycle * 0.0012 + noiseFactor * 0.0003;
  const macdSignal = trendCycle * 0.0009;
  const atr = 0.0008 + Math.abs(trendCycle) * 0.0006;
  const bbWidth = 0.0015 + Math.abs(momentumCycle) * 0.001;
  const price = ema21 + (trendCycle * 0.002);

  const bullEngulf = trendCycle > 0.5 && momentumCycle > 0.3;
  const bearEngulf = trendCycle < -0.5 && momentumCycle < -0.3;
  const strongRej = Math.abs(noiseFactor) < 0.06 && Math.abs(trendCycle) > 0.4;

  return {
    ema21, ema52, rsi: Math.max(10, Math.min(90, rsi)),
    macdLine, macdSignal, atr, bbWidth, price,
    bullEngulf, bearEngulf, strongRej,
    trendCycle, momentumCycle,
  };
}

function scoreSignal(data) {
  let trendScore = 0, momentumScore = 0, macdScore = 0, priceActionScore = 0, volatilityScore = 0;
  let direction = null;
  const reasons = [];
  const rejectReasons = [];

  // Trend (40 pts)
  const emaDiff = data.ema21 - data.ema52;
  const emaDiffAbs = Math.abs(emaDiff) / data.ema52;
  if (emaDiff > 0) {
    trendScore = Math.min(40, Math.floor(emaDiffAbs * 80000));
    if (trendScore >= 8) { reasons.push("✅ EMA21 Above EMA52"); direction = "CALL"; }
  } else if (emaDiff < 0) {
    trendScore = Math.min(40, Math.floor(emaDiffAbs * 80000));
    if (trendScore >= 8) { reasons.push("✅ EMA21 Below EMA52"); direction = "PUT"; }
  }

  // Momentum (20 pts) RSI
  if (data.rsi > 55) {
    momentumScore = Math.min(20, Math.floor((data.rsi - 55) * 2));
    if (momentumScore >= 8) reasons.push("✅ RSI Bullish");
    if (direction === "PUT") { rejectReasons.push("RSI conflict"); momentumScore = 0; }
  } else if (data.rsi < 45) {
    momentumScore = Math.min(20, Math.floor((45 - data.rsi) * 2));
    if (momentumScore >= 8) reasons.push("✅ RSI Bearish");
    if (direction === "CALL") { rejectReasons.push("RSI conflict"); momentumScore = 0; }
  } else {
    rejectReasons.push("RSI neutral zone");
  }

  // MACD (15 pts)
  const macdBull = data.macdLine > data.macdSignal;
  const macdStrength = Math.abs(data.macdLine - data.macdSignal);
  if (macdBull && direction === "CALL") {
    macdScore = Math.min(15, Math.floor(macdStrength * 15000));
    if (macdScore >= 6) reasons.push("✅ MACD Bullish");
  } else if (!macdBull && direction === "PUT") {
    macdScore = Math.min(15, Math.floor(macdStrength * 15000));
    if (macdScore >= 6) reasons.push("✅ MACD Bearish");
  } else {
    rejectReasons.push("MACD divergence");
    macdScore = 0;
  }

  // Price Action (15 pts)
  if (direction === "CALL") {
    if (data.price > data.ema21) { priceActionScore += 7; reasons.push("✅ Price Above Trend"); }
    if (data.bullEngulf) { priceActionScore += 5; reasons.push("✅ Bullish Engulfing"); }
    if (data.strongRej) { priceActionScore += 3; reasons.push("✅ Strong Momentum"); }
  } else if (direction === "PUT") {
    if (data.price < data.ema21) { priceActionScore += 7; reasons.push("✅ Price Below Trend"); }
    if (data.bearEngulf) { priceActionScore += 5; reasons.push("✅ Bearish Engulfing"); }
    if (data.strongRej) { priceActionScore += 3; reasons.push("✅ Strong Momentum"); }
  }
  priceActionScore = Math.min(15, priceActionScore);

  // Volatility (10 pts) — good ATR, not too wide BB
  const goodVolatility = data.atr > 0.0006 && data.atr < 0.002 && data.bbWidth < 0.003;
  volatilityScore = goodVolatility ? 10 : (data.atr > 0.0004 ? 5 : 0);
  if (volatilityScore >= 8) reasons.push("✅ Healthy Volatility");

  const total = trendScore + momentumScore + macdScore + priceActionScore + volatilityScore;

  // AI Filter: reject ranging markets
  if (Math.abs(data.trendCycle) < 0.1) {
    rejectReasons.push("Market ranging — AI filtered");
    return { score: 0, direction: null, reasons: [], rejectReasons, trendScore, momentumScore, macdScore, priceActionScore, volatilityScore };
  }

  return { score: total, direction, reasons, rejectReasons, trendScore, momentumScore, macdScore, priceActionScore, volatilityScore };
}

function getConfidenceLabel(score) {
  if (score >= 80) return { label: "🔥 VERY HIGH", color: "#FF6B35", glow: "#FF6B3560" };
  if (score >= 70) return { label: "✅ HIGH", color: "#00FF88", glow: "#00FF8840" };
  if (score >= 60) return { label: "⚠️ MEDIUM", color: "#FFD700", glow: "#FFD70040" };
  return { label: "🚫 NO TRADE", color: "#666", glow: "transparent" };
}

function formatExpiry(seconds) {
  if (seconds < 60) return `${seconds}s`;
  return `${seconds / 60}m`;
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const S = {
  root: {
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    background: "#050508",
    minHeight: "100vh",
    color: "#fff",
    WebkitFontSmoothing: "antialiased",
    position: "relative",
    overflow: "hidden",
  },
  bgGlowA: {
    position: "fixed", top: "-10%", left: "-15%", width: "60vw", height: "60vw",
    maxWidth: "500px", maxHeight: "500px", borderRadius: "50%",
    background: "radial-gradient(circle, #0055ff22, transparent 70%)",
    filter: "blur(40px)", pointerEvents: "none", zIndex: 0,
    animation: "drift1 14s ease-in-out infinite",
  },
  bgGlowB: {
    position: "fixed", bottom: "-15%", right: "-15%", width: "55vw", height: "55vw",
    maxWidth: "460px", maxHeight: "460px", borderRadius: "50%",
    background: "radial-gradient(circle, #00e5a020, transparent 70%)",
    filter: "blur(40px)", pointerEvents: "none", zIndex: 0,
    animation: "drift2 18s ease-in-out infinite",
  },
  centered: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "16px" },
  loginBox: {
    background: "linear-gradient(145deg, #0d0d1a, #0a0a14)",
    border: "1px solid #1a1a3a",
    borderRadius: "20px",
    padding: "48px 40px",
    width: "100%",
    maxWidth: "380px",
    textAlign: "center",
    boxShadow: "0 0 60px #0066ff18, 0 20px 60px #00000080",
  },
  logo: { fontSize: "36px", fontWeight: "900", letterSpacing: "-1px", marginBottom: "4px" },
  logoBlue: { color: "#0066FF" },
  logoWhite: { color: "#fff" },
  tagline: { color: "#4466aa", fontSize: "12px", letterSpacing: "3px", textTransform: "uppercase", marginBottom: "36px" },
  inputLabel: { display: "block", textAlign: "left", color: "#4466aa", fontSize: "11px", letterSpacing: "2px", marginBottom: "8px", textTransform: "uppercase" },
  input: {
    width: "100%", background: "#0a0a18", border: "1px solid #1a1a3a", borderRadius: "10px",
    color: "#fff", fontSize: "18px", padding: "14px 16px", outline: "none",
    textAlign: "center", letterSpacing: "6px", boxSizing: "border-box",
    transition: "border-color 0.2s",
  },
  btnBlue: {
    width: "100%", background: "linear-gradient(135deg, #0055dd, #0077ff)",
    border: "none", borderRadius: "12px", color: "#fff", fontWeight: "700",
    fontSize: "15px", padding: "16px", cursor: "pointer", letterSpacing: "1px",
    transition: "all 0.2s", marginTop: "24px",
    boxShadow: "0 4px 20px #0066ff40",
  },
  errorMsg: { color: "#ff4466", fontSize: "13px", marginTop: "12px", minHeight: "20px" },

  // APP
  app: { maxWidth: "480px", margin: "0 auto", padding: "0 0 80px 0" },
  header: {
    background: "linear-gradient(180deg, #050508, #07070f)",
    borderBottom: "1px solid #0d0d22",
    padding: "16px 20px 12px",
    position: "sticky", top: 0, zIndex: 100,
    backdropFilter: "blur(20px)",
  },
  headerRow: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  logoSmall: { fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px" },
  badge: {
    background: "#001133", border: "1px solid #003388", color: "#4499ff",
    fontSize: "10px", padding: "3px 10px", borderRadius: "20px", letterSpacing: "1px",
  },
  liveIndicator: { display: "flex", alignItems: "center", gap: "6px", color: "#00ff88", fontSize: "12px" },
  liveDot: {
    width: "7px", height: "7px", borderRadius: "50%", background: "#00ff88",
    animation: "pulse 1.5s ease-in-out infinite",
  },

  section: { padding: "16px 20px 0" },
  label: { color: "#334466", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "10px" },

  // Asset select
  assetBtn: (active) => ({
    background: active ? "linear-gradient(135deg, #00994d, #00c853)" : "#0a0a16",
    border: active ? "1px solid #00e676" : "1px solid #111128",
    borderRadius: "10px", padding: "10px 14px", cursor: "pointer",
    color: active ? "#001a0d" : "#556688", fontSize: "13px", fontWeight: active ? "800" : "400",
    whiteSpace: "nowrap", transition: "all 0.15s",
    boxShadow: active ? "0 0 14px #00c85340" : "none",
    display: "flex", alignItems: "center", gap: "6px",
  }),
  scrollRow: { display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "4px", scrollbarWidth: "none" },

  // Timeframe
  tfBtn: (active) => ({
    background: active
      ? "linear-gradient(135deg, #1565C0, #1E88E5)"
      : "#0a0a16",
    border: active ? "1px solid #42A5F5" : "1px solid #14142c",
    borderRadius: "999px", padding: "10px 18px", cursor: "pointer",
    color: active ? "#fff" : "#556688", fontSize: "13px",
    fontWeight: active ? "800" : "600",
    transition: "all 0.2s ease",
    boxShadow: active ? "0 0 18px #1E88E555, inset 0 1px 0 #ffffff30" : "none",
    transform: active ? "scale(1.06)" : "scale(1)",
  }),
  tfRow: { display: "flex", gap: "8px", flexWrap: "wrap" },

  // Generate button
  genBtn: (loading) => ({
    width: "100%",
    background: loading
      ? "linear-gradient(135deg, #002b22, #00402f)"
      : "linear-gradient(135deg, #00c853, #00e5a0, #00b8ff)",
    border: loading ? "1px solid #005c3f" : "1px solid #00ffc850",
    borderRadius: "20px", color: loading ? "#66ffcc" : "#001a10",
    fontWeight: "900", fontSize: "18px", padding: "22px",
    cursor: loading ? "not-allowed" : "pointer",
    letterSpacing: "1.5px", transition: "all 0.3s",
    boxShadow: loading ? "none" : "0 0 44px #00e5a055, 0 10px 30px #00000060, inset 0 1px 0 #ffffff50",
    transform: loading ? "scale(0.98)" : "scale(1)",
  }),

  // Signal card
  signalCard: (dir) => ({
    background: dir === "CALL"
      ? "linear-gradient(145deg, #001a0d, #002215)"
      : dir === "PUT"
      ? "linear-gradient(145deg, #1a0005, #22000a)"
      : "linear-gradient(145deg, #0d0d1a, #111122)",
    border: `1px solid ${dir === "CALL" ? "#004422" : dir === "PUT" ? "#440011" : "#1a1a33"}`,
    borderRadius: "18px", padding: "24px", marginBottom: "16px",
    boxShadow: dir === "CALL"
      ? "0 0 40px #00ff4420, inset 0 1px 0 #00ff4415"
      : dir === "PUT"
      ? "0 0 40px #ff004420, inset 0 1px 0 #ff004415"
      : "none",
    animation: "fadeUp 0.4s ease both",
  }),
  signalDir: (dir) => ({
    fontSize: "36px", fontWeight: "900", letterSpacing: "-1px",
    color: dir === "CALL" ? "#00FF66" : dir === "PUT" ? "#FF3355" : "#334466",
    textShadow: dir === "CALL" ? "0 0 20px #00FF6660" : dir === "PUT" ? "0 0 20px #FF335560" : "none",
  }),
  scoreBadge: (dir) => ({
    width: "64px", height: "64px", borderRadius: "16px",
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    background: dir === "CALL" ? "linear-gradient(145deg, #003318, #004d24)" : "linear-gradient(145deg, #330008, #4d000f)",
    border: `1px solid ${dir === "CALL" ? "#00e676" : "#ff3355"}`,
    color: dir === "CALL" ? "#00FF88" : "#FF6680",
    boxShadow: dir === "CALL" ? "0 0 16px #00e67640" : "0 0 16px #ff335540",
  }),
  confBar: { height: "6px", borderRadius: "3px", background: "#111", overflow: "hidden", margin: "10px 0" },
  confFill: (pct, dir) => ({
    height: "100%", borderRadius: "3px", width: `${pct}%`,
    background: dir === "CALL"
      ? "linear-gradient(90deg, #006633, #00FF66)"
      : "linear-gradient(90deg, #660011, #FF3355)",
    transition: "width 0.6s ease",
    boxShadow: dir === "CALL" ? "0 0 10px #00FF6680" : "0 0 10px #FF335580",
  }),
  reasonChip: {
    background: "#001122", border: "1px solid #002244",
    borderRadius: "6px", padding: "5px 10px", fontSize: "12px", color: "#44aaff",
    display: "inline-block", margin: "3px 3px 0 0",
  },

  // Score bars
  scoreRow: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" },
  scoreLabel: { color: "#445566", fontSize: "11px", width: "80px", flexShrink: 0 },
  scoreBar: { flex: 1, height: "4px", background: "#111", borderRadius: "2px", overflow: "hidden" },
  scoreFill: (pct, color) => ({
    height: "100%", borderRadius: "2px", width: `${pct}%`,
    background: color, transition: "width 0.5s ease",
  }),
  scoreVal: { color: "#fff", fontSize: "11px", width: "28px", textAlign: "right", flexShrink: 0 },

  // Scanner
  scannerCard: (rank) => ({
    background: "#0a0a15",
    border: `1px solid ${rank === 0 ? "#332200" : "#111122"}`,
    borderRadius: "12px", padding: "14px 16px",
    display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px",
    boxShadow: rank === 0 ? "0 0 20px #FFD70015" : "none",
    animation: `fadeUp 0.35s ease both`,
    animationDelay: `${rank * 0.06}s`,
  }),
  rankBadge: (rank) => ({
    width: "28px", height: "28px", borderRadius: "50%", flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px",
    background: rank === 0 ? "#332200" : rank === 1 ? "#1a1a22" : "#111118",
    border: `1px solid ${rank === 0 ? "#FFD700" : rank === 1 ? "#888" : "#666"}`,
  }),

  // History
  histRow: {
    display: "flex", alignItems: "center", gap: "10px",
    padding: "10px 14px", borderRadius: "10px",
    background: "#0a0a14", marginBottom: "6px",
    border: "1px solid #0d0d20",
    animation: "fadeUp 0.3s ease both",
  },

  // Nav
  navBar: {
    position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
    width: "100%", maxWidth: "480px",
    background: "#07070f", borderTop: "1px solid #0d0d22",
    display: "flex", padding: "8px 0 12px",
    backdropFilter: "blur(20px)",
  },
  navBtn: (active) => ({
    flex: 1, background: "none", border: "none", cursor: "pointer",
    color: active ? "#0077ff" : "#334455",
    display: "flex", flexDirection: "column", alignItems: "center", gap: "3px",
    fontSize: "10px", fontWeight: active ? "700" : "400",
    transition: "color 0.2s",
  }),

  noTrade: {
    textAlign: "center", padding: "32px 20px",
    color: "#334466", fontSize: "14px",
  },
};

// ─── COMPONENTS ───────────────────────────────────────────────────────────────
function ScoreBreakdown({ result }) {
  const bars = [
    { label: "Trend", val: result.trendScore, max: 40, color: "#0077ff" },
    { label: "Momentum", val: result.momentumScore, max: 20, color: "#00ccff" },
    { label: "MACD", val: result.macdScore, max: 15, color: "#aa44ff" },
    { label: "Price Act.", val: result.priceActionScore, max: 15, color: "#ffaa00" },
    { label: "Volatility", val: result.volatilityScore, max: 10, color: "#00ff88" },
  ];
  return (
    <div style={{ marginTop: "14px" }}>
      {bars.map(b => (
        <div key={b.label} style={S.scoreRow}>
          <span style={S.scoreLabel}>{b.label}</span>
          <div style={S.scoreBar}>
            <div style={S.scoreFill(b.val / b.max * 100, b.color)} />
          </div>
          <span style={S.scoreVal}>{b.val}/{b.max}</span>
        </div>
      ))}
    </div>
  );
}

function SignalCard({ signal, asset, timeframe }) {
  const conf = getConfidenceLabel(signal.score);
  const dir = signal.score >= 55 ? signal.direction : null;
  const showCard = signal.score >= 55 && signal.direction;
  const pct = Math.min(100, signal.score);

  // Demo countdown — purely visual, resets whenever a new signal arrives.
  const [remaining, setRemaining] = useState(timeframe);
  useEffect(() => {
    setRemaining(timeframe);
    if (!showCard) return;
    const id = setInterval(() => {
      setRemaining(r => (r > 0 ? r - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [signal, timeframe, showCard]);

  if (!showCard) {
    return (
      <div style={{ ...S.signalCard(null), textAlign: "center", padding: "32px 20px" }}>
        <div style={{ fontSize: "40px", marginBottom: "12px" }}>🚫</div>
        <div style={{ fontSize: "22px", fontWeight: "800", color: "#334466", marginBottom: "6px" }}>NO TRADE</div>
        <div style={{ color: "#223355", fontSize: "13px", lineHeight: "1.6" }}>
          Market conditions do not meet quality threshold.
          <br />AI filtered: {signal.rejectReasons.slice(0, 2).join(", ") || "weak setup"}
        </div>
        <div style={{ marginTop: "16px", color: "#1a2a44", fontSize: "12px" }}>Score: {signal.score}/100</div>
      </div>
    );
  }

  const remainPct = timeframe > 0 ? Math.round((remaining / timeframe) * 100) : 0;

  return (
    <div style={S.signalCard(dir)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
        <div>
          <div style={{ color: "#445577", fontSize: "11px", letterSpacing: "2px", marginBottom: "4px" }}>SIGNAL</div>
          <div style={S.signalDir(dir)}>{dir === "CALL" ? "↗ CALL" : "↘ PUT"}</div>
          <div style={{ color: conf.color, fontWeight: "700", fontSize: "12px", marginTop: "2px" }}>{conf.label.replace(/^[^ ]+ /, "")} confidence</div>
        </div>
        <div style={S.scoreBadge(dir)}>
          <div style={{ fontSize: "26px", fontWeight: "900" }}>{signal.score}</div>
          <div style={{ fontSize: "9px", letterSpacing: "1px", opacity: 0.8 }}>SCORE</div>
        </div>
      </div>

      <div style={S.confBar}>
        <div style={S.confFill(pct, dir)} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
        <div>
          <span style={{ color: "#445577", fontSize: "11px" }}>PAYOUT </span>
          <span style={{ color: "#fff", fontWeight: "700", fontSize: "13px" }}>{Math.min(95, 65 + Math.round(signal.score / 4))}%</span>
        </div>
        <div>
          <span style={{ color: "#445577", fontSize: "11px" }}>EXPIRY </span>
          <span style={{ color: "#fff", fontWeight: "700", fontSize: "13px" }}>⏱ {formatExpiry(timeframe)}</span>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
        <div>
          <span style={{ color: "#445577", fontSize: "11px" }}>ASSET </span>
          <span style={{ color: "#fff", fontWeight: "600", fontSize: "13px" }}>{getAssetIcon(asset)} {asset}</span>
        </div>
        <div>
          <span style={{ color: "#445577", fontSize: "11px" }}>TREND </span>
          <span style={{ color: dir === "CALL" ? "#00FF66" : "#FF3355", fontWeight: "600", fontSize: "13px" }}>
            {dir === "CALL" ? "📈 BULLISH" : "📉 BEARISH"}
          </span>
        </div>
      </div>

      <div style={{ marginBottom: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
          <span style={{ color: "#445577", fontSize: "11px", letterSpacing: "1px" }}>TIME REMAINING (DEMO)</span>
          <span style={{ color: remaining > 0 ? "#00e5a0" : "#556688", fontSize: "12px", fontWeight: "700" }}>
            {remaining > 0 ? `${remaining}s · ENTRY OPEN` : "WAIT ZONE"}
          </span>
        </div>
        <div style={S.confBar}>
          <div style={{
            height: "100%", borderRadius: "3px", width: `${remainPct}%`,
            background: remaining > 0 ? "linear-gradient(90deg, #00994d, #00e5a0)" : "#222",
            transition: "width 1s linear",
          }} />
        </div>
      </div>

      <div style={{ borderTop: "1px solid #0d1a2a", paddingTop: "14px", marginBottom: "14px" }}>
        <div style={{ color: "#334455", fontSize: "11px", letterSpacing: "2px", marginBottom: "8px" }}>REASONS</div>
        <div>{signal.reasons.map((r, i) => <span key={i} style={S.reasonChip}>{r}</span>)}</div>
      </div>

      <ScoreBreakdown result={signal} />
    </div>
  );
}

// ─── SCANNER ─────────────────────────────────────────────────────────────────
function SmartScanner({ timeframe }) {
  const [results, setResults] = useState([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const scan = () => {
      const scored = ASSETS.map(a => {
        const data = generateMarketData(a, timeframe);
        const result = scoreSignal(data);
        return { asset: a, ...result };
      })
        .filter(r => r.score >= 45 && r.direction)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      setResults(scored);
    };
    scan();
    const id = setInterval(() => { scan(); setTick(t => t + 1); }, 5000);
    return () => clearInterval(id);
  }, [timeframe]);

  const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];

  return (
    <div>
      {results.length === 0 && (
        <div style={S.noTrade}>
          <div style={{ fontSize: "32px", marginBottom: "10px", animation: "pulse 1.8s ease-in-out infinite" }}>🔍</div>
          Scanning markets... No strong setups found yet.
        </div>
      )}
      {results.map((r, i) => {
        const conf = getConfidenceLabel(r.score);
        return (
          <div key={r.asset} style={S.scannerCard(i)}>
            <div style={S.rankBadge(i)}>{medals[i]}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: "700", fontSize: "14px" }}>{getAssetIcon(r.asset)} {r.asset}</span>
                <span style={{
                  fontWeight: "800", fontSize: "13px",
                  color: r.direction === "CALL" ? "#00FF66" : "#FF3355",
                }}>
                  {r.direction === "CALL" ? "🟢 CALL" : "🔴 PUT"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
                <span style={{ color: conf.color, fontSize: "12px" }}>{conf.label}</span>
                <span style={{ color: "#FFD700", fontWeight: "700", fontSize: "13px" }}>{r.score}%</span>
              </div>
              <div style={S.confBar}>
                <div style={S.confFill(r.score, r.direction)} />
              </div>
            </div>
          </div>
        );
      })}
      <div style={{ textAlign: "center", color: "#223344", fontSize: "11px", marginTop: "8px" }}>
        🔄 Auto-refreshes every 5s · Tick #{tick}
      </div>
    </div>
  );
}

// ─── HISTORY ─────────────────────────────────────────────────────────────────
function HistoryPanel({ history }) {
  if (history.length === 0) return (
    <div style={S.noTrade}>
      <div style={{ fontSize: "32px", marginBottom: "10px" }}>📋</div>
      No signals generated yet. Start analyzing!
    </div>
  );

  const wins = history.filter(h => h.result === "WIN").length;
  const losses = history.filter(h => h.result === "LOSS").length;
  const settled = wins + losses;
  const total = history.length;
  const wr = settled > 0 ? Math.round(wins / settled * 100) : 0;

  return (
    <div>
      <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
        {[
          { label: "Signals", val: total, color: "#0077ff" },
          { label: "Wins", val: wins, color: "#00FF66" },
          { label: "Losses", val: losses, color: "#FF3355" },
          { label: "Win Rate", val: `${wr}%`, color: "#FFD700" },
        ].map(s => (
          <div key={s.label} style={{
            flex: 1, background: "#0a0a15", border: "1px solid #111122",
            borderRadius: "10px", padding: "12px 8px", textAlign: "center",
          }}>
            <div style={{ color: s.color, fontWeight: "800", fontSize: "18px" }}>{s.val}</div>
            <div style={{ color: "#334455", fontSize: "10px", marginTop: "2px" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {history.slice().reverse().map((h) => (
        <div key={h.id} style={S.histRow}>
          <span style={{ fontSize: "18px" }}>{h.direction === "CALL" ? "🟢" : "🔴"}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: "600", fontSize: "13px" }}>{getAssetIcon(h.asset)} {h.asset}</div>
            <div style={{ color: "#334455", fontSize: "11px" }}>{h.time} · {formatExpiry(h.timeframe)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "#FFD700", fontWeight: "700", fontSize: "13px" }}>{h.score}%</div>
            {h.result ? (
              <div style={{ color: h.result === "WIN" ? "#00FF66" : "#FF3355", fontSize: "11px" }}>
                {h.result}
              </div>
            ) : (
              <div style={{ color: "#556688", fontSize: "11px" }}>⏳ PENDING</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
const HISTORY_KEY = "moneybot:history";
const MAX_HISTORY = 5000;

export default function MoneyBot() {
  const [acknowledged, setAcknowledged] = useState(false);
  const [tab, setTab] = useState("signal");
  const [asset, setAsset] = useState("EUR/USD");
  const [timeframe, setTimeframe] = useState(60);
  const [signal, setSignal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Load saved history once on mount (persists across sessions on this device).
  useEffect(() => {
    (async () => {
      try {
        const saved = await window.storage.get(HISTORY_KEY, false);
        if (saved && saved.value) {
          const parsed = JSON.parse(saved.value);
          if (Array.isArray(parsed)) setHistory(parsed.slice(-MAX_HISTORY));
        }
      } catch (e) {
        // no saved history yet — start fresh
      } finally {
        setHistoryLoaded(true);
      }
    })();
  }, []);

  // Save history whenever it changes (after the initial load completes),
  // capped at MAX_HISTORY most recent entries.
  useEffect(() => {
    if (!historyLoaded) return;
    (async () => {
      try {
        await window.storage.set(HISTORY_KEY, JSON.stringify(history.slice(-MAX_HISTORY)), false);
      } catch (e) {
        // storage unavailable — history still works for this session
      }
    })();
  }, [history, historyLoaded]);

  const generateSignal = useCallback(async () => {
    setLoading(true);
    setSignal(null);
    await new Promise(r => setTimeout(r, 1400 + Math.random() * 600));
    const data = generateMarketData(asset, timeframe);
    const result = scoreSignal(data);
    setSignal(result);

    if (result.score >= 55 && result.direction) {
      const id = Date.now() + Math.random();
      setHistory(h => [...h, {
        id, asset, timeframe,
        direction: result.direction,
        score: result.score,
        time: new Date().toLocaleTimeString(),
        result: null,
      }].slice(-MAX_HISTORY));

      // Simulate a settled outcome shortly after (demo only — not a real trade
      // result). Higher score = higher simulated win chance.
      const winProb = Math.min(0.85, Math.max(0.35, result.score / 100));
      setTimeout(() => {
        const outcome = Math.random() < winProb ? "WIN" : "LOSS";
        setHistory(h => h.map(item => item.id === id ? { ...item, result: outcome } : item));
      }, 2500);
    }
    setLoading(false);
  }, [asset, timeframe]);

  if (!acknowledged) {
    return (
      <div style={{ ...S.root, ...S.centered }}>
        <style>{`
          @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
          @keyframes glow { 0%,100%{box-shadow:0 0 60px #0066ff18,0 20px 60px #00000080} 50%{box-shadow:0 0 80px #0066ff30,0 20px 60px #00000080} }
          button:hover { filter: brightness(1.15); }
        `}</style>
        <div style={{ ...S.loginBox, animation: "glow 3s ease-in-out infinite" }}>
          <div style={S.logo}>
            <span style={S.logoBlue}>MONEY</span>
            <span style={S.logoWhite}> BOT</span>
          </div>
          <div style={S.tagline}>Simulated Signal Practice Tool</div>
          <div style={{
            width: "60px", height: "60px", margin: "0 auto 20px",
            background: "linear-gradient(135deg, #331100, #663300)",
            border: "1px solid #886611", borderRadius: "16px",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px",
          }}>⚠️</div>
          <div style={{ color: "#ddbb66", fontSize: "13px", lineHeight: "1.7", textAlign: "left", marginBottom: "24px" }}>
            This app does <b>not</b> analyze real markets. Every "signal" is generated
            from a fake, deterministic math formula (a sine wave) — not live prices,
            not real indicators, and not investment advice of any kind.
            <br /><br />
            It's a demo for practicing UI/UX only. Please don't use it, or anything
            like it, to make real trading decisions.
          </div>
          <button style={S.btnBlue} onClick={() => setAcknowledged(true)}>
            I UNDERSTAND — ENTER DEMO
          </button>
          <div style={{ color: "#1a2244", fontSize: "11px", marginTop: "20px" }}>
            Money Bot · Simulator v3.0 · No real data
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={S.root}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes fadeUp { from{opacity:0; transform:translateY(10px)} to{opacity:1; transform:translateY(0)} }
        @keyframes drift1 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(30px,40px)} }
        @keyframes drift2 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-30px,-30px)} }
        @keyframes shimmer { 0%{background-position:-200px 0} 100%{background-position:200px 0} }
        ::-webkit-scrollbar { display: none; }
        * { scrollbar-width: none; }
        button:hover { filter: brightness(1.1); }
        button:active { transform: scale(0.97); }
        .asset-btn:hover, .tf-btn:hover { transform: translateY(-1px); }
      `}</style>

      <div style={S.bgGlowA} />
      <div style={S.bgGlowB} />

      {/* HEADER */}
      <div style={{ ...S.header, position: "sticky", zIndex: 100 }}>
        <div style={S.headerRow}>
          <div style={S.logoSmall}>
            <span style={{ color: "#0077ff" }}>MONEY</span>
            <span> BOT</span>
            <span style={{ marginLeft: "6px", fontSize: "16px" }}>🤖</span>
          </div>
          <div style={S.badge}>SIMULATED DATA</div>
          <div style={S.liveIndicator}>
            <div style={S.liveDot} />
            {time.toLocaleTimeString()}
          </div>
        </div>
      </div>
      <div style={{ position: "relative", zIndex: 1 }}>

      <div style={S.app}>
        {/* SIGNAL TAB */}
        {tab === "signal" && (
          <div>
            {/* Asset */}
            <div style={S.section}>
              <div style={S.label}>Asset</div>
              <div style={S.scrollRow}>
                {ASSETS.map(a => (
                  <button key={a} className="asset-btn" style={S.assetBtn(a === asset)} onClick={() => setAsset(a)}>
                    <span>{getAssetIcon(a)}</span>
                    <span>{a}</span>
                    {a === asset && <span>✓</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Timeframe */}
            <div style={{ ...S.section, marginTop: "16px" }}>
              <div style={S.label}>Expiry Timeframe</div>
              <div style={S.tfRow}>
                {TIMEFRAMES.map(tf => (
                  <button key={tf.value} className="tf-btn" style={S.tfBtn(tf.value === timeframe)}
                    onClick={() => setTimeframe(tf.value)}>
                    {tf.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Generate */}
            <div style={{ ...S.section, marginTop: "20px" }}>
              <button style={S.genBtn(loading)} onClick={generateSignal} disabled={loading}>
                {loading ? (
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
                    <span style={{ display: "inline-block", animation: "spin 0.8s linear infinite" }}>⚙️</span>
                    ANALYZING MARKET…
                  </span>
                ) : "🚀 GENERATE SIGNAL"}
              </button>
              <div style={{ textAlign: "center", color: "#334455", fontSize: "10px", marginTop: "8px", letterSpacing: "0.5px" }}>
                ⚠️ Simulated data · not real market analysis
              </div>
            </div>

            {/* Signal Result */}
            {signal && (
              <div style={{ ...S.section, marginTop: "16px" }}>
                <div style={S.label}>Signal Analysis</div>
                <SignalCard signal={signal} asset={asset} timeframe={timeframe} />
              </div>
            )}

            {!signal && !loading && (
              <div style={S.noTrade}>
                <div style={{ fontSize: "40px", marginBottom: "10px", animation: "fadeUp 0.4s ease both" }}>🤖</div>
                <div style={{ color: "#334466", fontSize: "14px" }}>
                  Select an asset and timeframe,<br />then hit GENERATE SIGNAL.
                </div>
              </div>
            )}
          </div>
        )}

        {/* SCANNER TAB */}
        {tab === "scanner" && (
          <div>
            <div style={S.section}>
              <div style={S.label}>Smart Market Scanner · All Assets</div>
              <SmartScanner timeframe={timeframe} />
            </div>
          </div>
        )}

        {/* HISTORY TAB */}
        {tab === "history" && (
          <div>
            <div style={S.section}>
              <div style={S.label}>Signal History</div>
              <HistoryPanel history={history} />
            </div>
          </div>
        )}
      </div>

      {/* NAV */}
      <div style={S.navBar}>
        {[
          { id: "signal", icon: "🚀", label: "Signal" },
          { id: "scanner", icon: "🔍", label: "Scanner" },
          { id: "history", icon: "📋", label: "History" },
        ].map(n => (
          <button key={n.id} style={S.navBtn(tab === n.id)} onClick={() => setTab(n.id)}>
            <span style={{ fontSize: "20px" }}>{n.icon}</span>
            {n.label}
          </button>
        ))}
      </div>
      </div>
    </div>
  );
}
