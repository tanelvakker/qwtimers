const DEFAULT_DEVICE_ID = "";
const DEFAULT_RELAY_ID = "";
const DEVICE_COOKIE_KEY = "qwtimers.deviceSelection";
const LOGIN_ENDPOINT = "/api/user/login";
const AUTH_STORAGE_KEY = "qwtimers.authToken";
const AUTH_REMEMBER_KEY = "qwtimers.authRemember";

const WORKMODE_OPTIONS = [
    { value: "normal", label: "Tavaolek" },
    { value: "limitexport", label: "Energia müügi piiramine võrku" },
    { value: "buy", label: "Energia ost võrgust" },
    { value: "sell", label: "Energia müük võrku" },
    { value: "nobattery", label: "Ära kasuta akut" },
    { value: "pvsell", label: "PV Sell" },
];

const WORKMODE_LABELS = WORKMODE_OPTIONS.reduce((acc, option) => {
    acc[option.value] = option.label;
    return acc;
}, {});

const state = {
    timers: [],
    selectedIds: new Set(),
    authToken: loadAuthToken(),
    deviceId: null,
    relayId: null,
    devices: [],
    deviceListLoaded: false,
};

const initialDeviceSelection = loadDeviceSelection();
state.deviceId = initialDeviceSelection.deviceId;
state.relayId = initialDeviceSelection.relayId;

const tableBody = document.querySelector("#timersTable tbody");
if (tableBody) {
    tableBody.addEventListener("click", handleTableClick);
}

async function fetchTimers() {
    if (!state.authToken) {
        showLoginModal();
        return;
    }

    const endpoint = getTimersEndpoint();
    if (!endpoint) {
        showAlert("Please select a device to load timers.", "warning");
        state.timers = [];
        state.selectedIds.clear();
        renderTable();
        updateActionButtons();
        updateMasterCheckbox();
        return;
    }

    try {
        const response = await fetch(`${endpoint}?_=${Date.now()}`, {
            headers: authHeaders(),
        });

        if (response.status === 401) {
            handleUnauthorized();
            return;
        }

        if (!response.ok) {
            throw new Error(`Failed to fetch timers (${response.status})`);
        }

        const data = await response.json();
        state.selectedIds.clear();
        state.timers = Array.isArray(data?.data) ? data.data : [];
        renderTable();
        updateActionButtons();
    } catch (err) {
        console.error(err);
        showAlert("Failed to fetch timers. Check the console for details.", "danger");
    }
}

