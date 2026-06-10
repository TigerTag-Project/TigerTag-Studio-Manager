/**
 * renderer/cam/cam-preload.js
 *
 * Dedicated IPC bridge for the detached camera window.
 * Kept intentionally minimal — no inventory, no RFID, no Firebase.
 */
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('camAPI', {
  /** Called once after the window loads — receives the initial camera list. */
  onInit: (cb) =>
    ipcRenderer.on('cam:init', (_, cameras) => cb(cameras)),

  /** Called when the main window pushes an updated camera list (online state changed). */
  onUpdate: (cb) =>
    ipcRenderer.on('cam:update', (_, cameras) => cb(cameras)),

  /** Bambu Lab JPEG frames forwarded from the main process.
   *  cb(key: string, b64: string) */
  onBambuFrame: (cb) =>
    ipcRenderer.on('bambulab:cam-frame', (_, key, b64) => cb(key, b64)),

  /** Anycubic JPEG frames (ffmpeg FLV remux) forwarded from the main process.
   *  cb(key: string, b64: string) */
  onAcuFrame: (cb) =>
    ipcRenderer.on('anycubic:cam-frame', (_, key, b64) => cb(key, b64)),
});
