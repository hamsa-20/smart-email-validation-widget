(function (window) {
  "use strict";

  const disposableDomains = new Set([
    "10minutemail.com", "guerrillamail.com", "mailinator.com",
    "tempmail.com", "temp-mail.org", "yopmail.com",
    "trashmail.com", "getnada.com"
  ]);

  function syntaxCheck(value) {
    const email = String(value || "").trim().toLowerCase();

    if (!email) return { valid: false, blocking: true, reason: "Enter an email address." };
    if (email.length > 254) return { valid: false, blocking: true, reason: "Email address is too long." };

    const parts = email.split("@");
    if (parts.length !== 2) {
      return { valid: false, blocking: true, reason: "Email must contain exactly one @ symbol." };
    }

    const [local, domain] = parts;

    if (!local || !domain) {
      return { valid: false, blocking: true, reason: "Both email name and domain are required." };
    }

    if (local.length > 64) {
      return { valid: false, blocking: true, reason: "The email name is too long." };
    }

    if (local.startsWith(".") || local.endsWith(".") ||
        local.includes("..") || /\s/.test(email)) {
      return { valid: false, blocking: true, reason: "The email format is invalid." };
    }

    if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) {
      return { valid: false, blocking: true, reason: "The email contains unsupported characters." };
    }

    const labels = domain.split(".");
    if (labels.length < 2 || !labels.every(
      label => label.length <= 63 &&
        /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label)
    )) {
      return { valid: false, blocking: true, reason: "The domain format is invalid." };
    }

    return { valid: true, blocking: false, domain };
  }

  function attach(inputOrSelector, options = {}) {
    const input = typeof inputOrSelector === "string"
      ? document.querySelector(inputOrSelector)
      : inputOrSelector;

    if (!input) throw new Error("EmailValidator: input not found.");

    const api = options.api || input.dataset.validatorApi || "/api/verify-email";
    const debounceMs = options.debounceMs ?? 180;

    const status = document.getElementById("emailStatus");
    const icon = document.getElementById("emailIcon");
    const detail = {
      syntax: document.getElementById("detailSyntax"),
      disposable: document.getElementById("detailDisposable"),
      dns: document.getElementById("detailDns"),
      latency: document.getElementById("detailLatency"),
      cache: document.getElementById("detailCache")
    };

    let timer;
    let controller;
    let requestId = 0;
    let latest = { valid: false, blocking: true, reason: "Enter an email address." };

    function setState(state, message) {
      input.classList.remove("valid", "invalid");
      status.className = `status ${state}`;
      status.textContent = message;
      icon.textContent =
        state === "valid" ? "✓" :
        state === "invalid" ? "×" :
        state === "checking" ? "…" : "";
      icon.className = `field-icon ${state}`;
      if (state === "valid") input.classList.add("valid");
      if (state === "invalid") input.classList.add("invalid");
    }

    function setDetail(element, value, state = "") {
      if (!element) return;
      element.textContent = value;
      element.className = `detail-value ${state}`;
    }

    function resetDetails() {
      setDetail(detail.syntax, "Waiting");
      setDetail(detail.disposable, "Waiting");
      setDetail(detail.dns, "Waiting");
      setDetail(detail.latency, "—");
      setDetail(detail.cache, "—");
    }

    async function validateNow() {
      const id = ++requestId;
      const syntax = syntaxCheck(input.value);
      resetDetails();

      if (!syntax.valid) {
        latest = syntax;
        setDetail(detail.syntax, "Failed", "bad");
        setState("invalid", syntax.reason);
        return latest;
      }

      setDetail(detail.syntax, "Passed", "good");

      if (disposableDomains.has(syntax.domain)) {
        latest = {
          valid: false, blocking: true,
          reason: "Disposable email domains are not accepted."
        };
        setDetail(detail.disposable, "Detected", "bad");
        setDetail(detail.dns, "Skipped");
        setState("invalid", latest.reason);
        return latest;
      }

      setDetail(detail.disposable, "Not detected", "good");
      setState("checking", "Checking domain…");

      if (controller) controller.abort();
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);

      try {
        const response = await fetch(api, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: input.value.trim() }),
          signal: controller.signal
        });

        clearTimeout(timeout);
        if (id !== requestId) return latest;

        const data = await response.json();

        setDetail(detail.dns, data.check || "Checked", data.valid === false ? "bad" : "good");
        setDetail(detail.latency, `${data.latencyMs ?? "—"} ms`);
        setDetail(detail.cache, data.cached ? "Yes" : "No");

        if (data.valid === true) {
          latest = { valid: true, blocking: false, reason: data.reason || "Email looks valid." };
          setState("valid", latest.reason);
        } else if (data.valid === false) {
          latest = { valid: false, blocking: true, reason: data.reason || "Email could not be verified." };
          setState("invalid", latest.reason);
        } else {
          latest = { valid: true, blocking: false, reason: "verification-unavailable" };
          setDetail(detail.dns, "Unavailable", "neutral");
          setState("valid", "Verification unavailable — continuing.");
        }

        return latest;
      } catch (_) {
        clearTimeout(timeout);
        if (id !== requestId) return latest;

        setDetail(detail.dns, "Unavailable", "neutral");
        setDetail(detail.latency, "Timeout");

        latest = { valid: true, blocking: false, reason: "verification-unavailable" };
        setState("valid", "Network check unavailable — continuing.");
        return latest;
      }
    }

    function schedule() {
      clearTimeout(timer);
      const syntax = syntaxCheck(input.value);

      if (!syntax.valid) {
        resetDetails();
        latest = syntax;
        setDetail(detail.syntax, "Failed", "bad");
        setState("invalid", syntax.reason);
        return;
      }

      setDetail(detail.syntax, "Passed", "good");

      if (disposableDomains.has(syntax.domain)) {
        latest = {
          valid: false, blocking: true,
          reason: "Disposable email domains are not accepted."
        };
        setDetail(detail.disposable, "Detected", "bad");
        setDetail(detail.dns, "Skipped");
        setState("invalid", latest.reason);
        return;
      }

      setDetail(detail.disposable, "Not detected", "good");
      setState("checking", "Checking domain…");
      timer = setTimeout(validateNow, debounceMs);
    }

    input.addEventListener("input", schedule);
    input.addEventListener("blur", validateNow);

    return {
      validateNow,
      isValid: () => latest.valid === true,
      getResult: () => ({ ...latest })
    };
  }

  window.EmailValidator = { attach, syntaxCheck };
})(window);