function parseTimerDate(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === "number") {
        const date = new Date(value * 1000);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const str = `${value}`.trim();
    if (!str) {
        return null;
    }

    const numeric = Number(str);
    if (!Number.isNaN(numeric) && /^-?\d+(\.\d+)?$/.test(str)) {
        const date = new Date(numeric * 1000);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const isoCandidate = str.includes("T") ? str : str.replace(" ", "T");
    const date = new Date(isoCandidate);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
    const date = parseTimerDate(value);
    if (!date) {
        return value ?? "-";
    }

    return date.toLocaleString();
}

function renderTable() {
    const tbody = document.querySelector("#timersTable tbody");
    tbody.innerHTML = "";
    if (!Array.isArray(state.timers) || state.timers.length === 0) {
        const tr = document.createElement("tr");
        tr.innerHTML = '<td colspan="4" class="text-center text-muted">No timers found</td>';
        tbody.appendChild(tr);
        return;
    }

    state.timers.forEach(timer => {
        const tr = document.createElement("tr");
        tr.className = "timer-row";
        tr.dataset.id = timer.id;
        const checked = state.selectedIds.has(timer.id);
        tr.innerHTML = `
            <td class="text-center">
                <input type="checkbox" class="form-check-input row-checkbox" data-id="${timer.id}" ${checked ? "checked" : ""}>
            </td>
            <td><div class="period-label">${formatPeriod(timer.starts_at, timer.ends_at)}</div></td>
            <td>${renderPriceCell(timer)}</td>
            <td class="action-cell">${renderActionCell(timer)}</td>
        `;
        if (checked) {
            tr.classList.add("table-active");
        }
        if (timer.device_name) {
            tr.title = `Device: ${timer.device_name}`;
        }
        tbody.appendChild(tr);
    });

    attachRowCheckboxListeners();
}

const refreshButton = document.getElementById("refreshBtn");
const deviceSelect = document.getElementById("deviceSelect");
const reloadDevicesButton = document.getElementById("reloadDevicesBtn");
const floatingEditButton = document.getElementById("floatingEditBtn");
const clearSelectionButton = document.getElementById("clearSelectionBtn");
const logoutButton = document.getElementById("logoutBtn");
const loginForm = document.getElementById("loginForm");
const loginEmailInput = document.getElementById("loginEmail");
const loginPasswordInput = document.getElementById("loginPassword");
const loginCompanyInput = document.getElementById("loginCompany");
const loginRememberInput = document.getElementById("loginRemember");
const loginErrorBox = document.getElementById("loginError");
const loginSubmitButton = document.getElementById("loginSubmitBtn");

refreshButton?.addEventListener("click", () => {
    fetchTimers();
});

deviceSelect?.addEventListener("change", (event) => {
    const value = event.target.value;
    if (!value) {
        return;
    }

    const [deviceId, relayId] = value.split("|");
    const changed = setDeviceSelection(deviceId ?? "", relayId ?? "");

    if (changed && state.authToken) {
        fetchTimers();
    }
});

reloadDevicesButton?.addEventListener("click", () => {
    if (!state.authToken) {
        showLoginModal();
        return;
    }

    fetchDevicesList().then((selectionChanged) => {
        if (selectionChanged && state.authToken && state.deviceId && state.relayId) {
            fetchTimers();
        }
    });
});

function openEditModal() {
    if (state.selectedIds.size === 0) {
        return;
    }

    populateModalForm();
    const selectedCountEl = document.getElementById("selectedCount");
    const pluralEl = document.getElementById("selectedCountPlural");
    selectedCountEl.textContent = state.selectedIds.size;
    pluralEl.textContent = state.selectedIds.size === 1 ? "" : "s";

    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById("editModal"));
    modal.show();
}

floatingEditButton?.addEventListener("click", openEditModal);
clearSelectionButton?.addEventListener("click", () => {
    if (state.selectedIds.size === 0) {
        return;
    }

    state.selectedIds.clear();
    renderTable();
    updateMasterCheckbox();
    updateActionButtons();
});

logoutButton?.addEventListener("click", () => {
    clearAuthToken();
    showAlert("You have been logged out.", "info");
    showLoginModal();
});

document.getElementById("selectAll")?.addEventListener("change", (event) => {
    const checked = event.target.checked;
    state.selectedIds = new Set(checked ? state.timers.map((timer) => timer.id) : []);
    renderTable();
    updateMasterCheckbox();
    updateActionButtons();
});

document.getElementById("editForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.selectedIds.size === 0) {
        return;
    }

    const submitButton = document.getElementById("editSubmitBtn");
    submitButton.disabled = true;

    const payload = buildPayloadFromForm();
    const ids = Array.from(state.selectedIds);

    try {
        const responses = await Promise.all(ids.map((id) => sendPatchRequest(id, payload)));
        const failed = responses.filter((res) => !res.ok);

        if (failed.length > 0) {
            showAlert(`${failed.length} of ${ids.length} updates failed.`, "danger");
        } else {
            showAlert(`${ids.length} timeslot${ids.length === 1 ? "" : "s"} updated successfully.`, "success");
        }

        const modal = bootstrap.Modal.getInstance(document.getElementById("editModal"));
        modal?.hide();
        await fetchTimers();
    } catch (err) {
        console.error(err);
        showAlert("Unexpected error while updating timers.", "danger");
    } finally {
        submitButton.disabled = false;
    }
});

loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!loginSubmitButton) {
        return;
    }

    const email = loginEmailInput?.value?.trim() ?? "";
    const password = loginPasswordInput?.value ?? "";
    const companyRaw = loginCompanyInput?.value?.trim() ?? "";
    const rememberChoice = loginRememberInput?.checked ?? false;

    if (!email || !password) {
        showLoginError("Please enter both email and password.");
        return;
    }

    loginSubmitButton.disabled = true;
    showLoginError("");

    try {
        const payload = new URLSearchParams();
        payload.set("email", email);
        payload.set("password", password);
        payload.set("rememberme", rememberChoice ? "on" : "");
        payload.set("company", companyRaw || "");

        const response = await fetch(LOGIN_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            },
            body: payload.toString(),
        });

        let data = null;
        try {
            data = await response.json();
        } catch (jsonErr) {
            console.warn("Unable to parse login response as JSON", jsonErr);
        }

        if (!response.ok) {
            const message = data?.message || data?.error || "Login failed.";
            throw new Error(message);
        }

        if (data?.status === false) {
            const message = data?.message || "Invalid credentials.";
            throw new Error(message);
        }

        const token = extractToken(data);
        if (!token) {
            throw new Error("Login response did not include an access token.");
        }

        saveAuthToken(token, rememberChoice);
        loginForm.reset();
        if (loginRememberInput) {
            loginRememberInput.checked = rememberChoice;
        }
        hideLoginModal();
        showAlert("Login successful.", "success");
        await fetchDevicesList();
        if (state.deviceId && state.relayId) {
            await fetchTimers();
        }
    } catch (err) {
        console.error(err);
        showLoginError(err.message || "Login failed.");
    } finally {
        loginSubmitButton.disabled = false;
        if (loginPasswordInput) {
            loginPasswordInput.value = "";
        }
        if (loginRememberInput) {
            loginRememberInput.checked = rememberChoice;
        }
    }
});

initialize();

function attachRowCheckboxListeners() {
    document.querySelectorAll(".row-checkbox").forEach((checkbox) => {
        checkbox.addEventListener("change", (event) => {
            const checkboxEl = event.target;
            const id = checkboxEl.getAttribute("data-id");
            if (!id) {
                return;
            }

            const row = checkboxEl.closest("tr.timer-row");
            setRowSelection(id, checkboxEl.checked, row, checkboxEl);
        });
    });
}

function setRowSelection(id, selected, row, checkbox) {
    if (!id) {
        return;
    }

    if (selected) {
        state.selectedIds.add(id);
    } else {
        state.selectedIds.delete(id);
    }

    const targetRow = row ?? document.querySelector(`tr.timer-row[data-id="${id}"]`);
    if (targetRow) {
        targetRow.classList.toggle("table-active", selected);
    }

    if (checkbox && checkbox.checked !== selected) {
        checkbox.checked = selected;
    }

    updateMasterCheckbox();
    updateActionButtons();
}

function handleTableClick(event) {
    const row = event.target.closest("tr.timer-row");
    if (!row) {
        return;
    }

    if (event.target.closest(".row-checkbox")) {
        return;
    }

    const checkboxElem = row.querySelector(".row-checkbox");
    const id = row.dataset.id;
    if (!checkboxElem || !id) {
        return;
    }

    if (event.target.closest(".action-cell")) {
        if (!state.selectedIds.has(id)) {
            setRowSelection(id, true, row, checkboxElem);
        }
        openEditModal();
        return;
    }

    const shouldSelect = !state.selectedIds.has(id);
    setRowSelection(id, shouldSelect, row, checkboxElem);
}

function updateMasterCheckbox() {
    const masterCheckbox = document.getElementById("selectAll");
    if (!masterCheckbox) {
        return;
    }

    const total = state.timers.length;
    const selected = state.selectedIds.size;

    masterCheckbox.indeterminate = selected > 0 && selected < total;
    masterCheckbox.checked = total > 0 && selected === total;
}

function updateActionButtons() {
    const hasSelection = state.selectedIds.size > 0;

    if (floatingEditButton) {
        floatingEditButton.disabled = !hasSelection;
    }

    const selectionBar = document.getElementById("selectionBar");
    const summary = document.getElementById("selectionSummary");

    if (selectionBar && summary) {
        if (hasSelection) {
            const count = state.selectedIds.size;
            summary.textContent = `${count} timeslot${count === 1 ? "" : "s"} selected`;
            selectionBar.classList.add("show");
            selectionBar.setAttribute("aria-hidden", "false");
        } else {
            summary.textContent = "0 selected";
            selectionBar.classList.remove("show");
            selectionBar.setAttribute("aria-hidden", "true");
        }
    }
}

