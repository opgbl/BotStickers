'use strict';

const { execFile } = require('child_process');
const { AsyncLocalStorage } = require('async_hooks');
const logger = require('./logger');

const MAX_CONCURRENT = Number(process.env.FFMPEG_MAX_CONCURRENT) || 3;
const MAX_WAITING = 30;

const state = global.__ffmpegQueue || (global.__ffmpegQueue = { active: 0, waiting: [] });
const priority = new AsyncLocalStorage();

const runWithPriority = (fn) => priority.run(true, fn);
const hasPriority = () => priority.getStore() === true;

class FfmpegBusyError extends Error {
  constructor() {
    super('cola de ffmpeg llena');
    this.userMsg = 'El bot está procesando muchos archivos ahora mismo. Intenta en un momento.';
  }
}

function acquire() {
  return new Promise((resolve, reject) => {
    const grant = () => {
      state.active++;
      let released = false;
      resolve(() => {
        if (released) return;
        released = true;
        state.active--;
        const next = state.waiting.shift();
        if (next) next.grant();
      });
    };
    if (state.active < MAX_CONCURRENT) return grant();
    if (hasPriority()) {
      const i = state.waiting.findIndex((w) => !w.urgent);
      state.waiting.splice(i < 0 ? state.waiting.length : i, 0, { grant, urgent: true });
      return;
    }
    if (state.waiting.length >= MAX_WAITING) return reject(new FfmpegBusyError());
    state.waiting.push({ grant, urgent: false });
    if (state.waiting.length % 5 === 0) {
      logger.info(`[ffmpegQueue] ${state.waiting.length} trabajos en espera (${state.active} activos).`);
    }
  });
}

function execFfmpeg(file, args, options, callback) {
  if (typeof options === 'function') { callback = options; options = {}; }
  acquire().then((release) => {
    try {
      execFile(file, args, options, (...res) => {
        release();
        callback?.(...res);
      });
    } catch (err) {
      release();
      callback?.(err, '', '');
    }
  }, (err) => callback?.(err, '', ''));
}

const CAPABILITY_ARGS = new Set(['-filters', '-codecs', '-encoders', '-formats']);

function installFluentFfmpegQueue() {
  let FfmpegCommand;
  try { FfmpegCommand = require('fluent-ffmpeg'); } catch { return; }
  const proto = FfmpegCommand?.prototype;
  if (!proto?._spawnFfmpeg || proto._spawnFfmpeg.__queued) return;

  const original = proto._spawnFfmpeg;

  const queued = function (args, options, processCB, endCB) {
    if (typeof options === 'function') { endCB = processCB; processCB = options; options = {}; }
    if (typeof endCB === 'undefined') { endCB = processCB; processCB = function () {}; }
    if (CAPABILITY_ARGS.has(args?.[0])) return original.call(this, args, options, processCB, endCB);

    acquire().then((release) => {
      try {
        original.call(this, args, options, processCB, (...res) => {
          release();
          endCB(...res);
        });
      } catch (err) {
        release();
        endCB(err);
      }
    }, (err) => endCB(err));
  };
  queued.__queued = true;
  proto._spawnFfmpeg = queued;
}

module.exports = { execFfmpeg, installFluentFfmpegQueue, FfmpegBusyError, runWithPriority, hasPriority };
