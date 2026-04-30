import type { AppState } from "../../types";
import type { WindowSpec } from "../manager";
import type { PortalResponseEnvelope, ShowMenuEnvelope } from "./types";

export const portalSpec: WindowSpec<
  AppState,
  ShowMenuEnvelope,
  PortalResponseEnvelope
> = {
  label: "portal",
  url: "/portal.html",
  options: {
    transparent: true,
    decorations: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    width: 1,
    height: 1,
    resizable: false,
    shadow: false,
    focus: false,
  },
  desired: (state) =>
    state.portal
      ? {
          visible: true,
          payload: {
            requestId: state.portal.requestId,
            ...state.portal.request,
          },
        }
      : { visible: false },
  // The bridge separately listens for portal:response to resolve the
  // showMenu() promise. We dispatch portal.close so the reducer state
  // tracks the dismiss. Stale-id mismatches are filtered by the reducer.
  onResponse: (envelope) => ({
    type: "portal.close",
    requestId: envelope.requestId,
  }),
  // The portal host measures content offscreen and reveals itself; if the
  // manager called show() immediately we'd see the 1×1 dot.
  selfShows: true,
};
