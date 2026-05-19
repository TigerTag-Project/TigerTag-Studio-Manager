/**
 * flashforge/cam_mux.js — FlashForge MJPEG mux (delegates to cam_manager).
 *
 * FlashForge mjpg-streamer allows only ONE concurrent HTTP client.
 * cam_manager owns the single connection, the MJPEG parser, the blob: URL
 * fan-out, and the 2-second grace period on last-consumer-leave.
 *
 * This module re-exports a FlashForge-named API so inventory.js callers
 * need no changes.
 *
 * Public API (unchanged):
 *   ffgMuxStart(key, url)
 *   ffgMuxStop(key)
 *   ffgMuxStopAll()
 *   ffgMuxRestart(key, url)
 *   ffgMuxRegister(key, imgEl)
 *   ffgMuxUnregister(key, imgEl)
 */

import { camStart, camStop, camStopAll, camRestart, camSubscribe, camUnsubscribe } from '../cam_manager.js';

export const ffgMuxStart      = camStart;
export const ffgMuxStop       = camStop;
export const ffgMuxStopAll    = camStopAll;
export const ffgMuxRestart    = camRestart;
export const ffgMuxRegister   = camSubscribe;
export const ffgMuxUnregister = camUnsubscribe;
