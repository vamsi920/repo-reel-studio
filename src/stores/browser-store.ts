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
  setUrl: (url: string) => set({ url }),
  setScreenshotSrc: (screenshotSrc: string) => set({ screenshotSrc }),
  reset: () => set(initialState),
}));
