// lib/email/template.ts
//
// The PURE presentation layer of the daily digest — a DigestInput in, an HTML string
// out. Table-based, fully inline-CSS layout (the only layout email clients render
// reliably), using the Prism dark instrument-panel tokens copied verbatim from
// app/globals.css :root and the four dimension hues. No LLM, no DB, no math: every
// number is already final on the DigestInput. Null values render as the "—" no-signal
// glyph, never a fabricated 0.

import type {
  DigestInput,
  DigestSpectrumRow,
  DigestPrCallout,
  DigestRecommendation,
  DigestCourse,
} from './data';

// ── tokens (verbatim from app/globals.css :root) ────────────────────────────
const T = {
  bg: '#0d111c',
  panel: '#151b2b',
  panel2: '#1a2236',
  line: '#2a3348',
  line2: '#363f57',
  ink: '#eef1f7',
  mut: '#8b95ac',
  mut2: '#5f6a83',
  usage: '#5b8def',
  eff: '#2dd4bf',
  effness: '#f5a524',
  prof: '#a78bfa',
  good: '#3ecf8e',
  bad: '#f0616d',
  warn: '#f5a524',
  disp: "'Space Grotesk','Segoe UI',Helvetica,Arial,sans-serif",
  body: "'IBM Plex Sans','Segoe UI',Helvetica,Arial,sans-serif",
  mono: "'JetBrains Mono','SFMono-Regular',Menlo,Consolas,monospace",
} as const;

const NO_SIGNAL = '—';

// tag hue lookup (matches .tag2.<tag> in globals.css)
const TAG_HUE: Record<string, string> = {
  usage: T.usage,
  eff: T.eff,
  effness: T.effness,
  prof: T.prof,
  cost: T.good,
};

// PR verdict tone → hue
const TONE_HUE: Record<DigestPrCallout['flagTone'], string> = {
  ok: T.good,
  warn: T.warn,
  bad: T.bad,
};

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtScore(v: number | null): string {
  return v === null || Number.isNaN(v) ? NO_SIGNAL : String(Math.round(v));
}

function signed(v: number | null): string {
  if (v === null || Number.isNaN(v)) return NO_SIGNAL;
  const r = Math.round(v * 10) / 10;
  if (r === 0) return '±0';
  return r > 0 ? `+${r}` : `−${Math.abs(r)}`; // U+2212 minus
}

function deltaColor(v: number | null): string {
  if (v === null || v === 0 || Number.isNaN(v)) return T.mut;
  return v > 0 ? T.good : T.bad;
}

// ── section builders ────────────────────────────────────────────────────────

function headerBlock(d: DigestInput): string {
  const l1 = fmtScore(d.l1);
  const deltaTxt = d.l1Delta === null ? '' : signed(d.l1Delta);
  const deltaCol = deltaColor(d.l1Delta);
  const band = d.band ? esc(d.band) : NO_SIGNAL;
  const blurb = d.bandBlurb ? esc(d.bandBlurb) : '';

  return `
  <tr><td style="padding:24px 28px 8px;">
    <div style="font-family:${T.mono};font-size:10.5px;letter-spacing:.13em;text-transform:uppercase;color:${T.mut};">AI-native index · your day</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:10px;"><tr>
      <td style="vertical-align:bottom;">
        <span style="font-family:${T.disp};font-size:56px;font-weight:700;line-height:.9;color:${T.ink};letter-spacing:-.02em;">${l1}</span>
        <span style="font-family:${T.disp};font-size:20px;font-weight:500;color:${T.mut2};"> / 100</span>
      </td>
      <td style="vertical-align:bottom;text-align:right;">
        ${
          deltaTxt
            ? `<span style="font-family:${T.mono};font-size:14px;font-weight:600;color:${deltaCol};">${deltaTxt} <span style="color:${T.mut2};font-weight:400;">vs last week</span></span>`
            : `<span style="font-family:${T.mono};font-size:12px;color:${T.mut2};">no prior baseline</span>`
        }
      </td>
    </tr></table>
    <div style="margin-top:12px;font-family:${T.mono};font-size:12px;color:${T.mut};">
      <span style="color:${T.ink};font-weight:600;">${band}</span>
      &nbsp;·&nbsp;<span>confidence ${esc(d.confidence)}</span>
    </div>
    ${blurb ? `<div style="margin-top:6px;font-size:13px;color:${T.mut};line-height:1.5;">${blurb}</div>` : ''}
  </td></tr>`;
}

