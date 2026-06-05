/**
 * HUD — floating stats overlay in the upper-left corner.
 * No dependencies. Pure DOM manipulation.
 */

const CRASH_LINES = [
  '⚡ COLLISION ⚡',
  '💥 IMPACT 💥',
  '🚨 CRASH 🚨',
  '🔥 CHAOS 🔥',
  'BOOM.',
  'SYSTEM FAILURE',
];

export class HUD {
  constructor() {
    this.container = document.getElementById('hud');
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'hud';
      document.body.appendChild(this.container);
    }
    this.el = {};
    this.build();
  }

  build() {
    this.container.innerHTML = `
      <div class="title">⟳ The Wait</div>

      <div style="display:flex;gap:0.75rem;margin-bottom:0.75rem;">
        <div class="mini-light" id="hud-light-ns">
          <div style="font-size:0.6rem;text-align:center;color:#4a4a6a;margin-bottom:2px;">N↕S</div>
          <div class="mini-bulb mini-red" id="hud-bulb-ns-r"></div>
          <div class="mini-bulb mini-yel" id="hud-bulb-ns-y"></div>
          <div class="mini-bulb mini-grn" id="hud-bulb-ns-g"></div>
        </div>
        <div class="mini-light" id="hud-light-ew">
          <div style="font-size:0.6rem;text-align:center;color:#4a4a6a;margin-bottom:2px;">E↔W</div>
          <div class="mini-bulb mini-red" id="hud-bulb-ew-r"></div>
          <div class="mini-bulb mini-yel" id="hud-bulb-ew-y"></div>
          <div class="mini-bulb mini-grn" id="hud-bulb-ew-g"></div>
        </div>
      </div>

      <div class="stat">
        <span class="label">Waiting</span>
        <span class="value" id="hud-waiting">0:00</span>
      </div>
      <div class="stat">
        <span class="label">Vehicles</span>
        <span class="value" id="hud-vehicles">0</span>
      </div>
      <div class="stat">
        <span class="label">Pedestrians</span>
        <span class="value" id="hud-pedestrians">0</span>
      </div>
      <div class="stat">
        <span class="label">Accidents</span>
        <span class="value" id="hud-accidents">0</span>
      </div>
      <div class="stat">
        <span class="label">Jaywalkers</span>
        <span class="value" id="hud-jaywalkers">0</span>
      </div>
      <div class="stat">
        <span class="label">Red Lights Run</span>
        <span class="value" id="hud-ranreds">0</span>
      </div>
      <div class="stat">
        <span class="label">Hit & Run</span>
        <span class="value" id="hud-hitrun">0</span>
      </div>
      <div class="chaos-label" style="margin-top:0.75rem;">Chaos Meter</div>
      <div class="chaos-bar">
        <div class="fill" id="hud-chaos-fill"></div>
      </div>
    `;

    this.el.waiting = document.getElementById('hud-waiting');
    this.el.vehicles = document.getElementById('hud-vehicles');
    this.el.pedestrians = document.getElementById('hud-pedestrians');
    this.el.accidents = document.getElementById('hud-accidents');
    this.el.jaywalkers = document.getElementById('hud-jaywalkers');
    this.el.ranReds = document.getElementById('hud-ranreds');
    this.el.hitRun = document.getElementById('hud-hitrun');
    this.el.chaosFill = document.getElementById('hud-chaos-fill');

    // Light bulb elements
    this.lightEls = {
      ns: { r: document.getElementById('hud-bulb-ns-r'), y: document.getElementById('hud-bulb-ns-y'), g: document.getElementById('hud-bulb-ns-g') },
      ew: { r: document.getElementById('hud-bulb-ew-r'), y: document.getElementById('hud-bulb-ew-y'), g: document.getElementById('hud-bulb-ew-g') },
    };
  }

  update(stats, chaosLevel, elapsed, lightStates) {
    const mins = Math.floor(elapsed / 60);
    const secs = Math.floor(elapsed % 60);
    const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;

    if (this.el.waiting) this.el.waiting.textContent = timeStr;
    if (this.el.vehicles) this.el.vehicles.textContent = stats.vehicles ?? 0;
    if (this.el.pedestrians) this.el.pedestrians.textContent = stats.pedestrians ?? 0;
    if (this.el.accidents) this.el.accidents.textContent = stats.accidents ?? 0;
    if (this.el.jaywalkers) this.el.jaywalkers.textContent = stats.jaywalkers ?? 0;
    if (this.el.ranReds) this.el.ranReds.textContent = stats.ranReds ?? 0;
    if (this.el.hitRun) this.el.hitRun.textContent = stats.hitPedestrians ?? 0;

    if (this.el.chaosFill) {
      const pct = Math.min(100, (chaosLevel ?? 0) * 100);
      this.el.chaosFill.style.width = `${pct}%`;

      if (chaosLevel > 0.7) {
        this.el.chaosFill.style.animation = 'pulse 0.5s ease-in-out infinite alternate';
      } else {
        this.el.chaosFill.style.animation = 'none';
      }
    }

    // Update traffic light indicators
    if (lightStates) {
      this.updateLight('ns', lightStates.ns);
      this.updateLight('ew', lightStates.ew);
    }
  }

  updateLight(id, state) {
    const els = this.lightEls[id];
    if (!els) return;

    const isOn = {
      r: state === 'red' || state === 'red_yellow',
      y: state === 'red_yellow' || state === 'yellow',
      g: state === 'green',
    };

    Object.entries(isOn).forEach(([color, active]) => {
      const el = els[color];
      if (!el) return;
      el.style.opacity = active ? '1' : '0.15';
      el.style.boxShadow = active
        ? `0 0 6px ${el.style.background || 'currentColor'}`
        : 'none';
    });
  }

  showCrashMessage() {
    const old = document.querySelector('.crash-toast');
    if (old) old.remove();

    const toast = document.createElement('div');
    toast.className = 'crash-toast';
    toast.textContent = CRASH_LINES[Math.floor(Math.random() * CRASH_LINES.length)];
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }
}
