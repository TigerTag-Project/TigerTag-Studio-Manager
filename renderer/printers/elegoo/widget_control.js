/**
 * printers/elegoo/widget_control.js — Elegoo "Control" card widget.
 *
 * Layout:
 *   [Step ▾] [Speed ▾]
 *   [Z pill] [XY circle] [X/Y/Z pos + Home X + Home Y]
 *   Fans title
 *   [🌀 toggle] [−] [25%] [+]   × 3 fans
 *   [💡 LED toggle]
 */
import { ctx } from '../context.js';

// ── Speed mode map ────────────────────────────────────────────────────────
const SPEED_MODES = [
  { value: 0, labelKey: 'elgCtrlSpeedNormal',    fallback: 'Normal'    },
  { value: 1, labelKey: 'elgCtrlSpeedBalanced',  fallback: 'Balanced'  },
  { value: 2, labelKey: 'elgCtrlSpeedSport',     fallback: 'Sport'     },
  { value: 3, labelKey: 'elgCtrlSpeedLudicrous', fallback: 'Ludicrous' },
];

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtPos(v) {
  if (typeof v !== 'number' || !isFinite(v)) return '—';
  return v.toFixed(1);
}

/** Convert raw fan speed 0–255 to display percentage 0–100. */
export function elgFanPct(raw) {
  if (typeof raw !== 'number' || !isFinite(raw)) return 0;
  return Math.round(Math.max(0, Math.min(255, raw)) / 255 * 100);
}

/** Clamp a raw fan change ±delta within 0–255. */
export function elgFanStep(current, delta) {
  const cur = (typeof current === 'number' && isFinite(current)) ? current : 0;
  return Math.max(0, Math.min(255, Math.round(cur + delta)));
}

function speedLabel(mode) {
  const entry = SPEED_MODES.find(m => m.value === mode);
  if (!entry) return `Mode ${mode}`;
  const lbl = ctx.t(entry.labelKey);
  return (lbl && lbl !== entry.labelKey) ? lbl : entry.fallback;
}

// ── Fan column: label · [icon − % +] sur une seule ligne ─────────────────

function fanCol(labelKey, fallback, fanKey, rawSpeed) {
  const pct   = elgFanPct(rawSpeed);
  const isOn  = pct > 0;
  const label = ctx.t(labelKey) || fallback;
  return `
    <div class="elg-fan-col">
      <div class="elg-fan-col-head">
        <button type="button"
                class="elg-fan-icon-btn${isOn ? ' elg-fan-icon-btn--on' : ''}"
                data-elg-ctrl-fan-toggle="${ctx.esc(fanKey)}"
                aria-label="${ctx.esc(label)}">
          <span class="icon icon-fan icon-16" aria-hidden="true"></span>
        </button>
        <span class="elg-fan-col-label">${ctx.esc(label)}</span>
      </div>
      <div class="elg-fan-col-controls">
        <button type="button"
                class="elg-fan-step-btn"
                data-elg-ctrl-fan-step="${ctx.esc(fanKey)}"
                data-step="-26"
                aria-label="Decrease">−</button>
        <span class="elg-fan-pct" data-elg-fan-pct="${ctx.esc(fanKey)}">${pct}%</span>
        <button type="button"
                class="elg-fan-step-btn"
                data-elg-ctrl-fan-step="${ctx.esc(fanKey)}"
                data-step="26"
                aria-label="Increase">+</button>
      </div>
    </div>`;
}

// ── Patch-only update (no DOM re-create) ─────────────────────────────────
// Met à jour uniquement les valeurs dynamiques de la card de contrôle déjà
// présente dans le DOM. Évite le flash causé par un innerHTML complet.

export function patchElegooControlCard(ctrlEl, conn) {
  const d = conn.data;

  // Fan percentages + icon toggle state
  for (const [fanKey, rawSpeed] of [
    ['fan', d.fanModel], ['aux_fan', d.fanAux], ['box_fan', d.fanBox],
  ]) {
    const pct   = elgFanPct(rawSpeed);
    const isOn  = pct > 0;
    const pctEl = ctrlEl.querySelector(`[data-elg-fan-pct="${fanKey}"]`);
    if (pctEl) pctEl.textContent = `${pct}%`;
    const iconBtn = ctrlEl.querySelector(`[data-elg-ctrl-fan-toggle="${fanKey}"]`);
    if (iconBtn) iconBtn.classList.toggle('elg-fan-icon-btn--on', isOn);
  }

  // Position X / Y / Z
  const posEl = ctrlEl.querySelector('.elg-ctrl-pos');
  if (posEl) {
    posEl.innerHTML =
      `<span>X:<b>${ctx.esc(fmtPos(d.posX))}</b></span>` +
      `<span>Y:<b>${ctx.esc(fmtPos(d.posY))}</b></span>` +
      `<span>Z:<b>${ctx.esc(fmtPos(d.posZ))}</b></span>`;
  }

  // LED button state
  const ledBtn = ctrlEl.querySelector('[data-elg-ctrl-led]');
  if (ledBtn) {
    const led = !!d.ledOn;
    ledBtn.classList.toggle('cre-action-btn--led-on', led);
    ledBtn.title = led
      ? (ctx.t('creLedOnTip')  || 'Turn off LED')
      : (ctx.t('creLedOffTip') || 'Turn on LED');
  }
}

// ── Main render ───────────────────────────────────────────────────────────

