document.addEventListener("DOMContentLoaded", function () {

    /* =========================
       ELEMEN
    ========================= */
    const $ = (id) => document.getElementById(id);

    const durationInput = $("duration");
    const inputWrapper = $("inputWrapper");
    const timerDisplay = $("timer");
    const progressBar = $("progressBar");

    const startBtn = $("startBtn");
    const pauseBtn = $("pauseBtn");
    const resetBtn = $("resetBtn");

    const errorMessage = $("errorMessage");
    const statusText = $("status");
    const loading = $("loading");
    const toast = $("toast");

    const totalSessionsEl = $("totalSessions");
    const totalMinutesEl = $("totalMinutes");
    const historyList = $("historyList");
    const clearHistoryBtn = $("clearHistoryBtn");

    const soundToggle = $("soundToggle");
    const volumeRange = $("volumeRange");
    const darkToggle = $("darkToggle");
    const testSoundBtn = $("testSoundBtn");

    const EMPTY_STATUS = "Belum ada sesi belajar. Yuk mulai belajar! 📚";

    /* =========================
       STATE
    ========================= */
    let tickInterval = null;
    let rafId = null;
    let isRunning = false;
    let isStarting = false;

    let totalSeconds = 0;      // durasi sesi (detik)
    let remainingMs = 0;       // sisa waktu saat tidak berjalan
    let endTime = 0;           // waktu selesai saat berjalan
    let initialMinutes = 0;

    let stats = { totalSessions: 0, totalMinutes: 0, history: [] };

    const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const prefersReducedMotion = () => reduceMotionQuery.matches;

    /* =========================
       PENYIMPANAN (localStorage)
    ========================= */
    function safeGet(key) {
        try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
    }
    function safeSet(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* abaikan */ }
    }

    function loadStats() {
        const saved = safeGet("timerStats");
        if (saved && Array.isArray(saved.history)) {
            stats = {
                totalSessions: Number(saved.totalSessions) || 0,
                totalMinutes: Number(saved.totalMinutes) || 0,
                history: saved.history
            };
        }
    }

    function loadSettings() {
        const s = safeGet("timerSettings");
        if (!s) return;
        if (typeof s.sound === "boolean") soundToggle.checked = s.sound;
        if (typeof s.volume === "number") volumeRange.value = s.volume;
        if (typeof s.dark === "boolean") darkToggle.checked = s.dark;
    }

    function saveSettings() {
        safeSet("timerSettings", {
            sound: soundToggle.checked,
            volume: parseFloat(volumeRange.value),
            dark: darkToggle.checked
        });
    }

    function applyTheme() {
        document.documentElement.setAttribute("data-theme", darkToggle.checked ? "dark" : "light");
    }

    /* =========================
       AUDIO (dibuat lewat Web Audio, tanpa file)
    ========================= */
    let audioCtx = null;

    function getAudioContext() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return audioCtx;
    }

    function playBeepSound(frequency = 440, duration = 0.15, type = "sine") {
        if (!soundToggle.checked) return;
        try {
            const ctx = getAudioContext();
            if (ctx.state === "suspended") ctx.resume();

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const volume = Math.max(0.0001, parseFloat(volumeRange.value));

            osc.type = type;
            osc.frequency.value = frequency;
            gain.gain.setValueAtTime(volume, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + duration);
        } catch (e) {
            console.log("Audio info:", e);
        }
    }

    function playClickSound() {
        playBeepSound(600, 0.08, "triangle");
    }

    function playAlarmSound() {
        playBeepSound(880, 0.3, "sine");
        setTimeout(() => playBeepSound(880, 0.3, "sine"), 300);
        setTimeout(() => playBeepSound(1046.5, 0.5, "sine"), 600);
    }

    /* =========================
       ANIMASI
    ========================= */

    // Animasi 1 (transisi state): pindah halaman
    function animateScreenIn(el) {
        if (prefersReducedMotion()) return;
        el.animate(
            [
                { opacity: 0, transform: "translateY(12px)" },
                { opacity: 1, transform: "translateY(0)" }
            ],
            { duration: 250, easing: "ease-out" }
        );
    }

    // Animasi 2 (umpan balik aksi): input salah bergetar
    function shake(el) {
        if (prefersReducedMotion() || !el) return;
        el.animate(
            [
                { transform: "translateX(0)" },
                { transform: "translateX(-8px)" },
                { transform: "translateX(8px)" },
                { transform: "translateX(-6px)" },
                { transform: "translateX(6px)" },
                { transform: "translateX(0)" }
            ],
            { duration: 350, easing: "ease-in-out" }
        );
    }

    // Toast muncul dan hilang
    let toastTimer = null;
    function showToast(message) {
        toast.textContent = message;
        toast.classList.remove("hidden");
        if (!prefersReducedMotion()) {
            toast.animate(
                [
                    { opacity: 0, transform: "translate(-50%, 16px)" },
                    { opacity: 1, transform: "translate(-50%, 0)" }
                ],
                { duration: 250, easing: "ease-out" }
            );
        }
        clearTimeout(toastTimer);
        toastTimer = setTimeout(hideToast, 3000);
    }

    function hideToast() {
        if (toast.classList.contains("hidden")) return;
        if (prefersReducedMotion()) {
            toast.classList.add("hidden");
            return;
        }
        const anim = toast.animate(
            [
                { opacity: 1, transform: "translate(-50%, 0)" },
                { opacity: 0, transform: "translate(-50%, 16px)" }
            ],
            { duration: 200, easing: "ease-in" }
        );
        anim.onfinish = () => toast.classList.add("hidden");
    }

    // Progress bar bergerak (requestAnimationFrame, hanya transform)
    function setProgress(fraction) {
        const f = Math.min(1, Math.max(0, fraction));
        progressBar.style.transform = "scaleX(" + f + ")";
    }

    function currentFraction() {
        if (totalSeconds <= 0) return 0;
        const total = totalSeconds * 1000;
        return 1 - getRemainingMs() / total;
    }

    function progressLoop() {
        setProgress(currentFraction());
        if (isRunning) rafId = requestAnimationFrame(progressLoop);
    }

    function startProgressLoop() {
        cancelAnimationFrame(rafId);
        if (prefersReducedMotion()) {
            setProgress(currentFraction()); // tanpa gerak halus, cukup update tiap detik
            return;
        }
        rafId = requestAnimationFrame(progressLoop);
    }

    function stopProgressLoop() {
        cancelAnimationFrame(rafId);
        rafId = null;
    }

    /* =========================
       NAVIGASI 3 HALAMAN
    ========================= */
    function switchScreen(targetId) {
        const targetScreen = $(targetId);
        if (!targetScreen) return;

        document.querySelectorAll(".nav-btn").forEach((btn) => {
            const active = btn.dataset.target === targetId;
            btn.classList.toggle("active", active);
            if (active) btn.setAttribute("aria-current", "page");
            else btn.removeAttribute("aria-current");
        });

        document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
        targetScreen.classList.add("active");
        animateScreenIn(targetScreen);

        if (targetId === "screen-stats") updateStatsUI();
    }

    document.querySelectorAll(".nav-btn").forEach((btn) => {
        btn.addEventListener("click", function () {
            playClickSound();
            switchScreen(btn.dataset.target);
        });
    });

    /* =========================
       VALIDASI
    ========================= */
    function showError(message) {
        errorMessage.textContent = message;
        inputWrapper.classList.add("invalid");
        statusText.textContent = "Periksa kembali durasi belajar kamu.";
        statusText.className = "status paused";
    }

    function clearError() {
        errorMessage.textContent = "";
        inputWrapper.classList.remove("invalid");
    }

    function validateInput() {
        const value = durationInput.value.trim();

        if (value === "") {
            showError("⚠️ Yuk, masukkan durasi belajar terlebih dahulu.");
            return false;
        }
        if (isNaN(value) || Number(value) <= 0) {
            showError("⚠️ Durasi harus berupa angka lebih dari 0.");
            return false;
        }
        if (Number(value) > 180) {
            showError("⚠️ Durasi maksimal adalah 180 menit.");
            return false;
        }
        clearError();
        return true;
    }

    /* =========================
       LOGIKA TIMER
    ========================= */
    function getRemainingMs() {
        return isRunning ? Math.max(0, endTime - Date.now()) : remainingMs;
    }

    function updateTimerDisplay() {
        const secs = Math.ceil(getRemainingMs() / 1000);
        const m = String(Math.floor(secs / 60)).padStart(2, "0");
        const s = String(secs % 60).padStart(2, "0");
        timerDisplay.textContent = m + ":" + s;
    }

    function showLoading() {
        loading.classList.remove("hidden");
        startBtn.disabled = true;
        pauseBtn.disabled = true;
    }

    function hideLoading() {
        loading.classList.add("hidden");
    }

    function startTimer() {
        if (isRunning) return;

        isRunning = true;
        endTime = Date.now() + remainingMs;

        startBtn.disabled = true;
        pauseBtn.disabled = false;

        statusText.textContent = "🔥 Sesi belajar sedang berlangsung. Tetap fokus!";
        statusText.className = "status running";

        updateTimerDisplay();
        startProgressLoop();

        clearInterval(tickInterval);
        tickInterval = setInterval(function () {
            updateTimerDisplay();
            if (prefersReducedMotion()) setProgress(currentFraction());
            if (getRemainingMs() <= 0) finishTimer();
        }, 250);
    }

    function pauseTimer() {
        if (!isRunning) return;
        remainingMs = getRemainingMs();
        isRunning = false;
        clearInterval(tickInterval);
        stopProgressLoop();

        statusText.textContent = "⏸ Timer dijeda. Kamu bisa melanjutkannya kembali.";
        statusText.className = "status paused";

        startBtn.disabled = false;
        pauseBtn.disabled = true;
    }

    function resetTimer() {
        clearInterval(tickInterval);
        stopProgressLoop();
        tickInterval = null;
        isRunning = false;
        isStarting = false;
        remainingMs = 0;
        totalSeconds = 0;

        durationInput.value = "";
        timerDisplay.textContent = "00:00";
        setProgress(0);
        clearError();

        statusText.textContent = EMPTY_STATUS;
        statusText.className = "status empty";

        startBtn.disabled = false;
        pauseBtn.disabled = true;
        hideLoading();
    }

    function finishTimer() {
        clearInterval(tickInterval);
        stopProgressLoop();
        tickInterval = null;
        isRunning = false;
        remainingMs = 0;

        timerDisplay.textContent = "00:00";
        setProgress(1);
        startBtn.disabled = false;
        pauseBtn.disabled = true;

        statusText.textContent = "🎉 Selesai! Waktu belajar kamu sudah habis. Saatnya istirahat!";
        statusText.className = "status finished";

        playAlarmSound();
        recordHistory(initialMinutes);
        showToast("🎉 Sesi " + initialMinutes + " menit selesai dan tersimpan di Riwayat.");
    }

    /* =========================
       RIWAYAT
    ========================= */
    function recordHistory(minutes) {
        stats.totalSessions += 1;
        stats.totalMinutes += minutes;

        const now = new Date();
        stats.history.unshift({
            date: now.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }),
            time: now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
            duration: minutes
        });

        saveStats();
        updateStatsUI();
    }

    function saveStats() {
        safeSet("timerStats", stats);
    }

    function updateStatsUI() {
        totalSessionsEl.textContent = stats.totalSessions;
        totalMinutesEl.textContent = stats.totalMinutes;
        clearHistoryBtn.disabled = stats.history.length === 0;

        if (stats.history.length === 0) {
            historyList.innerHTML =
                '<li class="empty-history">Belum ada riwayat. Selesaikan satu sesi belajar di halaman Timer, lalu sesinya muncul di sini.</li>';
            return;
        }

        historyList.innerHTML = stats.history.map((item, i) =>
            '<li>' +
                '<span class="history-info">' +
                    '<span>⏱️ Sesi belajar ' + item.duration + ' menit</span>' +
                    '<span class="history-time">' + (item.date ? item.date + ", " : "") + "pukul " + item.time + '</span>' +
                '</span>' +
                '<button type="button" class="del-btn" data-index="' + i + '" aria-label="Hapus sesi ini">✕</button>' +
            '</li>'
        ).join("");
    }

    historyList.addEventListener("click", function (e) {
        const btn = e.target.closest(".del-btn");
        if (!btn) return;

        const i = Number(btn.dataset.index);
        const item = stats.history[i];
        if (!item) return;

        playClickSound();
        stats.totalSessions = Math.max(0, stats.totalSessions - 1);
        stats.totalMinutes = Math.max(0, stats.totalMinutes - item.duration);
        stats.history.splice(i, 1);

        saveStats();
        updateStatsUI();
        showToast("Sesi dihapus dari riwayat.");
    });

    clearHistoryBtn.addEventListener("click", function () {
        playClickSound();
        if (stats.history.length === 0) return;
        if (!confirm("Hapus semua riwayat belajar? Tindakan ini tidak bisa dibatalkan.")) return;

        stats = { totalSessions: 0, totalMinutes: 0, history: [] };
        saveStats();
        updateStatsUI();
        showToast("Semua riwayat dihapus.");
    });

    /* =========================
       EVENT TIMER
    ========================= */
    durationInput.addEventListener("input", function () {
        clearError();
        if (durationInput.value === "" && !isRunning && !isStarting) {
            timerDisplay.textContent = "00:00";
            statusText.textContent = EMPTY_STATUS;
            statusText.className = "status empty";
        }
    });

    startBtn.addEventListener("click", function () {
        if (isRunning || isStarting) return;
        playClickSound();

        // Lanjutkan sesi yang sedang dijeda
        if (remainingMs > 0 && totalSeconds > 0) {
            startTimer();
            return;
        }

        if (!validateInput()) {
            shake(inputWrapper);
            durationInput.focus();
            return;
        }

        initialMinutes = Number(durationInput.value);
        totalSeconds = initialMinutes * 60;
        remainingMs = totalSeconds * 1000;
        setProgress(0);
        updateTimerDisplay();

        isStarting = true;
        showLoading();

        setTimeout(function () {
            if (!isStarting) return; // sudah di-reset saat loading
            isStarting = false;
            hideLoading();
            startTimer();
        }, 600);
    });

    pauseBtn.addEventListener("click", function () {
        playClickSound();
        pauseTimer();
    });

    resetBtn.addEventListener("click", function () {
        playClickSound();
        resetTimer();
    });

    // Enter hanya memulai timer saat berada di halaman Timer
    document.addEventListener("keydown", function (event) {
        if (event.key !== "Enter") return;
        const onTimerScreen = $("screen-timer").classList.contains("active");
        const onButton = event.target.tagName === "BUTTON";
        if (onTimerScreen && !onButton && !isRunning && !isStarting) {
            startBtn.click();
        }
    });

    /* =========================
       PENGATURAN
    ========================= */
    soundToggle.addEventListener("change", saveSettings);
    volumeRange.addEventListener("change", function () {
        saveSettings();
        playClickSound();
    });
    darkToggle.addEventListener("change", function () {
        applyTheme();
        saveSettings();
    });
    testSoundBtn.addEventListener("click", playAlarmSound);

    /* =========================
       INISIALISASI
    ========================= */
    loadSettings();
    applyTheme();
    loadStats();
    updateStatsUI();
    setProgress(0);
});