function spectrumRow(s: DigestSpectrumRow): string {
  const score = s.score;
  const pct = score === null ? 0 : Math.max(0, Math.min(100, score));
  const vs = s.vsSquad;
  const vsTxt = vs === null ? '' : `${signed(vs)} vs squad`;
  const vsCol = deltaColor(vs);
  return `
  <tr>
    <td style="padding:9px 0;width:150px;vertical-align:middle;">
      <span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${s.hue};margin-right:8px;"></span>
      <span style="font-size:12.5px;color:${T.ink};">${esc(s.label)}</span>
    </td>
    <td style="padding:9px 12px;vertical-align:middle;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#222a3d;border-radius:5px;height:9px;"><tr>
        <td style="width:${pct}%;background:${s.hue};border-radius:5px;height:9px;line-height:9px;font-size:0;">&nbsp;</td>
        <td style="font-size:0;">&nbsp;</td>
      </tr></table>
    </td>
    <td style="padding:9px 0;width:52px;text-align:right;font-family:${T.mono};font-size:13px;color:${T.ink};vertical-align:middle;">${fmtScore(score)}</td>
    <td style="padding:9px 0 9px 12px;width:96px;text-align:right;font-family:${T.mono};font-size:11px;color:${vsCol};vertical-align:middle;">${vsTxt}</td>
  </tr>`;
}

function spectrumBlock(d: DigestInput): string {
  return `
  <tr><td style="padding:6px 28px 4px;">
    <div style="font-family:${T.disp};font-size:14px;font-weight:600;color:${T.ink};margin-bottom:6px;">Your spectrum vs the squad</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      ${d.spectrum.map(spectrumRow).join('')}
    </table>
  </td></tr>`;
}

function prCalloutBlock(d: DigestInput): string {
  if (d.prCallouts.length === 0) return '';
  const items = d.prCallouts.map(prCalloutItem).join('');
  return `
  <tr><td style="padding:18px 28px 4px;">
    <div style="font-family:${T.disp};font-size:14px;font-weight:600;color:${T.ink};margin-bottom:8px;">PR call-outs</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${items}</table>
  </td></tr>`;
}

function prCalloutItem(p: DigestPrCallout): string {
  const tone = TONE_HUE[p.flagTone];
  const num = p.prNumber ? esc(p.prNumber) : '';
  return `
  <tr><td style="padding:0 0 8px;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${T.panel2};border:1px solid ${T.line};border-radius:10px;"><tr>
      <td style="padding:11px 13px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
          <td style="vertical-align:top;">
            ${num ? `<span style="font-family:${T.mono};font-size:11px;color:${T.mut2};margin-right:8px;">${num}</span>` : ''}
            <span style="font-size:13px;color:${T.ink};font-weight:500;">${esc(p.title)}</span>
          </td>
          <td style="text-align:right;vertical-align:top;white-space:nowrap;">
            <span style="font-family:${T.mono};font-size:10.5px;font-weight:500;color:${tone};background:${tone}18;border:1px solid ${tone}33;border-radius:6px;padding:3px 8px;">${esc(p.flag)}</span>
          </td>
        </tr></table>
        ${p.summary ? `<div style="margin-top:5px;font-size:11.5px;color:${T.mut};line-height:1.5;">${esc(p.summary)}</div>` : ''}
      </td>
    </tr></table>
  </td></tr>`;
}

function recBlock(rec: DigestRecommendation | null): string {
  if (!rec) return '';
  const hue = TAG_HUE[rec.tag] ?? T.prof;
  return `
  <tr><td style="padding:18px 28px 4px;">
    <div style="font-family:${T.disp};font-size:14px;font-weight:600;color:${T.ink};margin-bottom:8px;">Top recommendation</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${T.panel2};border:1px solid ${T.line};border-radius:10px;"><tr>
      <td style="padding:13px 15px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:middle;padding-right:10px;"><span style="color:${hue};font-size:15px;">✦</span></td>
          <td style="vertical-align:middle;">
            <span style="font-size:13.5px;color:${T.ink};font-weight:600;">${esc(rec.title)}</span>
            <span style="font-family:${T.mono};font-size:10px;color:${hue};background:${hue}18;border:1px solid ${hue}33;border-radius:5px;padding:2px 6px;margin-left:8px;">${esc(rec.kind)}</span>
          </td>
        </tr></table>
        ${rec.body ? `<div style="margin-top:7px;font-size:12px;color:${T.mut};line-height:1.55;">${esc(rec.body)}</div>` : ''}
      </td>
    </tr></table>
  </td></tr>`;
}

