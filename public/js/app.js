/*
 * SignalWire Browser SDK v2 example: page logic for the `Relay` client.
 *
 * Every SDK call here is documented at:
 *   Relay client  https://signalwire.com/docs/browser-sdk/v2/js/reference/relay-client
 *   Call          https://signalwire.com/docs/browser-sdk/v2/js/reference/call
 *   Notifications https://signalwire.com/docs/browser-sdk/v2/js/reference/notification
 *
 * Comments tagged `RC:` quote the Relay client reference; `CALL:` quotes the Call reference.
 */
(() => {
    'use strict';

    const config = JSON.parse(document.getElementById('app-config').textContent);
    const PREFIX = 'relay.example.';
    const ENDED = new Set(['hangup', 'destroy', 'purge']);
    const LIVE_CONTROLS = new Set(['active', 'held']);
    const CLIENT_EVENTS = [
        'signalwire.ready',
        'signalwire.error',
        'signalwire.notification',
        'signalwire.socket.open',
        'signalwire.socket.close',
        'signalwire.socket.error',
        'signalwire.socket.message',
    ];

    const state = {
        client: null,
        call: null, // outbound or answered call (kept through 'hangup' so the cause can be shown)
        incoming: null, // a ringing or recovering call waiting for answer/decline
        connection: 'disconnected', // disconnected | connecting | connected | reconnecting
        userDisconnect: false,
        jwtExp: null,
        expiryTimer: null,
        debug: false,
        log: [],
        remote: { name: '', number: '' },
        lastCall: null,
        rejections: new Map(), // call id -> { method, message, cause, causeCode, code } from a refused verto request
    };

    const el = {};
    const ids = [
        'connectForm',
        'project',
        'resource',
        'durationSwitch',
        'durationWrap',
        'durationBox',
        'autoRefresh',
        'btnConnect',
        'btnDisconnect',
        'connectStatus',
        'token',
        'tokenCopy',
        'tokenExpiry',
        'permStatus',
        'btnPermissions',
        'micSelect',
        'camSelect',
        'speakerSelect',
        'speakerNote',
        'refreshDevices',
        'applyDevices',
        'iceMode',
        'iceCustomWrap',
        'iceCustom',
        'audioCodecs',
        'videoCodecs',
        'localVideo',
        'remoteVideo',
        'number',
        'numberError',
        'numberFrom',
        'audio',
        'video',
        'startCall',
        'hangupCall',
        'callStatus',
        'callDetail',
        'incoming',
        'incomingTitle',
        'incomingName',
        'incomingNumber',
        'btnAnswer',
        'btnDecline',
        'controls',
        'btnMute',
        'btnDeaf',
        'btnHold',
        'btnCamera',
        'dtmfKeys',
        'eventLog',
        'clearLog',
        'copySummary',
        'debugToggle',
        'sdkBadge',
        'toastContainer',
        'themeToggle',
    ];

    // ---------- utilities ----------

    const store = {
        get: (key, fallback = '') => {
            try {
                const v = localStorage.getItem(PREFIX + key);
                return v === null ? fallback : v;
            } catch {
                return fallback;
            }
        },
        set: (key, value) => {
            try {
                localStorage.setItem(PREFIX + key, value);
            } catch {
                /* storage blocked: settings just don't persist */
            }
        },
    };

    function stamp() {
        return new Date().toISOString().slice(11, 23);
    }

    function safeJson(value, max = 2000) {
        const seen = new WeakSet();
        let out;
        try {
            out = JSON.stringify(value, (key, v) => {
                if (typeof v === 'object' && v !== null) {
                    if (seen.has(v)) return '[circular]';
                    seen.add(v);
                    if (v instanceof MediaStream || v instanceof HTMLElement) return `[${v.constructor.name}]`;
                }
                if (typeof v === 'function') return undefined;
                return v;
            });
        } catch (error) {
            out = `[unserializable: ${error.message}]`;
        }
        return out && out.length > max ? `${out.slice(0, max)}…` : out;
    }

    function log(level, message, data) {
        const entry = { time: stamp(), level, message, data: data === undefined ? undefined : safeJson(data) };
        state.log.push(entry);
        if (state.log.length > 300) state.log.shift();
        const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
        console[method](`[example ${entry.time}] ${message}`, data === undefined ? '' : data);

        const li = document.createElement('li');
        li.dataset.level = level;
        const time = document.createElement('time');
        time.textContent = entry.time;
        li.append(time, message + (entry.data !== undefined ? ` ${entry.data}` : ''));
        el.eventLog.append(li);
        while (el.eventLog.children.length > 300) el.eventLog.firstChild.remove();
        el.eventLog.scrollTop = el.eventLog.scrollHeight;
    }

    function toast(message, intent = 'info') {
        const wrapper = document.createElement('div');
        wrapper.className = 'toast';
        wrapper.setAttribute('role', intent === 'error' ? 'alert' : 'status');
        wrapper.setAttribute('aria-live', intent === 'error' ? 'assertive' : 'polite');
        wrapper.setAttribute('aria-atomic', 'true');
        const body = document.createElement('div');
        body.className = 'sw-callout';
        body.dataset.intent = intent;
        const text = document.createElement('span');
        text.textContent = message;
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'btn-close';
        close.setAttribute('aria-label', 'Close');
        close.dataset.bsDismiss = 'toast';
        body.append(text, close);
        wrapper.append(body);
        el.toastContainer.append(wrapper);
        const instance = new bootstrap.Toast(wrapper, { delay: intent === 'error' ? 8000 : 4000 });
        wrapper.addEventListener('hidden.bs.toast', () => wrapper.remove());
        instance.show();
    }

    async function api(url, options = {}) {
        const response = await fetch(url, { credentials: 'same-origin', ...options });
        let data = {};
        try {
            data = await response.json();
        } catch {
            /* non-JSON body */
        }
        if (!response.ok) {
            const parts = [data.error || response.statusText || 'request failed'];
            if (data.upstream_status) parts.push(`(SignalWire returned ${data.upstream_status})`);
            else parts.push(`(HTTP ${response.status})`);
            throw new Error(parts.join(' '));
        }
        return data;
    }

    function selectedValues(select) {
        return Array.from(select.selectedOptions).map((o) => o.value);
    }

    function fillSelect(select, devices, storedKey) {
        const previous = select.value || store.get(storedKey);
        select.replaceChildren();
        devices.forEach((device, index) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `${select.dataset.kindLabel} ${index + 1}`;
            select.append(option);
        });
        if (previous && Array.from(select.options).some((o) => o.value === previous)) select.value = previous;
        select.disabled = devices.length === 0;
    }

    function labelFor(select) {
        const option = select.selectedOptions[0];
        return option ? option.textContent : '';
    }

    // ---------- settings persistence (text/select by value, checkbox by checked) ----------

    function saveSetting(event) {
        const input = event.target;
        const key = input.name || input.id;
        if (!key) return;
        store.set(key, input.type === 'checkbox' ? (input.checked ? '1' : '0') : input.value);
    }

    function loadSettings() {
        [
            'resource',
            'number',
            'numberFrom',
            'durationBox',
            'iceMode',
            'iceCustom',
            'micSelect',
            'camSelect',
            'speakerSelect',
        ].forEach((key) => {
            const saved = store.get(key, null);
            if (saved !== null && el[key]) el[key].value = saved;
        });
        const savedProject = store.get('project', null);
        el.project.value = savedProject || config.project || '';
        ['audio', 'video', 'autoRefresh', 'durationSwitch', 'debugToggle'].forEach((key) => {
            const saved = store.get(key, null);
            if (saved !== null) el[key].checked = saved === '1';
        });
        state.debug = el.debugToggle.checked;
        el.durationWrap.hidden = !el.durationSwitch.checked;
        el.iceCustomWrap.hidden = el.iceMode.value !== 'custom';
    }

    // ---------- JWT handling ----------

    function decodeExp(jwt) {
        try {
            const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
            return typeof payload.exp === 'number' ? payload.exp : null;
        } catch {
            return null;
        }
    }

    function setToken(jwt) {
        el.token.value = jwt || '';
        state.jwtExp = jwt ? decodeExp(jwt) : null;
        renderExpiry();
    }

    function renderExpiry() {
        if (!state.jwtExp) {
            el.tokenExpiry.textContent = el.token.value ? 'Expiry unknown' : 'No token yet';
            return;
        }
        const remaining = Math.round(state.jwtExp - Date.now() / 1000);
        if (remaining <= 0) {
            el.tokenExpiry.textContent = 'JWT expired';
            return;
        }
        const m = Math.floor(remaining / 60);
        const s = String(remaining % 60).padStart(2, '0');
        el.tokenExpiry.textContent = `JWT expires in ${m}:${s}`;
    }

    async function refreshJwt() {
        const duration = el.durationSwitch.checked ? el.durationBox.value.trim() : '';
        const data = await api('/jwt_refresh', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(duration ? { duration } : {}),
        });
        setToken(data.jwt_token);
        await state.client.refreshToken(data.jwt_token); // RC: refreshToken(token)
        log('info', 'JWT refreshed and applied to the session');
        toast('JWT refreshed', 'success');
    }

    // ---------- connection ----------

    function setConnection(status, text) {
        state.connection = status;
        el.connectStatus.dataset.state = status;
        el.connectStatus.textContent = text;
        render();
    }

    async function onConnectSubmit(event) {
        event.preventDefault();
        if (state.connection !== 'disconnected') return;
        const project = el.project.value.trim();
        const resource = el.resource.value.trim();
        el.project.classList.toggle('is-invalid', !project);
        el.resource.classList.toggle('is-invalid', !resource);
        if (!project || !resource) return;

        setConnection('connecting', 'Requesting JWT…');
        try {
            const body = new URLSearchParams({ verto_resource_box: resource });
            if (el.durationSwitch.checked && el.durationBox.value.trim())
                body.set('jwt_duration', el.durationBox.value.trim());
            const data = await api('/token_handler', { method: 'POST', body });
            setToken(data.jwt_token);
            log('info', `JWT generated for resource "${resource}" (${data.expires_in_minutes} min)`);
            toast('JWT generated', 'success');
            await connect(project, data.jwt_token);
        } catch (error) {
            log('error', `Token request failed: ${error.message}`);
            toast(`Token request failed: ${error.message}`, 'error');
            setConnection('disconnected', 'Not connected');
        }
    }

    function detachClient() {
        if (!state.client) return;
        CLIENT_EVENTS.forEach((name) => state.client.off(name)); // RC: off(event) removes all handlers
        state.client = null;
    }

    async function connect(project, token) {
        detachClient();
        state.userDisconnect = false;
        state.call = null;
        state.incoming = null;

        const client = new Relay({ project, token }); // RC: constructor
        state.client = client;
        client.localElement = 'localVideo';
        client.remoteElement = 'remoteVideo';
        if (el.audio.checked) client.enableMicrophone();
        else client.disableMicrophone();
        if (el.video.checked) client.enableWebcam();
        else client.disableWebcam();

        client
            .on('signalwire.ready', onReady)
            .on('signalwire.error', onClientError)
            .on('signalwire.socket.open', () => log('info', 'socket open'))
            .on('signalwire.socket.close', onSocketClose)
            .on('signalwire.socket.error', (event) => log('error', 'socket error', event && event.type))
            .on('signalwire.notification', onNotification);
        if (state.debug) client.on('signalwire.socket.message', onSocketMessage);
        watchVertoErrors(client);

        setConnection('connecting', 'Connecting…');
        log('info', `connecting to Relay with SDK ${config.sdkVersion} (${config.sdkMode})`);
        try {
            await client.connect(); // RC: connect()
        } catch (error) {
            onClientError(error);
        }
    }

    /*
     * Surface why SignalWire refused a verto request (invite, bye, modify).
     *
     * When SignalWire rejects an invite, the SDK only passes the error to its own logger and hangs the
     * call up with the default cause NORMAL_CLEARING (16), so the real reason never reaches the page.
     * Replies to the SDK's own requests don't go through `signalwire.socket.message` either. The only
     * place the page can see them is the client's `execute`, which every verto request passes through.
     * `execute` is in the SDK's typings (SignalWire.d.ts) but not in the v2 docs: this is an
     * undocumented hook for diagnostics, and it never changes what the SDK sends or does.
     */
    function watchVertoErrors(client) {
        const original = client.execute;
        if (typeof original !== 'function') return;
        client.execute = function (message) {
            const pending = original.call(this, message);
            const request = message && message.request;
            const method = request && request.method;
            if (
                typeof method === 'string' &&
                method.startsWith('verto.') &&
                pending &&
                typeof pending.catch === 'function'
            ) {
                const callId = request.params?.dialogParams?.callID;
                pending.catch((error) => recordVertoError(method, callId, error));
            }
            return pending;
        };
    }

    function recordVertoError(method, callId, error) {
        const detail = {
            method,
            message: error?.message || 'unknown error',
            cause: error?.cause,
            causeCode: error?.causeCode,
            code: error?.code,
        };
        const short = callId ? callId.slice(0, 8) : '?';
        const reason = `${detail.message}${detail.cause ? ` (${detail.cause}, ${detail.causeCode})` : ''}${detail.code ? ` code ${detail.code}` : ''}`;
        if (method === 'verto.bye' && callId && state.rejections.has(callId)) {
            // Expected after a refused invite: the call was never set up, so there is nothing to hang up.
            log('info', `call ${short}: ${method} refused as expected after the rejected invite: ${reason}`);
            return;
        }
        if (callId) state.rejections.set(callId, detail);
        log('error', `call ${short}: SignalWire refused ${method}: ${reason}`);
    }

    async function onReady() {
        log('info', 'signalwire.ready');
        setConnection('connected', 'Connected');
        await populateDevices();
        await applyDeviceDefaults();
        checkPermissions();
    }

    function onClientError(error) {
        const message = (error && (error.message || error.error || error.code)) || safeJson(error) || 'unknown error';
        log('error', `signalwire.error: ${message}`, error);
        toast(`SignalWire error: ${message}`, 'error');
        if (state.connection === 'connecting') setConnection('disconnected', 'Not connected');
    }

    function onSocketClose(event) {
        log('warn', 'socket close', event && { code: event.code, reason: event.reason });
        if (state.userDisconnect) {
            setConnection('disconnected', 'Not connected');
        } else if (state.client && state.client.expired) {
            // RC: expired
            setConnection('disconnected', 'JWT expired');
            toast('The JWT expired and the session closed. Generate a new token to reconnect.', 'warning');
        } else {
            // The SDK retries the socket on its own (observed in the SDK source; not a documented contract).
            setConnection('reconnecting', 'Reconnecting…');
        }
    }

    function onSocketMessage(message) {
        log('info', 'socket message', message);
    }

    async function disconnect() {
        if (!state.client) return;
        state.userDisconnect = true;
        setConnection('connecting', 'Disconnecting…');
        try {
            await state.client.disconnect(); // RC: disconnect()
        } catch (error) {
            log('warn', `disconnect error: ${error.message}`);
        }
        state.call = null;
        state.incoming = null;
        detachClient();
        setConnection('disconnected', 'Not connected');
        renderCall(null);
    }

    // ---------- notifications ----------

    function onNotification(notification) {
        switch (notification.type) {
            case 'callUpdate':
                onCallUpdate(notification.call);
                break;
            case 'participantData':
                state.remote = { name: notification.displayName || '', number: notification.displayNumber || '' };
                log(
                    'info',
                    `participantData: ${state.remote.name} <${state.remote.number}> ${notification.displayDirection}`,
                );
                renderIncoming();
                renderCall(notification.call);
                break;
            case 'userMediaError':
                log(
                    'error',
                    'userMediaError',
                    notification.error && (notification.error.message || notification.error.name),
                );
                toast(
                    `Microphone/camera error: ${notification.error?.message || notification.error?.name || 'permission denied'}. Check the Audio/Video switches and browser permissions.`,
                    'error',
                );
                break;
            case 'refreshToken':
                log('warn', 'refreshToken notification: JWT is about to expire');
                if (el.autoRefresh.checked) {
                    refreshJwt().catch((error) => {
                        log('error', `JWT refresh failed: ${error.message}`);
                        toast(`JWT refresh failed: ${error.message}`, 'error');
                    });
                } else {
                    toast('JWT is about to expire and auto-refresh is off', 'warning');
                }
                break;
            default:
                log('info', `notification ${notification.type}`, notification);
        }
    }

    function onCallUpdate(call) {
        const detail = call.causeCode ? ` cause=${call.cause} (${call.causeCode})` : '';
        // `direction` is only set once the SDK starts the offer or answer, so it is empty at 'new'.
        const direction = call.direction ? ` ${call.direction}` : '';
        log('info', `call ${call.id.slice(0, 8)}${direction}: ${call.prevState} -> ${call.state}${detail}`);

        switch (call.state) {
            case 'ringing': // CALL: someone is calling you
                if (call.direction === 'inbound') {
                    state.incoming = call;
                    el.incomingTitle.textContent = 'Incoming call';
                }
                break;
            case 'recovering': // CALL: call recovering after a page refresh
                state.incoming = call;
                el.incomingTitle.textContent = 'Recover the previous call?';
                break;
            case 'new':
            case 'requesting':
            case 'trying':
            case 'early':
            case 'answering':
            case 'active':
            case 'held':
                if (state.incoming === call) state.incoming = null;
                state.call = call;
                state.lastCall = call; // kept after 'destroy' so Copy call summary still has it
                break;
            case 'hangup':
                if (state.incoming === call) state.incoming = null;
                if (state.call === call) {
                    const rejected = state.rejections.get(call.id);
                    if (rejected) {
                        toast(
                            `SignalWire rejected the call: ${rejected.message}${rejected.cause ? ` (${rejected.cause}, ${rejected.causeCode})` : ''}. The SDK reports it as ${call.cause} (${call.causeCode}).`,
                            'error',
                        );
                    } else {
                        toast(
                            `Call ended: ${call.cause || 'unknown'} (${call.causeCode || '?'})`,
                            call.causeCode === 16 ? 'info' : 'warning',
                        );
                    }
                }
                break;
            case 'destroy':
            case 'purge':
                if (state.incoming === call) state.incoming = null;
                if (state.call === call) state.call = null;
                break;
            default:
                log('warn', `unhandled call state ${call.state}`);
        }
        if (state.call === call || !state.call) renderCall(call);
        render();
    }

    // ---------- calls ----------

    function iceOption() {
        switch (el.iceMode.value) {
            case 'none':
                return [];
            case 'custom': {
                const urls = el.iceCustom.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);
                const bad = urls.filter((u) => !/^(stun|turn|turns):/.test(u));
                if (!urls.length || bad.length) {
                    throw new Error(
                        `Custom ICE list must be comma-separated stun:/turn:/turns: URLs${bad.length ? ` (bad: ${bad.join(', ')})` : ''}`,
                    );
                }
                return [{ urls }];
            }
            default:
                return undefined; // platform default: the list the server hands the SDK on connect
        }
    }

    function deviceParams() {
        const params = {};
        if (el.audio.checked && el.micSelect.value) params.micId = el.micSelect.value;
        if (el.video.checked && el.camSelect.value) params.camId = el.camSelect.value;
        if (el.speakerSelect.value && !el.speakerSelect.disabled) params.speakerId = el.speakerSelect.value;
        return params;
    }

    async function makeCall() {
        if (!state.client || state.connection !== 'connected') {
            toast('Connect first', 'warning');
            return;
        }
        const destination = el.number.value.trim();
        el.number.classList.toggle('is-invalid', !destination);
        el.numberError.textContent = destination ? '' : 'Enter a destination number or resource name';
        if (!destination) return;

        let ice;
        try {
            ice = iceOption();
        } catch (error) {
            toast(error.message, 'error');
            return;
        }

        const params = {
            destinationNumber: destination, // RC: newCall options
            audio: el.audio.checked,
            // A boolean, not a constraints object: with camId set, the SDK writes deviceId into the object
            // it is given, and that object is sent to SignalWire as part of the invite's dialogParams.
            video: el.video.checked,
            ...deviceParams(), // micId / camId / speakerId: the SDK strips these from the invite
        };
        const from = el.numberFrom.value.trim();
        if (from) params.callerNumber = from;
        if (ice !== undefined) params.iceServers = ice;

        state.remote = { name: '', number: destination };
        log('info', 'newCall', { ...params, iceServers: ice === undefined ? 'platform default' : ice });
        el.startCall.disabled = true;
        try {
            state.call = await state.client.newCall(params); // RC: newCall(options) -> Promise<Call>
        } catch (error) {
            log('error', `newCall failed: ${error.message}`);
            toast(`Call failed: ${error.message}`, 'error');
        }
        render();
    }

    function hangup() {
        const call = state.call;
        if (call && !ENDED.has(call.state)) call.hangup(); // CALL: hangup()
    }

    function answerIncoming() {
        const call = state.incoming;
        if (!call) return;
        log('info', `answering ${call.state} call ${call.id.slice(0, 8)}`);
        call.answer(); // CALL: answer()
        state.call = call;
        state.incoming = null;
        render();
    }

    function declineIncoming() {
        const call = state.incoming;
        if (!call) return;
        log('info', `declining ${call.state} call ${call.id.slice(0, 8)}`);
        call.hangup();
        state.incoming = null;
        render();
    }

    function liveCall() {
        const call = state.call;
        return call && !ENDED.has(call.state) ? call : null;
    }

    function track(stream, kind) {
        if (!stream || typeof stream.getTracks !== 'function') return null;
        return stream.getTracks().find((t) => t.kind === kind) || null;
    }

    function toggleMute() {
        const call = liveCall();
        if (!call) return;
        call.toggleAudioMute(); // CALL: toggleAudioMute()
        render();
    }

    function toggleDeaf() {
        const call = liveCall();
        if (!call) return;
        const remoteAudio = track(call.remoteStream, 'audio');
        if (remoteAudio && !remoteAudio.enabled) call.undeaf();
        else call.deaf(); // CALL: deaf() / undeaf()
        render();
    }

    async function toggleHold() {
        const call = liveCall();
        if (!call) return;
        try {
            if (call.state === 'held') await call.unhold();
            else await call.hold(); // CALL: hold() / unhold()
        } catch (error) {
            log('error', `hold/unhold failed: ${error.message}`);
            toast(`Hold failed: ${error.message}`, 'error');
        }
        render();
    }

    function toggleCamera() {
        const call = liveCall();
        if (!call) return;
        call.toggleVideoMute(); // CALL: toggleVideoMute()
        render();
    }

    function sendDtmf(event) {
        const key = event.target.closest('[data-dtmf]');
        const call = liveCall();
        if (!key || !call) return;
        call.dtmf(key.dataset.dtmf); // CALL: dtmf(string)
        log('info', `DTMF ${key.dataset.dtmf}`);
    }

    // ---------- devices and permissions ----------

    async function populateDevices() {
        const client = state.client;
        if (!client) return;
        try {
            const [mics, cams, speakers] = await Promise.all([
                client.getAudioInDevices(), // RC
                client.getVideoDevices(), // RC
                client.getAudioOutDevices(), // RC
            ]);
            fillSelect(el.micSelect, mics, 'micSelect');
            fillSelect(el.camSelect, cams, 'camSelect');
            fillSelect(el.speakerSelect, speakers, 'speakerSelect');
            const sinkSupported = 'setSinkId' in HTMLMediaElement.prototype;
            el.speakerSelect.disabled = el.speakerSelect.disabled || !sinkSupported;
            el.speakerNote.hidden = sinkSupported;
            log('info', `devices: ${mics.length} mic, ${cams.length} camera, ${speakers.length} speaker`);
        } catch (error) {
            log('error', `device enumeration failed: ${error.message}`);
        }
        render();
    }

    // The chosen microphone and camera go to newCall as micId / camId (see deviceParams), which the SDK
    // uses to open the devices and strips before sending the call invite. setAudioSettings /
    // setVideoSettings are not used here because they also store micLabel / camLabel on the client,
    // and the SDK copies both into every call invite. Passing the devices per call keeps the invite
    // to the call's own details.
    function applyDeviceDefaults() {
        const client = state.client;
        if (!client) return;
        if (el.speakerSelect.value && !el.speakerSelect.disabled) client.speaker = el.speakerSelect.value; // RC: speaker
    }

    async function applyDevicesToCall() {
        const call = liveCall();
        if (!call) return;
        try {
            if (el.micSelect.value) await call.setAudioInDevice(el.micSelect.value); // CALL
            if (el.camSelect.value && track(call.localStream, 'video')) await call.setVideoDevice(el.camSelect.value); // CALL
            if (el.speakerSelect.value && !el.speakerSelect.disabled) {
                const ok = await call.setAudioOutDevice(el.speakerSelect.value); // CALL: false when setSinkId is unsupported
                if (ok === false) toast('This browser cannot switch the speaker (no setSinkId)', 'warning');
            }
            log('info', 'devices applied to the live call', deviceParams());
            toast('Devices applied', 'success');
        } catch (error) {
            log('error', `device switch failed: ${error.message}`);
            toast(`Device switch failed: ${error.message}`, 'error');
        }
    }

    async function checkPermissions() {
        const client = state.client;
        if (!client) {
            el.permStatus.textContent = 'Connect to check';
            el.permStatus.dataset.state = '';
            return;
        }
        const wantAudio = el.audio.checked;
        const wantVideo = el.video.checked;
        el.permStatus.textContent = 'Checking…';
        el.permStatus.dataset.state = 'connecting';
        const ok = await client.checkPermissions(wantAudio, wantVideo); // RC: checkPermissions(audio, video)
        el.permStatus.textContent = ok ? 'Microphone/camera permission granted' : 'Permission missing or device busy';
        el.permStatus.dataset.state = ok ? 'connected' : 'error';
        log(ok ? 'info' : 'warn', `checkPermissions(audio=${wantAudio}, video=${wantVideo}) -> ${ok}`);
        if (ok) populateDevices(); // labels become available once permission exists
    }

    // ---------- rendering ----------

    function render() {
        const connected = state.connection === 'connected';
        const busy = state.connection === 'connecting';
        const call = liveCall();
        const controlsVisible = !!call && LIVE_CONTROLS.has(call.state);

        el.btnConnect.hidden = state.connection !== 'disconnected' && !busy;
        el.btnConnect.disabled = busy;
        el.btnDisconnect.hidden = state.connection === 'disconnected' || busy;
        ['project', 'resource', 'durationSwitch', 'durationBox'].forEach((id) => {
            el[id].readOnly = state.connection !== 'disconnected';
        });

        el.startCall.hidden = !!call;
        el.startCall.disabled = !connected || !!state.incoming;
        el.hangupCall.hidden = !call;

        el.controls.hidden = !controlsVisible;
        el.dtmfKeys.hidden = !controlsVisible;
        el.applyDevices.disabled = !call;
        el.btnPermissions.disabled = !state.client || state.connection !== 'connected';

        if (call) {
            const localAudio = track(call.localStream, 'audio');
            const localVideo = track(call.localStream, 'video');
            const remoteAudio = track(call.remoteStream, 'audio');
            setPressed(el.btnMute, !!localAudio && !localAudio.enabled, 'Unmute', 'Mute');
            el.btnMute.disabled = !localAudio;
            setPressed(el.btnDeaf, !!remoteAudio && !remoteAudio.enabled, 'Undeaf', 'Deaf');
            el.btnDeaf.disabled = !remoteAudio;
            setPressed(el.btnHold, call.state === 'held', 'Unhold', 'Hold');
            setPressed(el.btnCamera, !!localVideo && !localVideo.enabled, 'Camera on', 'Camera off');
            el.btnCamera.disabled = !localVideo;
        }
        renderIncoming();
    }

    function setPressed(button, pressed, onLabel, offLabel) {
        button.setAttribute('aria-pressed', String(pressed));
        button.textContent = pressed ? onLabel : offLabel;
    }

    function renderIncoming() {
        const call = state.incoming;
        el.incoming.hidden = !call;
        if (!call) return;
        el.incomingName.textContent = state.remote.name || call.options?.remoteCallerName || 'Unknown caller';
        el.incomingNumber.textContent = state.remote.number || call.options?.remoteCallerNumber || '';
    }

    function renderCall(call) {
        if (!call) {
            el.callStatus.dataset.state = 'idle';
            el.callStatus.textContent = 'No call';
            el.callDetail.replaceChildren();
            return;
        }
        el.callStatus.dataset.state = call.state;
        const stateText = ENDED.has(call.state) ? `ended (${call.state})` : call.state;
        el.callStatus.textContent = call.direction ? `${call.direction} · ${stateText}` : stateText;
        const rows = [
            ['Call ID', call.id],
            ['Remote', [state.remote.name, state.remote.number].filter(Boolean).join(' ') || '-'],
            ['Previous state', call.prevState || '-'],
        ];
        const rejected = state.rejections.get(call.id);
        if (rejected) {
            rows.push([
                'Rejected by SignalWire',
                `${rejected.method}: ${rejected.message}${rejected.cause ? ` (${rejected.cause}, ${rejected.causeCode})` : ''}`,
            ]);
        }
        if (call.causeCode) rows.push(['Cause', `${call.cause} (${call.causeCode})`]);
        el.callDetail.replaceChildren(
            ...rows.flatMap(([k, v]) => {
                const dt = document.createElement('dt');
                dt.textContent = k;
                const dd = document.createElement('dd');
                dd.textContent = v;
                return [dt, dd];
            }),
        );
    }

    function summary() {
        const call = state.call || state.lastCall;
        const rejected = call && state.rejections.get(call.id);
        return [
            `SignalWire Browser SDK v2 example summary (${new Date().toISOString()})`,
            `SDK: ${config.sdkVersion} (${config.sdkMode}); browser: ${navigator.userAgent}`,
            `Connection: ${state.connection}; JWT expiry: ${el.tokenExpiry.textContent}`,
            `Call: ${call ? `${call.id} ${call.direction || '-'} state=${call.state} prev=${call.prevState} cause=${call.cause || '-'} (${call.causeCode || '-'})` : 'none'}`,
            `Rejected by SignalWire: ${rejected ? `${rejected.method}: ${rejected.message}${rejected.cause ? ` (${rejected.cause}, ${rejected.causeCode})` : ''}` : '-'}`,
            `Destination: ${el.number.value.trim() || '-'}; caller number: ${el.numberFrom.value.trim() || '-'}`,
            `Audio: ${el.audio.checked}; video: ${el.video.checked}; ICE: ${el.iceMode.value}${el.iceMode.value === 'custom' ? ` ${el.iceCustom.value}` : ''}`,
            `Audio codecs: ${selectedValues(el.audioCodecs).join(', ') || 'default'}`,
            `Video codecs: ${selectedValues(el.videoCodecs).join(', ') || 'default'}`,
            `Devices: mic=${labelFor(el.micSelect) || '-'}; camera=${labelFor(el.camSelect) || '-'}; speaker=${labelFor(el.speakerSelect) || '-'}`,
            '',
            'Last events:',
            ...state.log
                .slice(-40)
                .map((e) => `${e.time} ${e.level.padEnd(5)} ${e.message}${e.data !== undefined ? ` ${e.data}` : ''}`),
        ].join('\n');
    }

    async function copy(text, label) {
        try {
            await navigator.clipboard.writeText(text);
            toast(`${label} copied`, 'success');
        } catch {
            toast('Clipboard unavailable; select the text and copy it manually', 'warning');
        }
    }

    // ---------- codecs ----------

    function fillCodecs(select, kind) {
        const saved = store.get(select.id, null);
        const savedList = saved ? saved.split(',') : null;
        CodecPrefs.uniqueMimeTypes(kind).forEach((mime) => {
            const option = document.createElement('option');
            option.value = mime;
            option.textContent = mime;
            option.selected = savedList ? savedList.includes(mime) : true;
            select.append(option);
        });
        select.addEventListener('change', () => store.set(select.id, selectedValues(select).join(',')));
    }

    // ---------- theme ----------

    const THEME_CHOICES = ['system', 'light', 'dark'];
    const darkMedia = window.matchMedia('(prefers-color-scheme: dark)');

    function applyTheme() {
        const choice = store.get('theme', 'system');
        const dark = choice === 'dark' || (choice === 'system' && darkMedia.matches);
        document.documentElement.dataset.bsTheme = dark ? 'dark' : 'light';
        el.themeToggle.querySelectorAll('[data-theme-choice]').forEach((button) => {
            button.setAttribute('aria-pressed', String(button.dataset.themeChoice === choice));
        });
    }

    function syncTheme() {
        if (!THEME_CHOICES.includes(store.get('theme', 'system'))) store.set('theme', 'system');
        applyTheme();
        darkMedia.addEventListener('change', applyTheme);
        el.themeToggle.addEventListener('click', (event) => {
            const button = event.target.closest('[data-theme-choice]');
            if (!button) return;
            store.set('theme', button.dataset.themeChoice);
            applyTheme();
        });
    }

    // ---------- init ----------

    function init() {
        ids.forEach((id) => {
            el[id] = document.getElementById(id);
        });
        syncTheme();
        el.sdkBadge.textContent = `SDK ${config.sdkVersion} · ${config.sdkMode === 'local' ? 'local bundle' : 'CDN'}`;

        if (typeof Relay === 'undefined') {
            toast('The SignalWire SDK did not load. Check the network tab and SDK_VERSION.', 'error');
            log('error', 'window.Relay is undefined; the SDK script did not load');
        } else if (Relay.VERSION && Relay.VERSION !== config.sdkVersion) {
            log('warn', `loaded SDK reports VERSION ${Relay.VERSION}, page expected ${config.sdkVersion}`);
        }

        fillCodecs(el.audioCodecs, 'audio');
        fillCodecs(el.videoCodecs, 'video');
        CodecPrefs.install(
            () => ({ audio: selectedValues(el.audioCodecs), video: selectedValues(el.videoCodecs) }),
            log,
        );

        loadSettings();

        document.querySelectorAll('[data-persist]').forEach((input) => input.addEventListener('change', saveSetting));
        el.connectForm.addEventListener('submit', onConnectSubmit);
        el.btnDisconnect.addEventListener('click', disconnect);
        el.durationSwitch.addEventListener('change', () => {
            el.durationWrap.hidden = !el.durationSwitch.checked;
            if (!el.durationSwitch.checked) el.durationBox.value = '';
        });
        el.iceMode.addEventListener('change', () => {
            el.iceCustomWrap.hidden = el.iceMode.value !== 'custom';
        });
        el.tokenCopy.addEventListener('click', () => el.token.value && copy(el.token.value, 'JWT'));
        el.startCall.addEventListener('click', makeCall);
        el.hangupCall.addEventListener('click', hangup);
        el.btnAnswer.addEventListener('click', answerIncoming);
        el.btnDecline.addEventListener('click', declineIncoming);
        el.btnMute.addEventListener('click', toggleMute);
        el.btnDeaf.addEventListener('click', toggleDeaf);
        el.btnHold.addEventListener('click', toggleHold);
        el.btnCamera.addEventListener('click', toggleCamera);
        el.dtmfKeys.addEventListener('click', sendDtmf);
        el.refreshDevices.addEventListener('click', populateDevices);
        el.applyDevices.addEventListener('click', applyDevicesToCall);
        el.btnPermissions.addEventListener('click', checkPermissions);
        ['micSelect', 'camSelect', 'speakerSelect'].forEach((id) =>
            el[id].addEventListener('change', applyDeviceDefaults),
        );
        ['audio', 'video'].forEach((id) =>
            el[id].addEventListener('change', () => {
                if (!state.client) return;
                if (el.audio.checked) state.client.enableMicrophone();
                else state.client.disableMicrophone(); // RC
                if (el.video.checked) state.client.enableWebcam();
                else state.client.disableWebcam(); // RC
                applyDeviceDefaults();
            }),
        );
        el.number.addEventListener('input', () => {
            el.number.classList.remove('is-invalid');
            el.numberError.textContent = '';
        });
        el.clearLog.addEventListener('click', () => {
            state.log = [];
            el.eventLog.replaceChildren();
        });
        el.copySummary.addEventListener('click', () => copy(summary(), 'Call summary'));
        el.debugToggle.addEventListener('change', () => {
            state.debug = el.debugToggle.checked;
            if (!state.client) return;
            state.client.off('signalwire.socket.message');
            if (state.debug) state.client.on('signalwire.socket.message', onSocketMessage); // RC: signalwire.socket.message
        });
        if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
            navigator.mediaDevices.addEventListener('devicechange', () => {
                log('info', 'devicechange: refreshing device lists');
                populateDevices();
            });
        }

        state.expiryTimer = setInterval(renderExpiry, 1000);
        setConnection('disconnected', 'Not connected');
        renderCall(null);
        checkPermissions();
        log('info', `page ready; SDK ${config.sdkVersion} (${config.sdkMode})`);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
