import { create } from "zustand";

interface BrowserState {
  // URL of the page the browser tool has confirmed it is showing. Only ever
  // set from a BrowserObservation (never from the agent's requested URL), so
  // a non-empty value means a page really loaded — even with no screenshot.
  url: string;
  // Base64-encoded screenshot of the browser window, when the tool provides
  // one. The browser-use tool only attaches it on request, so this is
  // usually empty even when `url` is set.
  screenshotSrc: string;
}

interface BrowserStore extends BrowserState {
  /**
   * Commit the URL the browser reports it is showing. Moving to a different
   * URL drops the current screenshot: it was taken on the previous page, and
   * the tool only attaches a new one on request, so keeping it would pair
   * the old page's image with the new address bar. Callers that have a
   * fresh screenshot must set the URL first and the screenshot second.
   */
  setUrl: (url: string) => void;
  setScreenshotSrc: (screenshotSrc: string) => void;
  reset: () => void;
}

const initialState: BrowserState = {
  url: "",
  screenshotSrc: "",
};

export const useBrowserStore = create<BrowserStore>((set) => ({
  ...initialState,
  setUrl: (url: string) =>
    set((state) => (state.url === url ? { url } : { url, screenshotSrc: "" })),
  setScreenshotSrc: (screenshotSrc: string) => set({ screenshotSrc }),
  reset: () => set(initialState),
}));