function courseBlock(course: DigestCourse | null, ctaBase: string): string {
  if (!course) return '';
  const pct = Math.max(0, Math.min(100, course.progressPct));
  // Absolute URL for the course card CTA. A relative studio path is prefixed with the app origin.
  const href = /^https?:\/\//.test(course.url)
    ? course.url
    : `${ctaBase}${course.url.startsWith('/') ? '' : '/'}${course.url}`;
  return `
  <tr><td style="padding:18px 28px 4px;">
    <div style="font-family:${T.disp};font-size:14px;font-weight:600;color:${T.ink};margin-bottom:8px;">Course nudge</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${T.panel2};border:1px solid ${T.prof}30;border-radius:12px;"><tr>
      <td style="padding:15px 17px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
          <td style="vertical-align:middle;">
            <span style="font-family:${T.disp};font-size:14px;font-weight:600;color:${T.ink};">${esc(course.title)}</span>
            <div style="margin-top:4px;font-family:${T.mono};font-size:11px;color:${T.mut};">${esc(course.statusLabel)}</div>
          </td>
          <td style="text-align:right;vertical-align:middle;white-space:nowrap;">
            <a href="${esc(href)}" style="font-family:${T.mono};font-size:11px;color:${T.ink};text-decoration:none;border:1px solid ${T.line2};border-radius:7px;padding:8px 13px;display:inline-block;">Open course →</a>
          </td>
        </tr></table>
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:11px;background:#222a3d;border-radius:5px;height:8px;"><tr>
          <td style="width:${pct}%;background:${T.prof};border-radius:5px;height:8px;line-height:8px;font-size:0;">&nbsp;</td>
          <td style="font-size:0;">&nbsp;</td>
        </tr></table>
      </td>
    </tr></table>
  </td></tr>`;
}

function ctaBlock(d: DigestInput): string {
  return `
  <tr><td style="padding:22px 28px 26px;text-align:center;">
    <a href="${esc(d.ctaUrl)}" style="font-family:${T.disp};font-size:14px;font-weight:600;color:${T.bg};background:${T.ink};text-decoration:none;border-radius:9px;padding:12px 26px;display:inline-block;">Open My view →</a>
  </td></tr>`;
}

function footerBlock(d: DigestInput): string {
  return `
  <tr><td style="padding:16px 28px 24px;border-top:1px solid ${T.line};">
    <div style="font-family:${T.mono};font-size:10.5px;color:${T.mut2};line-height:1.6;">
      Prism · One light · four signals<br/>
      ${esc(d.date)} · ${esc(d.windowLabel)}
    </div>
  </td></tr>`;
}

// ── document shell ──────────────────────────────────────────────────────────

/** Render the full HTML email document for a DigestInput. Pure — no side effects. */
export function renderDigestHtml(d: DigestInput): string {
  const preheader = d.band
    ? `Your AI-native index is ${fmtScore(d.l1)} · ${esc(d.band)}`
    : 'Your daily AI-native engineering digest';

  const body = [
    headerBlock(d),
    spectrumBlock(d),
    prCalloutBlock(d),
    recBlock(d.topRecommendation),
    courseBlock(d.course, ctaBase(d.ctaUrl)),
    ctaBlock(d),
    footerBlock(d),
  ].join('');

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="dark"/>
<meta name="supported-color-schemes" content="dark"/>
<title>${esc(subjectFor(d))}</title>
</head>
<body style="margin:0;padding:0;background:${T.bg};font-family:${T.body};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${T.bg};">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="width:600px;max-width:600px;background:${T.panel};border:1px solid ${T.line};border-radius:16px;overflow:hidden;">
      ${body}
    </table>
  </td></tr>
</table>
</body></html>`;
}

/** The subject line for a digest. Deterministic (contains real numbers only). */
export function subjectFor(d: DigestInput): string {
  if (d.suppressed || d.l1 === null) {
    return `Prism · your daily digest — ${d.date}`;
  }
  const delta =
    d.l1Delta === null ? '' : ` (${signed(d.l1Delta)} vs last week)`;
  const band = d.band ? ` · ${d.band}` : '';
  return `Prism · your index is ${fmtScore(d.l1)}${band}${delta}`;
}

/** Origin from the CTA url (…/me → …) for prefixing relative course links. */
function ctaBase(ctaUrl: string): string {
  return ctaUrl.replace(/\/me\/?$/, '');
}