function populateModalForm() {
    const workmodeSelect = document.getElementById("workmodeMode");
    const powerInput = document.getElementById("powerLimitInput");
    const socInput = document.getElementById("batterySocInput");

    if (workmodeSelect && workmodeSelect.options.length === 0) {
        WORKMODE_OPTIONS.forEach((option) => {
            const opt = document.createElement("option");
            opt.value = option.value;
            opt.textContent = option.label;
            workmodeSelect.appendChild(opt);
        });
    }

    const firstSelectedTimer = state.timers.find((timer) => state.selectedIds.has(timer.id));

    if (firstSelectedTimer?.action?.WORKMODE) {
        workmodeSelect.value = firstSelectedTimer.action.WORKMODE.Mode ?? "normal";
        powerInput.value = firstSelectedTimer.action.WORKMODE.PowerLimit ?? "";
        socInput.value = firstSelectedTimer.action.WORKMODE.BatterySoc ?? "";
    } else {
        workmodeSelect.value = "normal";
        powerInput.value = "";
        socInput.value = "";
    }
}

function buildPayloadFromForm() {
    const workmodeSelect = document.getElementById("workmodeMode");
    const powerInput = document.getElementById("powerLimitInput");
    const socInput = document.getElementById("batterySocInput");

    const params = new URLSearchParams();
    params.set("workmode[Mode]", workmodeSelect.value);
    params.set("workmode[PowerLimit]", powerInput.value);
    params.set("workmode[BatterySoc]", socInput.value);

    return params;
}

async function sendPatchRequest(id, params) {
    if (!state.authToken) {
        showLoginModal();
        throw new Error("Not authenticated");
    }

    const body = new URLSearchParams(params);
    body.set("id", id);

    const endpoint = getTimersEndpoint();
    if (!endpoint) {
        throw new Error("Device ID is not set.");
    }

    const response = await fetch(endpoint, {
        method: "PATCH",
        headers: authHeaders({
            "Content-Type": "application/x-www-form-urlencoded",
        }),
        body: body.toString(),
    });

    if (response.status === 401) {
        handleUnauthorized();
    }

    return response;
}

function authHeaders(headers = {}) {
    if (state.authToken) {
        return { ...headers, Authorization: `Bearer ${state.authToken}` };
    }

    return headers;
}

function getTimersEndpoint() {
    const deviceId = (state.deviceId ?? "").trim();
    const relayId = (state.relayId ?? "").trim();
    if (!deviceId || !relayId) {
        return null;
    }

    return `/api/timer/periods/${encodeURIComponent(deviceId)}/${encodeURIComponent(relayId)}`;
}

function loadDeviceSelection() {
    try {
        const cookies = document.cookie ? document.cookie.split(";") : [];
        const match = cookies
            .map((cookie) => cookie.trim())
            .find((cookie) => cookie.startsWith(`${DEVICE_COOKIE_KEY}=`));

        if (match) {
            const value = decodeURIComponent(match.substring(DEVICE_COOKIE_KEY.length + 1));
            if (value) {
                const [deviceIdRaw, relayIdRaw] = value.split("|");
                const deviceId = (deviceIdRaw ?? "").trim();
                const relayId = (relayIdRaw ?? "").trim();

                return {
                    deviceId: deviceId || DEFAULT_DEVICE_ID,
                    relayId: relayId || DEFAULT_RELAY_ID,
                };
            }
        }
    } catch (err) {
        console.warn("Unable to load device selection from cookies", err);
    }

    return {
        deviceId: DEFAULT_DEVICE_ID,
        relayId: DEFAULT_RELAY_ID,
    };
}

function persistDeviceSelection(deviceId, relayId) {
    try {
        if (deviceId && relayId) {
            const maxAge = 60 * 60 * 24 * 30; // 30 days
            document.cookie = `${DEVICE_COOKIE_KEY}=${encodeURIComponent(`${deviceId}|${relayId}`)}; path=/; max-age=${maxAge}`;
        } else {
            document.cookie = `${DEVICE_COOKIE_KEY}=; path=/; max-age=0`;
        }
    } catch (err) {
        console.warn("Unable to persist device selection", err);
    }
}

