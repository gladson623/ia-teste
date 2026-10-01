import { env } from '../config/env.js';
import { AgentLoop } from './loop.js';
import { AgentStore } from './store.js';

export class AgentController {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly loop: AgentLoop,
    private readonly store: AgentStore
  ) {}

  start() {
    if (this.timer) return;
    this.store.state.running = true;
    this.store.state.mode = 'automatic';
    this.timer = setInterval(() => {
      void this.loop.runCycle();
    }, env.minCycleIntervalMs);
  }

  pause() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.store.state.running = false;
    this.store.state.mode = 'manual';
  }

  async cycle() {
    return this.loop.runCycle();
  }
}
