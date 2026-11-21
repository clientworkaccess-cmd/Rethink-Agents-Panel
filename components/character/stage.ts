// A Pixi Application bound to a DOM element: resizes with it, pauses while the browser tab is hidden
// (and while scrolled out of view), and tears down cleanly. Shared by every scene.
import { Application } from "pixi.js";

export type Stage = { app: Application; destroy: () => void };

export async function createStage(host: HTMLElement): Promise<Stage> {
  const app = new Application();
  await app.init({
    resizeTo: host,
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(2, window.devicePixelRatio || 1),
    preference: "webgl",
  });
  host.appendChild(app.canvas);
  app.canvas.style.display = "block";
  app.canvas.style.touchAction = "none";

  let visible = true;
  const sync = () => {
    if (document.hidden || !visible) app.ticker.stop();
    else app.ticker.start();
  };
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    sync();
  });
  io.observe(host);
  document.addEventListener("visibilitychange", sync);
  // Pixi's resizeTo only follows window resizes; the host also changes size when the sidebar collapses or
  // expands. Observed before any scene observer, so scenes re-fit against the new size.
  const ro = new ResizeObserver(() => app.resize());
  ro.observe(host);

  return {
    app,
    destroy: () => {
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      app.destroy(true, { children: true });
    },
  };
}