function setDeviceSelection(deviceId, relayId) {
    const normalizedDevice = (deviceId ?? "").trim();
    const normalizedRelay = (relayId ?? "").trim();
    const prevDevice = state.deviceId ?? "";
    const prevRelay = state.relayId ?? "";

    const changed = normalizedDevice !== prevDevice || normalizedRelay !== prevRelay;

    state.deviceId = normalizedDevice;
    state.relayId = normalizedRelay;

    persistDeviceSelection(normalizedDevice, normalizedRelay);
    syncDeviceSelect();

    if (changed) {
        state.timers = [];
        state.selectedIds.clear();
        renderTable();
        updateMasterCheckbox();
        updateActionButtons();
    }

    return changed;
}

function syncDeviceSelect() {
    if (!deviceSelect) {
        return;
    }

    const value = state.deviceId && state.relayId ? `${state.deviceId}|${state.relayId}` : "";
    if (deviceSelect.value !== value) {
        const exists = Array.from(deviceSelect.options).some((option) => option.value === value);
        if (exists || value === "") {
            deviceSelect.value = value;
        }
    }
}

function parseDevicesFromHtml(html) {
    if (!html || typeof html !== "string") {
        return [];
    }

    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const anchors = Array.from(doc.querySelectorAll('a[href^="/devices/"]'));
        const seen = new Set();
        const devices = [];

        anchors.forEach((anchor) => {
            const href = anchor.getAttribute("href") ?? "";
            const match = href.match(/^\/devices\/([^/]+)\/([^/?#]+)/);
            if (!match) {
                return;
            }

            const deviceId = decodeURIComponent(match[1]);
            const relayId = decodeURIComponent(match[2]);
            const key = `${deviceId}|${relayId}`;
            if (!deviceId || !relayId || seen.has(key)) {
                return;
            }

            const name = (anchor.textContent || "").replace(/\s+/g, " ").trim() || deviceId;
            devices.push({ deviceId, relayId, name });
            seen.add(key);
        });

        return devices;
    } catch (err) {
        console.warn("Unable to parse devices HTML", err);
        return [];
    }
}

function updateDeviceSelectOptions({ loading = false } = {}) {
    if (!deviceSelect) {
        return;
    }

    deviceSelect.innerHTML = "";

    if (loading) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "Loading devices…";
        option.disabled = true;
        option.selected = true;
        deviceSelect.appendChild(option);
        deviceSelect.disabled = true;
        return;
    }

    if (!state.authToken) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "Sign in to load devices";
        option.disabled = true;
        option.selected = true;
        deviceSelect.appendChild(option);
        deviceSelect.disabled = true;
        return;
    }

    if (!state.deviceListLoaded) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "Loading devices…";
        option.disabled = true;
        option.selected = true;
        deviceSelect.appendChild(option);
        deviceSelect.disabled = true;
        return;
    }

    if (!Array.isArray(state.devices) || state.devices.length === 0) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "No devices found";
        option.disabled = true;
        option.selected = true;
        deviceSelect.appendChild(option);
        deviceSelect.disabled = true;
        return;
    }

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select a device";
    placeholder.disabled = true;
    placeholder.hidden = true;
    deviceSelect.appendChild(placeholder);

    state.devices.forEach((device) => {
        const option = document.createElement("option");
        option.value = `${device.deviceId}|${device.relayId}`;
        option.textContent = device.relayId ? `${device.name} (${device.relayId})` : device.name;
        deviceSelect.appendChild(option);
    });

    deviceSelect.disabled = false;
    syncDeviceSelect();
}

async function fetchDevicesList() {
    if (!state.authToken) {
        showLoginModal();
        return false;
    }

    updateDeviceSelectOptions({ loading: true });

    try {
        const response = await fetch("/devices", {
            headers: authHeaders({
                Accept: "text/html",
            }),
        });

        if (response.status === 401) {
            handleUnauthorized();
            return false;
        }

        if (!response.ok) {
            throw new Error(`Failed to load devices (${response.status})`);
        }

        const html = await response.text();
        const devices = parseDevicesFromHtml(html);

        state.devices = devices;
        state.deviceListLoaded = true;
        updateDeviceSelectOptions();

        let selectionChanged = false;
        if (devices.length > 0) {
            const exists = devices.some(
                (device) =>
                    device.deviceId === (state.deviceId ?? "") &&
                    device.relayId === (state.relayId ?? "")
            );

            if (!exists) {
                const first = devices[0];
                selectionChanged = setDeviceSelection(first.deviceId, first.relayId);
            }
        } else {
            selectionChanged = setDeviceSelection("", "");
            showAlert("No devices were found for your account.", "warning");
        }

        return selectionChanged;
    } catch (err) {
        console.error(err);
        showAlert("Failed to load devices list. Check the console for details.", "danger");
        updateDeviceSelectOptions();
        return false;
    }
}

