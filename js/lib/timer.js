/**
 * Rest and interval timers.
 * Time comes from absolute timestamps (Date.now), so backgrounding the app or
 * locking the screen cannot drift the count — which matters a lot on Android.
 */

let ctx = null;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** Short beep. Web audio only unlocks after the first user gesture — expected. */
export function beep(freq = 880, ms = 160, gainVal = 0.25) {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, ac.currentTime);
  gain.gain.linearRampToValueAtTime(gainVal, ac.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + ms / 1000);
  osc.connect(gain).connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + ms / 1000 + 0.02);
}

export function beepDone() {
  beep(660, 140);
  setTimeout(() => beep(880, 180), 160);
  setTimeout(() => beep(1180, 260), 340);
}

export function vibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

/** Unlock the audio context on the first user gesture. */
export function primeAudio() {
  const ac = audio();
  if (ac && ac.state === 'suspended') ac.resume();
}

/**
 * Controllable timer with pause and add-time — used for rest between sets.
 *
 * @param {number} seconds full length of the rest
 * @param {{startAt?:number, paused?:boolean, sound?:boolean, vibrate?:boolean,
 *          onTick?:Function, onDone?:Function, onChange?:Function}} opts
 *   `startAt` / `paused` restore a timer that was already running before the app
 *   was backgrounded. `onChange` fires whenever the deadline moves, so the
 *   caller can write it somewhere that survives the process being killed.
 */
export function restTimer(seconds, opts = {}) {
  let left = Math.max(0, opts.startAt ?? seconds);
  let handle = null;
  let running = false;
  let lastStamp = 0;

  const tick = () => {
    const now = Date.now();
    const elapsed = Math.floor((now - lastStamp) / 1000);
    if (elapsed >= 1) {
      lastStamp += elapsed * 1000;
      left = Math.max(0, left - elapsed);
      opts.onTick?.(left);
      if (left <= 3 && left > 0) {
        if (opts.sound) beep(700, 90, 0.18);
        if (opts.vibrate) vibrate(40);
      }
      if (left === 0) {
        stop();
        if (opts.sound) beepDone();
        if (opts.vibrate) vibrate([120, 80, 120, 80, 220]);
        opts.onChange?.(api);
        opts.onDone?.();
        return;
      }
    }
    handle = setTimeout(tick, 150);
    handle?.unref?.();
  };

  function start() {
    if (running) return;
    running = true;
    lastStamp = Date.now();
    handle = setTimeout(tick, 150);
    handle?.unref?.();
  }
  function stop() {
    running = false;
    clearTimeout(handle);
  }

  const api = {
    start,
    stop,
    toggle() {
      running ? stop() : start();
      opts.onTick?.(left);
      opts.onChange?.(api);
      return running;
    },
    add(sec) {
      left = Math.max(0, left + sec);
      opts.onTick?.(left);
      opts.onChange?.(api);
    },
    skip() {
      stop();
      left = 0;
      opts.onTick?.(0);
      opts.onChange?.(api);
      opts.onDone?.();
    },
    get total() {
      return seconds;
    },
    get left() {
      return left;
    },
    get running() {
      return running;
    },
  };

  if (!opts.paused) start();
  opts.onChange?.(api);

  return api;
}

/** Keep the screen awake during a workout (Android Chrome supports this). */
let wakeLock = null;

export async function keepAwake(on) {
  try {
    if (on) {
      if (!('wakeLock' in navigator) || wakeLock) return;
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
    } else if (wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {
    /* unsupported or denied — not critical */
  }
}

// The wake lock is dropped when the app is backgrounded — re-acquire on return.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && document.body.dataset.session === 'active') {
    keepAwake(true);
  }
});
