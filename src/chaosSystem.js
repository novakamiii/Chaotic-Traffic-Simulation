/**
 * Chaos System — monitors events, escalates chaos, triggers accidents.
 *
 * Chaos feeds on:
 * - Red lights run by aggressive drivers
 * - Pedestrians jaywalking
 * - High traffic density
 * - Long wait times
 */

export class ChaosSystem {
  constructor() {
    this.level = 0.3;     // 0 → 1, start higher so first accident comes sooner
    this.rate = 0.005;    // passive rise per second
    this.events = [];
    this.threshold = 0.85;
    this.onAccidentTrigger = null;
    this.accidentCooldown = 0;
  }

  update(delta, stats, trafficManager) {
    this.accidentCooldown = Math.max(0, this.accidentCooldown - delta);

    // Passive rise from traffic density
    const densityFactor = (stats.vehicles ?? 0) * 0.008;
    const jaywalkFactor = (trafficManager?.jaywalkers ?? 0) * 0.0005;
    const ranRedFactor = (trafficManager?.ranReds ?? 0) * 0.005;

    this.level += (this.rate + densityFactor + jaywalkFactor + ranRedFactor) * delta;

    // Cooldown after accident
    if (this.accidentCooldown > 0) {
      this.level *= 0.995;
    }

    this.level = Math.max(0, Math.min(1, this.level));

    // Check threshold — also force-check when density is high
    if (this.level >= this.threshold && this.accidentCooldown <= 0) {
      return this.triggerAccident(trafficManager);
    }

    return false;
  }

  triggerAccident(trafficManager) {
    if (!trafficManager) return false;

    const triggered = trafficManager.triggerAccident();
    if (triggered) {
      this.accidentCooldown = 8;
      this.level *= 0.3; // Reset after accident

      if (this.onAccidentTrigger) {
        this.onAccidentTrigger();
      }

      return true;
    }

    return false;
  }

  addEvent(type) {
    this.events.push({ type, time: Date.now() });

    switch (type) {
      case 'ranRed':
        this.level += 0.05;
        break;
      case 'jaywalk':
        this.level += 0.02;
        break;
      case 'nearMiss':
        this.level += 0.03;
        break;
    }

    this.level = Math.min(1, this.level);
  }

  getLevel() {
    return this.level;
  }

  getLevelPercentage() {
    return Math.round(this.level * 100);
  }

  getDangerZone() {
    return this.level > 0.7;
  }

  reset() {
    this.level = 0;
  }
}