function loadAuthToken() {
    try {
        const remember = localStorage.getItem(AUTH_REMEMBER_KEY) === "1";
        if (remember) {
            return localStorage.getItem(AUTH_STORAGE_KEY) ?? null;
        }

        const sessionToken = sessionStorage.getItem(AUTH_STORAGE_KEY);
        if (!sessionToken) {
            localStorage.removeItem(AUTH_STORAGE_KEY);
        }
        return sessionToken;
    } catch (err) {
        console.warn("Unable to load auth token from storage", err);
        return null;
    }
}

function saveAuthToken(token, remember) {
    state.authToken = token;

    try {
        if (remember) {
            localStorage.setItem(AUTH_STORAGE_KEY, token);
            localStorage.setItem(AUTH_REMEMBER_KEY, "1");
            sessionStorage.removeItem(AUTH_STORAGE_KEY);
        } else {
            sessionStorage.setItem(AUTH_STORAGE_KEY, token);
            localStorage.removeItem(AUTH_STORAGE_KEY);
            localStorage.removeItem(AUTH_REMEMBER_KEY);
        }
    } catch (err) {
        console.warn("Unable to persist auth token", err);
    }

    updateAuthUI();
}

function clearAuthToken() {
    state.authToken = null;
    try {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        localStorage.removeItem(AUTH_REMEMBER_KEY);
        sessionStorage.removeItem(AUTH_STORAGE_KEY);
    } catch (err) {
        console.warn("Unable to clear auth token", err);
    }

    state.devices = [];
    state.deviceListLoaded = false;
    const selectionChanged = setDeviceSelection("", "");
    if (!selectionChanged) {
        state.timers = [];
        state.selectedIds.clear();
        renderTable();
        updateMasterCheckbox();
        updateActionButtons();
    }
    updateAuthUI();
}

function handleUnauthorized() {
    clearAuthToken();
    showLoginError("");
    showAlert("Your session has expired. Please log in again.", "warning");
    showLoginModal();
}

function showLoginModal() {
    const modalElement = document.getElementById("loginModal");
    if (!modalElement) {
        return;
    }

    const modal = bootstrap.Modal.getOrCreateInstance(modalElement, {
        backdrop: "static",
        keyboard: false,
    });

    showLoginError("");
    modal.show();

    setTimeout(() => {
        loginEmailInput?.focus();
    }, 150);
}

function hideLoginModal() {
    const modalElement = document.getElementById("loginModal");
    if (!modalElement) {
        return;
    }

    const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
    modal.hide();
}

function showLoginError(message) {
    if (!loginErrorBox) {
        return;
    }

    if (message) {
        loginErrorBox.textContent = message;
        loginErrorBox.classList.remove("d-none");
    } else {
        loginErrorBox.textContent = "";
        loginErrorBox.classList.add("d-none");
    }
}

function extractToken(payload) {
    if (!payload) {
        return null;
    }

    if (typeof payload === "string") {
        return payload;
    }

    return (
        payload.token ||
        payload.access_token ||
        payload.jwt ||
        payload?.data?.token ||
        payload?.data?.access_token ||
        payload?.data?.jwt ||
        null
    );
}

function updateAuthUI() {
    if (refreshButton) {
        refreshButton.disabled = !state.authToken;
    }

    if (logoutButton) {
        if (state.authToken) {
            logoutButton.classList.remove("d-none");
        } else {
            logoutButton.classList.add("d-none");
        }
    }

    if (reloadDevicesButton) {
        reloadDevicesButton.disabled = !state.authToken;
    }

    if (deviceSelect) {
        if (!state.authToken) {
            updateDeviceSelectOptions();
        } else if (!deviceSelect.options.length || !state.deviceListLoaded) {
            updateDeviceSelectOptions();
        } else {
            deviceSelect.disabled = !state.devices.length;
        }
    }

    if (loginRememberInput) {
        const remembered = localStorage.getItem(AUTH_REMEMBER_KEY) === "1";
        loginRememberInput.checked = remembered;
    }
}

