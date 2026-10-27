/*
 * Codec preference patch.
 *
 * The v2 SDK has no documented codec option, so the only way to steer codec negotiation is to call
 * RTCRtpTransceiver.setCodecPreferences() before the SDK creates its offer or answer. This wraps
 * RTCPeerConnection.prototype.createOffer/createAnswer for that purpose. It is page-level,
 * undocumented behaviour: nothing here is a SignalWire API.
 *
 * The patch only acts when the selection differs from the browser's full capability list; with
 * every codec selected (the default) the browser negotiates exactly as it would without this file.
 *
 * Adapted from https://github.com/lpradovera/network-testing with two changes: the original
 * `_createOffer.apply(this, options)` dropped the SDK's offer options (apply expects an array),
 * and the original forced VP8 for video regardless of the UI.
 */
(function () {
    'use strict';

    const KINDS = ['audio', 'video'];

    function capabilityMimeTypes(kind) {
        const caps = RTCRtpSender.getCapabilities ? RTCRtpSender.getCapabilities(kind) : null;
        return caps ? caps.codecs.map((c) => c.mimeType) : [];
    }

    function uniqueMimeTypes(kind) {
        return Array.from(new Set(capabilityMimeTypes(kind)));
    }

    function sameSet(a, b) {
        if (a.length !== b.length) return false;
        const setB = new Set(b);
        return a.every((x) => setB.has(x));
    }

    function transceiverFor(pc, kind) {
        return pc.getTransceivers().find((t) => {
            const track = t.sender.track || t.receiver.track;
            return track && track.kind === kind;
        });
    }

    function applyPreferences(pc, wanted, log) {
        KINDS.forEach((kind) => {
            const selection = wanted[kind];
            if (!Array.isArray(selection)) return;
            const all = uniqueMimeTypes(kind);
            if (selection.length === 0 || sameSet(selection, all)) return; // default negotiation

            const transceiver = transceiverFor(pc, kind);
            if (!transceiver || typeof transceiver.setCodecPreferences !== 'function') {
                log('warn', `codecs: no ${kind} transceiver to apply preferences to`);
                return;
            }
            const sendCodecs = RTCRtpSender.getCapabilities(kind).codecs;
            const recvCodecs = RTCRtpReceiver.getCapabilities(kind).codecs;
            const chosen = [];
            const seen = new Set();
            [...sendCodecs, ...recvCodecs].forEach((codec) => {
                const key = `${codec.mimeType}|${codec.clockRate}|${codec.channels || ''}|${codec.sdpFmtpLine || ''}`;
                if (selection.includes(codec.mimeType) && !seen.has(key)) {
                    seen.add(key);
                    chosen.push(codec);
                }
            });
            try {
                transceiver.setCodecPreferences(chosen);
                log(
                    'info',
                    `codecs: ${kind} preferences applied`,
                    chosen.map((c) => c.mimeType),
                );
            } catch (error) {
                log('error', `codecs: setCodecPreferences failed for ${kind}: ${error.message}`);
            }
        });
    }

    let installed = false;

    /**
     * Install the patch once.
     * @param {() => {audio: string[], video: string[]}} getWanted returns the selected mime types
     * @param {(level: string, message: string, data?: unknown) => void} [log]
     */
    function install(getWanted, log = () => {}) {
        if (installed || typeof RTCPeerConnection === 'undefined') return;
        installed = true;
        const origOffer = RTCPeerConnection.prototype.createOffer;
        const origAnswer = RTCPeerConnection.prototype.createAnswer;

        RTCPeerConnection.prototype.createOffer = function (...args) {
            try {
                applyPreferences(this, getWanted(), log);
            } catch (error) {
                log('error', `codecs: offer patch error: ${error.message}`);
            }
            return origOffer.apply(this, args);
        };
        RTCPeerConnection.prototype.createAnswer = function (...args) {
            try {
                applyPreferences(this, getWanted(), log);
            } catch (error) {
                log('error', `codecs: answer patch error: ${error.message}`);
            }
            return origAnswer.apply(this, args);
        };
    }

    window.CodecPrefs = { install, uniqueMimeTypes };
})();