export function renderElegooControlCard(p, conn) {
  if (conn?.status !== 'connected') return '';
  const d    = conn.data;
  const step = conn._ctrlStep ?? 10;
  const mode = typeof d.speedMode === 'number' ? d.speedMode : 1;
  const led  = !!d.ledOn;
  const ledTip = ctx.esc(led ? (ctx.t('creLedOnTip') || 'Turn off LED') : (ctx.t('creLedOffTip') || 'Turn on LED'));

  const title    = ctx.t('elgCtrlTitle') || 'Control';
  const speedLbl = ctx.t('elgCtrlSpeed') || 'Print Speed';

  return `
    <section class="snap-block elg-ctrl">
      <!-- Jog pad -->
      <div class="elg-jog-wrap">

        <!-- Z pill (left): Z↑ · home-Z · Z↓ -->
        <div class="elg-jog-z-pill">
          <button class="elg-jog-z-btn"
                  data-elg-ctrl-jog="z" data-dist="${step}"
                  title="Z+${step}mm">Z↑</button>
          <button class="elg-jog-home-btn"
                  data-elg-ctrl-home="z"
                  title="Home Z">
            <span class="icon icon-home elg-home-icon"></span>
          </button>
          <button class="elg-jog-z-btn"
                  data-elg-ctrl-jog="z" data-dist="${-step}"
                  title="Z−${step}mm">Z↓</button>
        </div>

        <!-- XY circle: 4 directions + center home-XY + sector highlights -->
        <div class="elg-jog-xy-circle">
          <button class="elg-jog-xy-btn elg-jog-xy-btn--n"
                  data-elg-ctrl-jog="y" data-dist="${step}"
                  title="Y+${step}mm">Y+</button>
          <button class="elg-jog-xy-btn elg-jog-xy-btn--s"
                  data-elg-ctrl-jog="y" data-dist="${-step}"
                  title="Y−${step}mm">Y−</button>
          <button class="elg-jog-xy-btn elg-jog-xy-btn--w"
                  data-elg-ctrl-jog="x" data-dist="${-step}"
                  title="X−${step}mm">X−</button>
          <button class="elg-jog-xy-btn elg-jog-xy-btn--e"
                  data-elg-ctrl-jog="x" data-dist="${step}"
                  title="X+${step}mm">X+</button>
          <button class="elg-jog-home-btn elg-jog-home-btn--xy"
                  data-elg-ctrl-home="xy"
                  title="Home XY">
            <span class="icon icon-home elg-home-icon" aria-hidden="true"></span>
          </button>
          <div class="elg-jog-sector elg-jog-sector--n" aria-hidden="true"></div>
          <div class="elg-jog-sector elg-jog-sector--s" aria-hidden="true"></div>
          <div class="elg-jog-sector elg-jog-sector--w" aria-hidden="true"></div>
          <div class="elg-jog-sector elg-jog-sector--e" aria-hidden="true"></div>
        </div>

        <!-- Right pill: Home X · Home Y -->
        <div class="elg-jog-right-pill">
          <button class="elg-jog-home-btn"
                  data-elg-ctrl-home="y"
                  title="Home Y">
            <span class="elg-jog-home-axis">Y</span>
            <span class="icon icon-home elg-home-icon" aria-hidden="true"></span>
          </button>
          <button class="elg-jog-home-btn"
                  data-elg-ctrl-home="x"
                  title="Home X">
            <span class="elg-jog-home-axis">X</span>
            <span class="icon icon-home elg-home-icon" aria-hidden="true"></span>
          </button>
        </div>

        <!-- Info column: actions + position + step + speed -->
        <div class="elg-jog-info-col">
          <div class="elg-ctrl-actions">
            <button type="button"
                    class="cre-action-btn cre-action-btn--files elg-ctrl-action"
                    data-elg-open-files="1"
                    title="${ctx.esc(ctx.t('elgFilesTitle') || 'Print history')}">
              <span class="icon icon-folder icon-16"></span>
            </button>
            <button type="button"
                    class="cre-action-btn cre-action-btn--led elg-ctrl-action${led ? ' cre-action-btn--led-on' : ''}"
                    data-elg-ctrl-led="1"
                    title="${ledTip}">
              <span class="icon icon-bulb icon-16"></span>
            </button>
          </div>
          <div class="elg-ctrl-pos">
            <span>X:<b>${ctx.esc(fmtPos(d.posX))}</b></span>
            <span>Y:<b>${ctx.esc(fmtPos(d.posY))}</b></span>
            <span>Z:<b>${ctx.esc(fmtPos(d.posZ))}</b></span>
          </div>
          <div class="elg-ctrl-speed-row">
            <span class="elg-ctrl-speed-label">${ctx.esc(ctx.t('elgCtrlStep'))}</span>
            <select class="elg-ctrl-speed-select" data-elg-ctrl-step="1">
              ${[0.1, 1, 10, 30].map(s => `
                <option value="${s}"${s === step ? ' selected' : ''}>${s} mm</option>`).join('')}
            </select>
          </div>
          <div class="elg-ctrl-speed-row">
            <span class="elg-ctrl-speed-label">${ctx.esc(ctx.t('elgCtrlSpeed'))}</span>
            <select class="elg-ctrl-speed-select" data-elg-ctrl-speed="1">
              ${SPEED_MODES.map(m => `
                <option value="${m.value}"${m.value === mode ? ' selected' : ''}>${ctx.esc(speedLabel(m.value))}</option>`).join('')}
            </select>
          </div>
        </div>

      </div>

      <!-- Fans -->
      <div class="elg-fan-section">
        <div class="elg-fan-cols">
          ${fanCol('elgCtrlFanModel', 'Model', 'fan',     d.fanModel)}
          ${fanCol('elgCtrlFanAux',   'Aux',   'aux_fan', d.fanAux)}
          ${fanCol('elgCtrlFanBox',   'Case',  'box_fan', d.fanBox)}
        </div>
      </div>

    </section>`;
}