function initialize() {
    updateAuthUI();
    updateDeviceSelectOptions();
    syncDeviceSelect();

    if (state.authToken) {
        loadInitialData();
    } else {
        showLoginModal();
    }
}

async function loadInitialData() {
    try {
        await fetchDevicesList();
        if (state.authToken && state.deviceId && state.relayId) {
            await fetchTimers();
        }
    } catch (err) {
        console.error("Failed to initialize data", err);
    }
}

function showAlert(message, variant = "info") {
    const container = document.getElementById("alertPlaceholder");
    if (!container) {
        return;
    }

    const alert = document.createElement("div");
    alert.className = `alert alert-${variant} alert-dismissible fade show`;
    alert.role = "alert";
    alert.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    container.appendChild(alert);

    setTimeout(() => {
        const bsAlert = bootstrap.Alert.getOrCreateInstance(alert);
        bsAlert.close();
    }, 5000);
}

function formatPeriod(startsAt, endsAt) {
    const start = parseTimerDate(startsAt);
    const end = parseTimerDate(endsAt);

    if (!start && !end) {
        return "-";
    }

    if (!start) {
        return formatDate(end);
    }

    if (!end) {
        return formatDate(start);
    }

    const startDay = `${pad2(start.getDate())}.${pad2(start.getMonth() + 1)}`;
    const endDay = `${pad2(end.getDate())}.${pad2(end.getMonth() + 1)}`;
    const startTime = `${pad2(start.getHours())}:${pad2(start.getMinutes())}`;
    const endTime = `${pad2(end.getHours())}:${pad2(end.getMinutes())}`;
    const sameDay = startDay === endDay && start.getFullYear() === end.getFullYear();

    return sameDay
        ? `${startDay} ${startTime} - ${endTime}`
        : `${startDay} ${startTime} - ${endDay} ${endTime}`;
}

function renderPriceCell(timer) {
    const importPrice = formatCurrency(timer.import_price, timer.unit);
    const exportPrice = formatCurrency(timer.export_price, timer.unit);

    return `
        <div class="price-card">
            <div class="price-line"><span class="price-icon text-success">⬇︎</span>${importPrice}</div>
            <div class="price-line"><span class="price-icon text-danger">⬆︎</span>${exportPrice}</div>
        </div>
    `;
}

function renderActionCell(timer) {
    const workmode = timer?.action?.WORKMODE;

    if (!workmode) {
        return '<div class="text-muted">-</div>';
    }

    const modeLabel = WORKMODE_LABELS[workmode.Mode] || (workmode.Mode ? capitalize(workmode.Mode) : "-");
    const power = workmode.PowerLimit ?? "-";
    const soc = workmode.BatterySoc ?? "-";

    return `
        <div class="action-card">
            <div class="action-mode">${modeLabel}</div>
            <div class="action-metric"><span class="action-icon">⚡</span>${formatPower(power)}</div>
            <div class="action-metric"><span class="action-icon">🔋</span>${formatSoc(soc)}</div>
        </div>
    `;
}

function formatCurrency(value, unit = "") {
    if (value === null || value === undefined || value === "") {
        return "-";
    }

    const num = Number(value);
    let formatted = `${value}`;

    if (!Number.isNaN(num)) {
        formatted = num.toFixed(3).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
    }

    const suffix = unit ? unit.trim() : "";
    return suffix ? `${formatted}${suffix}` : formatted;
}

function formatPower(value) {
    if (value === null || value === undefined || value === "") {
        return "-";
    }

    const num = Number(value);
    return Number.isNaN(num) ? value : `${num} W`;
}

function formatSoc(value) {
    if (value === null || value === undefined || value === "") {
        return "-";
    }

    const num = Number(value);
    return Number.isNaN(num) ? value : `${num}%`;
}

function pad2(value) {
    return String(value).padStart(2, "0");
}

function capitalize(str) {
    if (!str || typeof str !== "string") {
        return str;
    }

    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
