import {
  RIA_BASKET_STORAGE_KEY,
  buildSetupOptions,
  matchRiaKnowledgeTopic,
  mergeBasketItems,
  normalizeRiaText,
  normalizePax,
  normalizeQuantity,
  parseRiaMessage,
  sanitizeStoredBasket
} from "/ria/quick-setup-core.mjs?v=chat-4";

const ROOT_ID = "ria-quick-setup-root";
const currency = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0
});

function initialSettings() {
  return {
    pax: null,
    chairType: "monobloc",
    chairCover: false,
    chairCoverStyle: "katrina",
    tableCover: false,
    tableCoverStyle: "katrina",
    runners: false,
    fanQuantity: 0,
    coolerQuantity: 0,
    preferredSetup: ""
  };
}

const state = {
  settings: initialSettings(),
  answered: new Set(),
  flow: "home",
  awaiting: "",
  coolingTarget: "",
  pendingOption: null,
  previousFocus: null,
  messageNumber: 0
};

function track(name, params = {}) {
  try {
    if (typeof window.gtag === "function") window.gtag("event", name, params);
    else if (Array.isArray(window.dataLayer)) window.dataLayer.push({ event: name, ...params });
  } catch {
    // Analytics must never interrupt Ria.
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function hasUpdate(updates, key) {
  return Object.prototype.hasOwnProperty.call(updates, key);
}

function markup() {
  return `
    <div id="${ROOT_ID}" class="ria-root">
      <button class="ria-launcher" type="button" aria-haspopup="dialog" aria-controls="ria-dialog" aria-expanded="false">
        <span class="ria-launcher-avatar" aria-hidden="true">R</span>
        <span class="ria-launcher-copy"><strong>Chat with Ria</strong><small>Plan or ask a question</small></span>
        <span class="ria-launcher-badge" aria-hidden="true">1</span>
      </button>
      <div class="ria-backdrop" hidden></div>
      <section id="ria-dialog" class="ria-dialog" role="dialog" aria-modal="true" aria-labelledby="ria-title" hidden>
        <header class="ria-header">
          <div class="ria-avatar" aria-hidden="true">R</div>
          <div class="ria-header-copy">
            <h2 id="ria-title">Ria</h2>
            <p><span aria-hidden="true"></span> Your Events Rental Hub guide</p>
          </div>
          <button class="ria-reset" type="button" aria-label="Start a new Ria conversation" title="Start over">↻</button>
          <button class="ria-close" type="button" aria-label="Minimize Ria chat">×</button>
        </header>

        <div class="ria-chat-log" role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversation with Ria"></div>

        <form class="ria-composer">
          <label class="ria-sr-only" for="ria-message">Message Ria</label>
          <input id="ria-message" type="text" autocomplete="off" placeholder="Ask Ria or type your guest count…" maxlength="180" />
          <button type="submit" aria-label="Send message to Ria">➜</button>
          <p>Guided help · No AI or API fee</p>
        </form>
      </section>
    </div>`;
}

function quickReplies(items) {
  return `<div class="ria-replies" aria-label="Choose a reply">${items.slice(0, 3).map((item) => {
    const attributes = [
      item.action ? `data-action="${escapeHtml(item.action)}"` : "",
      item.value != null ? `data-value="${escapeHtml(item.value)}"` : "",
      item.message ? `data-message="${escapeHtml(item.message)}"` : ""
    ].filter(Boolean).join(" ");
    return `<button type="button" ${attributes}>${escapeHtml(item.label)}</button>`;
  }).join("")}</div>`;
}

function lineMarkup(line) {
  const addOns = line.addons.length
    ? `<small>${line.addons.map((addon) => escapeHtml(addon.label)).join(" · ")}</small>`
    : "";
  return `<li><span><b>${line.quantity.toLocaleString()}×</b> ${escapeHtml(line.name)}${addOns}</span><strong>${currency.format(line.lineTotal)}</strong></li>`;
}

function optionMarkup(option, preferredSetup) {
  const preferred = option.id === preferredSetup;
  const icon = option.id === "round" ? "○" : option.id === "long" ? "▭" : "◉";
  return `
    <article class="ria-setup-card${preferred ? " is-preferred" : ""}" data-option="${option.id}">
      <div class="ria-setup-heading">
        <span aria-hidden="true">${icon}</span>
        <div><h4>${escapeHtml(option.title)}</h4><p>${escapeHtml(option.description)}</p></div>
        ${preferred ? "<em>Your choice</em>" : ""}
      </div>
      <ul>${option.lines.map(lineMarkup).join("")}</ul>
      <div class="ria-setup-total"><span><small>Sample estimate</small><b>${currency.format(option.total)}</b></span><span>${option.tableCount ? `${option.tableCount.toLocaleString()} tables` : "Chairs only"}</span></div>
      <button type="button" data-use-option="${option.id}">Use this setup <span aria-hidden="true">→</span></button>
    </article>`;
}

function settingsSummary(settings) {
  const parts = [settings.chairType === "tiffany" ? "Tiffany chairs" : "Monobloc chairs"];
  if (settings.preferredSetup === "chairs") parts.push("no tables");
  if (settings.chairType === "monobloc" && settings.chairCover) {
    parts.push(`${settings.chairCoverStyle === "spandex" ? "Spandex" : "Katrina"} chair covers`);
  }
  if (settings.tableCover) parts.push("table covers/toppers");
  if (settings.runners) parts.push("runners");
  if (settings.fanQuantity) parts.push(`${settings.fanQuantity} fan${settings.fanQuantity === 1 ? "" : "s"}`);
  if (settings.coolerQuantity) parts.push(`${settings.coolerQuantity} air cooler${settings.coolerQuantity === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

function initialize() {
  if (document.getElementById(ROOT_ID)) return;
  document.body.insertAdjacentHTML("beforeend", markup());

  const root = document.getElementById(ROOT_ID);
  const launcher = root.querySelector(".ria-launcher");
  const backdrop = root.querySelector(".ria-backdrop");
  const dialog = root.querySelector(".ria-dialog");
  const closeButton = root.querySelector(".ria-close");
  const resetButton = root.querySelector(".ria-reset");
  const log = root.querySelector(".ria-chat-log");
  const composer = root.querySelector(".ria-composer");
  const input = root.querySelector("#ria-message");

  function scrollToLatest() {
    window.requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
  }

  function appendMessage(role, html, extraClass = "") {
    state.messageNumber += 1;
    const wrapper = document.createElement("div");
    wrapper.className = `ria-message ria-message-${role}${extraClass ? ` ${extraClass}` : ""}`;
    wrapper.dataset.messageNumber = String(state.messageNumber);
    wrapper.innerHTML = role === "ria"
      ? `<span class="ria-message-avatar" aria-hidden="true">R</span><div class="ria-bubble">${html}</div>`
      : `<div class="ria-bubble">${html}</div>`;
    log.appendChild(wrapper);
    scrollToLatest();
    return wrapper;
  }

  function addRia(html, replies = [], extraClass = "") {
    return appendMessage("ria", `<p>${html}</p>${replies.length ? quickReplies(replies) : ""}`, extraClass);
  }

  function showMainMenu(message = "What can I help you with today?") {
    state.flow = "home";
    state.awaiting = "";
    addRia(message, [
      { label: "Plan my setup", action: "plan-start" },
      { label: "FAQs & policies", action: "faq-menu" },
      { label: "Contact Events Rental Hub", action: "knowledge", value: "contact" }
    ]);
  }

  function startConversation() {
    state.settings = initialSettings();
    state.answered = new Set();
    state.flow = "home";
    state.awaiting = "";
    state.coolingTarget = "";
    state.pendingOption = null;
    state.messageNumber = 0;
    log.innerHTML = "";
    addRia("Hi! I’m <strong>Ria</strong>, your Events Rental Hub helper. I can guide your setup one question at a time or answer questions about our services.");
    showMainMenu();
    track("ria_conversation_started", { source_page: window.location.pathname });
  }

  function startPlan() {
    state.settings = initialSettings();
    state.answered = new Set();
    state.flow = "plan";
    state.awaiting = "";
    state.coolingTarget = "";
    state.pendingOption = null;
    nextPlanQuestion();
  }

  function askPax() {
    state.awaiting = "pax";
    addRia('<span class="ria-step">Step 1</span>First, how many guests are you expecting? You can tap a choice or type the exact number.', [
      { label: "50 pax", action: "set-pax", value: 50 },
      { label: "100 pax", action: "set-pax", value: 100 },
      { label: "500 pax", action: "set-pax", value: 500 }
    ], "ria-message-question");
  }

  function askSetup() {
    state.awaiting = "setup";
    addRia('<span class="ria-step">Step 2</span>What kind of setup do you need?', [
      { label: "Round tables", action: "set-setup", value: "round" },
      { label: "Long tables", action: "set-setup", value: "long" },
      { label: "Chairs only", action: "set-setup", value: "chairs" }
    ], "ria-message-question");
  }

  function askChair() {
    state.awaiting = "chair";
    addRia('<span class="ria-step">Step 3</span>What chair style would you like?', [
      { label: "Monobloc", action: "set-chair", value: "monobloc" },
      { label: "Tiffany", action: "set-chair", value: "tiffany" }
    ], "ria-message-question");
  }

  function askCovers() {
    state.awaiting = "covers";
    if (state.settings.preferredSetup === "chairs" && state.settings.chairType === "tiffany") {
      state.settings.chairCover = false;
      state.settings.tableCover = false;
      state.answered.add("covers");
      return nextPlanQuestion();
    }
    if (state.settings.preferredSetup === "chairs") {
      addRia('<span class="ria-step">Step 4</span>Would you like covers for the Monobloc chairs?', [
        { label: "No covers", action: "set-covers", value: "none" },
        { label: "Katrina covers", action: "set-covers", value: "chair-katrina" },
        { label: "Spandex covers", action: "set-covers", value: "chair-spandex" }
      ], "ria-message-question");
      return;
    }
    if (state.settings.chairType === "tiffany") {
      addRia('<span class="ria-step">Step 4</span>Tiffany chairs are already styled. Would you like covers or toppers for the tables?', [
        { label: "No table covers", action: "set-covers", value: "none" },
        { label: "Add table covers", action: "set-covers", value: "table" }
      ], "ria-message-question");
      return;
    }
    addRia('<span class="ria-step">Step 4</span>How would you like the chairs and tables styled?', [
      { label: "No covers", action: "set-covers", value: "none" },
      { label: "Chair covers", action: "set-covers", value: "chair" },
      { label: "Chair + table covers", action: "set-covers", value: "all" }
    ], "ria-message-question");
  }

  function askRunners() {
    state.awaiting = "runners";
    addRia('<span class="ria-step">Step 5</span>Would you like table runners for a more finished look?', [
      { label: "Add runners", action: "set-runners", value: "yes" },
      { label: "No runners", action: "set-runners", value: "no" }
    ], "ria-message-question");
  }

  function nextPlanQuestion() {
    if (!state.answered.has("pax")) return askPax();
    if (!state.answered.has("setup")) return askSetup();
    if (!state.answered.has("chair")) return askChair();
    if (!state.answered.has("covers")) return askCovers();
    if (state.settings.preferredSetup === "chairs") {
      state.settings.tableCover = false;
      state.settings.runners = false;
      state.answered.add("runners");
    }
    if (!state.answered.has("runners")) return askRunners();
    state.awaiting = "result";
    showSuggestions("Perfect — here’s the setup based on your choices.");
  }

  function staleInteractiveMessages() {
    log.querySelectorAll(".ria-message-question:not(.is-stale), .ria-message-suggestion:not(.is-stale), .ria-message-decision:not(.is-stale)").forEach((message) => {
      message.classList.add("is-stale");
      message.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    });
  }

  function staleLatestQuestion() {
    const activeQuestions = [...log.querySelectorAll(".ria-message-question:not(.is-stale)")];
    const latest = activeQuestions.at(-1);
    if (!latest) return;
    latest.classList.add("is-stale");
    latest.querySelectorAll("button").forEach((button) => { button.disabled = true; });
  }

  function showSuggestions(intro) {
    const pax = normalizePax(state.settings.pax);
    if (!pax) return askPax();
    staleInteractiveMessages();
    let options = buildSetupOptions(state.settings);
    if (state.settings.preferredSetup) options = options.filter((option) => option.id === state.settings.preferredSetup);
    else options = options.filter((option) => option.id !== "chairs");
    const html = `
      <p>${intro}</p>
      <div class="ria-current-choice"><strong>${pax.toLocaleString()} pax</strong><span>${escapeHtml(settingsSummary(state.settings))}</span></div>
      <div class="ria-setup-list">${options.map((option) => optionMarkup(option, state.settings.preferredSetup)).join("")}</div>
      <p class="ria-estimate-note"><strong>Sample estimate only.</strong> Delivery, setup, availability, schedule, location, and venue conditions are reviewed separately.</p>
      ${quickReplies([
        { label: "Adjust setup", action: "adjust-menu" },
        { label: "Add cooling", action: "cooling-menu" },
        { label: "Ask a question", action: "faq-menu" }
      ])}`;
    appendMessage("ria", html, "ria-message-suggestion");
    track("ria_results_viewed", { pax, chair_type: state.settings.chairType, setup_type: state.settings.preferredSetup || "compare" });
  }

  function showFaqMenu() {
    state.awaiting = "faq";
    addRia("Sure — what would you like to know about?", [
      { label: "Service & delivery", action: "faq-service" },
      { label: "Booking & quotes", action: "faq-booking" },
      { label: "Equipment & styling", action: "faq-equipment" }
    ], "ria-message-question");
  }

  function answerKnowledge(topic) {
    track("ria_question_answered", { topic });
    const answers = {
      service_areas: {
        html: "We currently list <strong>Manila, Cavite, Parañaque, Las Piñas, Laguna, Makati, Mandaluyong, Pasay, Pasig, Quezon City, San Juan, Tagaytay, and Taguig</strong>. For nearby areas not listed, our team can confirm delivery coverage for your exact venue.",
        replies: [
          { label: "Contact the team", action: "knowledge", value: "contact" },
          { label: "Delivery guarantee", action: "knowledge", value: "delivery_guarantee" },
          { label: "Main menu", action: "main-menu" }
        ]
      },
      delivery_guarantee: {
        html: "Our published <strong>On-Time Delivery Guarantee</strong> provides a ₱500 refund for every completed 15 minutes late when the delay is ours. It applies to confirmed bookings with finalized delivery details and clear venue access. Venue restrictions, blocked access, severe weather, traffic incidents, and last-minute client changes are excluded. <a href=\"/terms#delivery-timing-guarantee\">Read the complete policy.</a>",
        replies: [
          { label: "Service areas", action: "knowledge", value: "service_areas" },
          { label: "Request a quote", action: "knowledge", value: "quotation" },
          { label: "Main menu", action: "main-menu" }
        ]
      },
      rush_booking: {
        html: "For an urgent or rush booking, send the event date, venue, equipment, and schedule through the quote flow or the official Events Rental Hub Facebook page so the team can review availability.",
        replies: [
          { label: "Facebook", action: "open-link", value: "https://www.facebook.com/eventsrentalhubph" },
          { label: "Request a quote", action: "open-link", value: "/catalog/?quote=equipment" },
          { label: "Email", action: "open-link", value: "mailto:erh.rental@gmail.com" }
        ]
      },
      quotation: {
        html: "To request a formal quotation, choose your equipment in the catalog, then provide your contact details, event schedule, venue, and equipment list. The team will review availability and delivery logistics before confirming the quotation.",
        replies: [
          { label: "Plan my setup", action: "plan-start" },
          { label: "Open quote form", action: "open-link", value: "/catalog/?quote=equipment" },
          { label: "Estimate conditions", action: "knowledge", value: "estimate_terms" }
        ]
      },
      estimate_terms: {
        html: "Ria and the catalog show <strong>sample estimates</strong>. Final pricing is subject to availability, delivery, setup, ingress and egress schedule, event location, and venue conditions.",
        replies: [
          { label: "Plan my setup", action: "plan-start" },
          { label: "Request a quote", action: "knowledge", value: "quotation" },
          { label: "Main menu", action: "main-menu" }
        ]
      },
      terms: {
        html: "The published Terms cover quotations, the <strong>50% downpayment</strong>, the standard <strong>22-hour rental period</strong>, changes, cancellations, delivery, equipment care, and the On-Time Delivery Guarantee. The confirmed quotation remains authoritative for your booking.",
        replies: [
          { label: "Delivery guarantee", action: "knowledge", value: "delivery_guarantee" },
          { label: "Estimate conditions", action: "knowledge", value: "estimate_terms" },
          { label: "Read all terms", action: "open-link", value: "/terms" }
        ]
      },
      unpublished_policy: {
        html: "Use the published Terms and Conditions for the current payment, cancellation, rescheduling, rental-period, delivery, and equipment-care rules. Your confirmed quotation provides the booking-specific instructions.",
        replies: [
          { label: "Read all terms", action: "open-link", value: "/terms" },
          { label: "Facebook", action: "open-link", value: "https://www.facebook.com/eventsrentalhubph" },
          { label: "Request a quote", action: "open-link", value: "/catalog/?quote=equipment" }
        ]
      },
      equipment: {
        html: "Our published catalog includes tables, chairs, fans, air coolers, carpets, stanchions, tents, Smart TVs, and touchscreen kiosks. Ria can quickly calculate Monobloc or Tiffany chairs with round or 6FT tables.",
        replies: [
          { label: "Plan my setup", action: "plan-start" },
          { label: "Covers & runners", action: "knowledge", value: "styling" },
          { label: "Cooling options", action: "knowledge", value: "cooling" }
        ]
      },
      styling: {
        html: "You can add Katrina or Spandex chair covers, table covers or round-table toppers, and runners. Tiffany chairs are already styled, so Ria does not charge chair covers with them.",
        replies: [
          { label: "Plan my setup", action: "plan-start" },
          { label: "Equipment list", action: "knowledge", value: "equipment" },
          { label: "Main menu", action: "main-menu" }
        ]
      },
      cooling: {
        html: "Industrial fans start at ₱700 each. Air coolers are ₱2,000 each and list 55–60 sqm coverage. The right quantity depends on venue size, power access, and layout, so Ria lets you choose the quantity instead of guessing from pax.",
        replies: [
          { label: "Add to my setup", action: "cooling-menu" },
          { label: "Plan my setup", action: "plan-start" },
          { label: "Main menu", action: "main-menu" }
        ]
      },
      business_documents: {
        html: "Events Rental Hub is presented as registered with DTI, BIR, a Business Permit, and PhilGEPS, and supports corporate-ready bookings. Please ask the team which specific document your company requires.",
        replies: [
          { label: "Email the team", action: "open-link", value: "mailto:erh.rental@gmail.com" },
          { label: "Contact options", action: "knowledge", value: "contact" },
          { label: "Main menu", action: "main-menu" }
        ]
      },
      contact: {
        html: "Use the website quote flow, email <strong>erh.rental@gmail.com</strong>, or message the official Events Rental Hub Facebook page. Include the event date, venue, schedule, and equipment list for a complete review.",
        replies: [
          { label: "Request a quote", action: "open-link", value: "/catalog/?quote=equipment" },
          { label: "Facebook", action: "open-link", value: "https://www.facebook.com/eventsrentalhubph" },
          { label: "Email", action: "open-link", value: "mailto:erh.rental@gmail.com" }
        ]
      },
      socials: {
        html: "The official Events Rental Hub social channel published on this website is <strong>Facebook</strong>. You can also use the website quotation flow or email the team.",
        replies: [
          { label: "Events Rental Hub Facebook", action: "open-link", value: "https://www.facebook.com/eventsrentalhubph" },
          { label: "Request a quote", action: "open-link", value: "/catalog/?quote=equipment" },
          { label: "Email", action: "open-link", value: "mailto:erh.rental@gmail.com" }
        ]
      }
    };
    const answer = answers[topic];
    if (!answer) return showFaqMenu();
    addRia(answer.html, answer.replies, "ria-message-answer");
  }

  function readExistingBasket() {
    try {
      return sanitizeStoredBasket(JSON.parse(window.localStorage.getItem(RIA_BASKET_STORAGE_KEY) || "[]"));
    } catch {
      return [];
    }
  }

  function writeBasket(option, mode) {
    try {
      const next = mergeBasketItems(readExistingBasket(), option.basketItems, mode);
      window.localStorage.setItem(RIA_BASKET_STORAGE_KEY, JSON.stringify(next));
      track("ria_basket_handoff", { setup_type: option.id, pax: normalizePax(state.settings.pax), basket_action: mode });
      window.location.assign("/catalog/?quote=equipment");
    } catch {
      addRia("Your browser blocked the quote basket. Please open the catalog and add the items manually.");
    }
  }

  function chooseOption(optionId) {
    const option = buildSetupOptions(state.settings).find((entry) => entry.id === optionId);
    if (!option) return;
    state.pendingOption = option;
    track("ria_setup_selected", { setup_type: option.id, pax: normalizePax(state.settings.pax), estimated_total: option.total });
    if (!readExistingBasket().length) return writeBasket(option, "replace");
    appendMessage("ria", `
      <p>You already have equipment saved. Should I add this setup or replace the current basket?</p>
      <div class="ria-basket-actions">
        <button type="button" data-basket-action="add">Add to basket</button>
        <button type="button" data-basket-action="replace">Replace basket</button>
        <button type="button" data-basket-cancel>Cancel</button>
      </div>`, "ria-message-decision");
  }

  function applyParsedAnswers(parsed) {
    Object.assign(state.settings, parsed.updates);
    if (hasUpdate(parsed.updates, "pax")) state.answered.add("pax");
    if (hasUpdate(parsed.updates, "preferredSetup")) state.answered.add("setup");
    if (hasUpdate(parsed.updates, "chairType")) state.answered.add("chair");
    if (hasUpdate(parsed.updates, "chairCover") || hasUpdate(parsed.updates, "tableCover")) state.answered.add("covers");
    if (hasUpdate(parsed.updates, "runners")) state.answered.add("runners");
  }

  function parsedUpdateSummary(updates) {
    const parts = [];
    if (hasUpdate(updates, "pax") && normalizePax(updates.pax)) parts.push(`${normalizePax(updates.pax).toLocaleString()} guests`);
    if (hasUpdate(updates, "preferredSetup")) {
      parts.push(updates.preferredSetup === "chairs" ? "chairs only" : updates.preferredSetup === "round" ? "round tables" : "long tables");
    }
    if (hasUpdate(updates, "chairType")) parts.push(updates.chairType === "tiffany" ? "Tiffany chairs" : "Monobloc chairs");
    if (hasUpdate(updates, "chairCover") || hasUpdate(updates, "tableCover")) {
      const anyCovers = Boolean(updates.chairCover || updates.tableCover);
      parts.push(anyCovers ? "with covers" : "no covers");
    }
    if (hasUpdate(updates, "runners")) parts.push(updates.runners ? "with runners" : "no runners");
    if (hasUpdate(updates, "fanQuantity")) parts.push(`${updates.fanQuantity} fan${updates.fanQuantity === 1 ? "" : "s"}`);
    if (hasUpdate(updates, "coolerQuantity")) parts.push(`${updates.coolerQuantity} air cooler${updates.coolerQuantity === 1 ? "" : "s"}`);
    return parts.join(" · ");
  }

  function handleContextualPlanReply(message) {
    const text = normalizeRiaText(message);
    const yes = /^(?:yes(?: please)?|sure|okay|ok|please|add it|include it)$/.test(text);
    const no = /^(?:no|no thanks|not now|skip|none|without)$/.test(text);

    if (state.awaiting === "setup") {
      if (/\b(?:chairs?|seats?|seating)\s+only\b|\bno\s+tables?\b|\bjust\s+(?:chairs?|seats?)\b/.test(text)) {
        staleLatestQuestion();
        chooseAction("set-setup", "chairs");
        return true;
      }
      if (/\b(round|circular)\b/.test(text)) {
        staleLatestQuestion();
        chooseAction("set-setup", "round");
        return true;
      }
      if (/\b(long|rectangular|6ft|6 ft)\b/.test(text)) {
        staleLatestQuestion();
        chooseAction("set-setup", "long");
        return true;
      }
      if (/\b(compare|both|not sure|you choose|recommend)\b/.test(text)) {
        staleLatestQuestion();
        chooseAction("set-setup", "both");
        return true;
      }
    }

    if (state.awaiting === "chair") {
      if (/\b(tiffany|premium|gold chairs?)\b/.test(text)) {
        staleLatestQuestion();
        chooseAction("set-chair", "tiffany");
        return true;
      }
      if (/\b(monobloc|basic|regular|budget|cheapest)\b/.test(text)) {
        staleLatestQuestion();
        chooseAction("set-chair", "monobloc");
        return true;
      }
    }

    if (state.awaiting === "covers") {
      if (no) {
        staleLatestQuestion();
        chooseAction("set-covers", "none");
        return true;
      }
      if (/\bspandex\b/.test(text)) {
        state.settings.chairCoverStyle = "spandex";
        state.settings.tableCoverStyle = "spandex";
        staleLatestQuestion();
        chooseAction("set-covers", state.settings.preferredSetup === "chairs" ? "chair-spandex" : "all");
        return true;
      }
      if (/\bkatrina\b/.test(text)) {
        state.settings.chairCoverStyle = "katrina";
        state.settings.tableCoverStyle = "katrina";
        staleLatestQuestion();
        chooseAction("set-covers", state.settings.preferredSetup === "chairs" ? "chair-katrina" : "all");
        return true;
      }
      if (yes || /\b(?:with|add|include|want|need)\s+covers?\b/.test(text)) {
        staleLatestQuestion();
        chooseAction("set-covers", state.settings.preferredSetup === "chairs" ? "chair-katrina" : "all");
        return true;
      }
    }

    if (state.awaiting === "runners") {
      if (yes || /\b(?:add|include|with|want|need)\s+(?:table\s+)?runners?\b/.test(text)) {
        staleLatestQuestion();
        chooseAction("set-runners", "yes");
        return true;
      }
      if (no) {
        staleLatestQuestion();
        chooseAction("set-runners", "no");
        return true;
      }
    }
    return false;
  }

  function goBackOneQuestion() {
    const previousByStep = {
      setup: "pax",
      chair: "setup",
      covers: "chair",
      runners: "covers",
      result: state.settings.preferredSetup === "chairs" ? "covers" : "runners"
    };
    const previous = previousByStep[state.awaiting];
    if (!previous) {
      addRia("You’re already at the beginning.", [
        { label: "Continue", action: "plan-continue" },
        { label: "Main menu", action: "main-menu" }
      ]);
      return;
    }
    staleLatestQuestion();
    state.answered.delete(previous);
    nextPlanQuestion();
  }

  function handlePlanMessage(message) {
    const normalizedMessage = normalizeRiaText(message);
    if (state.awaiting === "cooling-quantity" && /^\d{1,4}$/.test(normalizedMessage)) {
      const quantity = normalizeQuantity(normalizedMessage);
      if (!quantity) {
        addRia("Please enter a whole quantity from 1 to 5,000.");
        return;
      }
      state.settings[state.coolingTarget === "fan" ? "fanQuantity" : "coolerQuantity"] = quantity;
      state.awaiting = "result";
      showSuggestions(`Done — I added ${quantity} ${state.coolingTarget === "fan" ? "industrial fan" : "air cooler"}${quantity === 1 ? "" : "s"}.`);
      return;
    }

    if (handleContextualPlanReply(message)) return;

    const topic = matchRiaKnowledgeTopic(message);
    const looksLikeQuestion = /^(?:do|does|can|could|what|where|when|why|how|is|are)\b/i.test(message) || /\?$/.test(message);
    if (topic && looksLikeQuestion) {
      answerKnowledge(topic);
      addRia("When you’re ready, we can continue your setup.", [
        { label: "Continue setup", action: "plan-continue" },
        { label: "Main menu", action: "main-menu" }
      ]);
      return;
    }

    const parsed = parseRiaMessage(message, state.settings);
    if (parsed.intent === "reset") return startConversation();
    if (parsed.intent === "back") return goBackOneQuestion();
    if (parsed.intent === "summary") {
      addRia(`Your current setup is <strong>${escapeHtml(settingsSummary(state.settings))}</strong>${normalizePax(state.settings.pax) ? ` for <strong>${normalizePax(state.settings.pax).toLocaleString()} guests</strong>` : ""}.`, [
        { label: "Continue setup", action: "plan-continue" },
        { label: "Adjust setup", action: "adjust-menu" },
        { label: "Main menu", action: "main-menu" }
      ]);
      return;
    }
    if (parsed.intent === "gratitude") {
      addRia("You’re welcome! 😊 I’m here whenever you’re ready.", [
        { label: "Continue setup", action: "plan-continue" },
        { label: "Main menu", action: "main-menu" }
      ]);
      return;
    }
    if (parsed.intent === "farewell") {
      addRia("Thanks for chatting! Your choices will stay here while this page is open.", [
        { label: "Continue setup", action: "plan-continue" },
        { label: "Main menu", action: "main-menu" }
      ]);
      return;
    }
    if (parsed.recognized.length) {
      applyParsedAnswers(parsed);
      if (hasUpdate(parsed.updates, "pax") && !normalizePax(parsed.updates.pax)) {
        state.answered.delete("pax");
        addRia("Please enter a whole guest count from 1 to 5,000.");
        return askPax();
      }
      if (state.awaiting === "result" || hasUpdate(parsed.updates, "fanQuantity") || hasUpdate(parsed.updates, "coolerQuantity")) {
        showSuggestions("Done — I updated your setup and recalculated the estimate.");
        return;
      }
      const understood = parsedUpdateSummary(parsed.updates);
      if (understood) addRia(`Got it — <strong>${escapeHtml(understood)}</strong>.`);
      nextPlanQuestion();
      return;
    }

    if (topic) {
      answerKnowledge(topic);
      addRia("When you’re ready, we can continue your setup.", [
        { label: "Continue setup", action: "plan-continue" },
        { label: "Main menu", action: "main-menu" }
      ]);
      return;
    }
    addRia("I didn’t catch that choice. You can tap one of the options or type your answer in a few words.", [
      { label: "Continue setup", action: "plan-continue" },
      { label: "Main menu", action: "main-menu" }
    ]);
  }

  function handleMessage(rawMessage, shouldAppend = true) {
    const message = String(rawMessage || "").trim();
    if (!message) return;
    if (shouldAppend) appendMessage("user", `<p>${escapeHtml(message)}</p>`);

    if (state.flow === "plan") return handlePlanMessage(message);

    const parsed = parseRiaMessage(message, state.settings);
    const looksLikeQuestion = /^(?:do|does|can|could|what|where|when|why|how|is|are)\b/i.test(message) || /\?$/.test(message);
    if (parsed.recognized.length && (hasUpdate(parsed.updates, "pax") || !looksLikeQuestion)) {
      state.flow = "plan";
      applyParsedAnswers(parsed);
      const understood = parsedUpdateSummary(parsed.updates);
      if (understood) addRia(`Got it — <strong>${escapeHtml(understood)}</strong>.`);
      return nextPlanQuestion();
    }
    const topic = matchRiaKnowledgeTopic(message);
    if (topic) return answerKnowledge(topic);

    if (parsed.intent === "reset") return startConversation();
    if (parsed.intent === "greeting") return showMainMenu("Hello! 😊 What can I help you with?");
    if (parsed.intent === "help") return showMainMenu("I can plan equipment, explain our services and published terms, or help you contact the team.");
    if (parsed.intent === "gratitude") return showMainMenu("You’re welcome! 😊 What else can I help you with?");
    if (parsed.intent === "farewell") return addRia("Thanks for visiting Events Rental Hub. Message me again anytime.");
    if (parsed.recognized.length) {
      state.flow = "plan";
      applyParsedAnswers(parsed);
      const understood = parsedUpdateSummary(parsed.updates);
      if (understood) addRia(`Got it — <strong>${escapeHtml(understood)}</strong>.`);
      return nextPlanQuestion();
    }
    addRia("I’m best at equipment planning and questions about Events Rental Hub. Choose where you’d like to start.", [
      { label: "Plan my setup", action: "plan-start" },
      { label: "Browse FAQs", action: "faq-menu" },
      { label: "Contact Events Rental Hub", action: "knowledge", value: "contact" }
    ]);
  }

  function chooseAction(action, value) {
    if (action === "main-menu") return showMainMenu();
    if (action === "plan-start") return startPlan();
    if (action === "plan-continue") { state.flow = "plan"; return nextPlanQuestion(); }
    if (action === "faq-menu") return showFaqMenu();
    if (action === "faq-service") {
      return addRia("Choose a service or delivery question:", [
        { label: "Service areas", action: "knowledge", value: "service_areas" },
        { label: "Delivery guarantee", action: "knowledge", value: "delivery_guarantee" },
        { label: "Rush booking", action: "knowledge", value: "rush_booking" }
      ], "ria-message-question");
    }
    if (action === "faq-booking") {
      return addRia("Choose a booking or quotation question:", [
        { label: "How to get a quote", action: "knowledge", value: "quotation" },
        { label: "Estimate conditions", action: "knowledge", value: "estimate_terms" },
        { label: "Policies & terms", action: "knowledge", value: "terms" }
      ], "ria-message-question");
    }
    if (action === "faq-equipment") {
      return addRia("Choose an equipment question:", [
        { label: "What do you rent?", action: "knowledge", value: "equipment" },
        { label: "Covers & runners", action: "knowledge", value: "styling" },
        { label: "Fans & air coolers", action: "knowledge", value: "cooling" }
      ], "ria-message-question");
    }
    if (action === "knowledge") return answerKnowledge(value);
    if (action === "social-more") {
      return addRia("Official Events Rental Hub contacts:", [
        { label: "Facebook", action: "open-link", value: "https://www.facebook.com/eventsrentalhubph" },
        { label: "Request a quote", action: "open-link", value: "/catalog/?quote=equipment" },
        { label: "Email", action: "open-link", value: "mailto:erh.rental@gmail.com" }
      ]);
    }
    if (action === "open-link") {
      track("ria_contact_link_clicked", { destination: value.split(":")[0] });
      window.location.href = value;
      return;
    }
    if (action === "set-pax") {
      state.settings.pax = Number(value);
      state.answered.add("pax");
      return nextPlanQuestion();
    }
    if (action === "set-setup") {
      state.settings.preferredSetup = value === "both" ? "" : value;
      state.answered.add("setup");
      return nextPlanQuestion();
    }
    if (action === "set-chair") {
      state.settings.chairType = value;
      if (value === "tiffany") state.settings.chairCover = false;
      state.answered.add("chair");
      return nextPlanQuestion();
    }
    if (action === "set-covers") {
      state.settings.chairCover = value === "chair" || value === "all" || value === "chair-katrina" || value === "chair-spandex";
      state.settings.tableCover = value === "table" || value === "all";
      if (value === "chair-spandex") state.settings.chairCoverStyle = "spandex";
      if (value === "chair-katrina") state.settings.chairCoverStyle = "katrina";
      state.answered.add("covers");
      return nextPlanQuestion();
    }
    if (action === "set-runners") {
      state.settings.runners = value === "yes";
      state.answered.add("runners");
      return nextPlanQuestion();
    }
    if (action === "adjust-menu") {
      return addRia("What would you like to change?", [
        { label: "Guest count", action: "adjust", value: "pax" },
        { label: "Chair style", action: "adjust", value: "chair" },
        { label: "Tables & styling", action: "adjust", value: "styling" }
      ], "ria-message-question");
    }
    if (action === "adjust") {
      state.flow = "plan";
      if (value === "styling") ["setup", "covers", "runners"].forEach((key) => state.answered.delete(key));
      else state.answered.delete(value);
      return nextPlanQuestion();
    }
    if (action === "cooling-menu") {
      if (!normalizePax(state.settings.pax)) {
        addRia("Let’s get your guest count first, then I can add cooling to the setup.");
        return startPlan();
      }
      return addRia("Would you like to add cooling? Quantity depends on venue size, power access, and layout, so I won’t guess from pax.", [
        { label: "Industrial fans", action: "select-cooling", value: "fan" },
        { label: "Air coolers", action: "select-cooling", value: "cooler" },
        { label: "Not now", action: "show-result" }
      ], "ria-message-question");
    }
    if (action === "select-cooling") {
      state.coolingTarget = value;
      state.awaiting = "cooling-quantity";
      return addRia(`How many ${value === "fan" ? "industrial fans" : "air coolers"} would you like?`, [
        { label: "1", action: "set-cooling-qty", value: 1 },
        { label: "2", action: "set-cooling-qty", value: 2 },
        { label: "Type quantity", action: "prompt-cooling-qty" }
      ], "ria-message-question");
    }
    if (action === "prompt-cooling-qty") {
      state.awaiting = "cooling-quantity";
      return addRia("Type the quantity as a whole number, for example <strong>3</strong>.");
    }
    if (action === "set-cooling-qty") {
      const quantity = normalizeQuantity(value);
      state.settings[state.coolingTarget === "fan" ? "fanQuantity" : "coolerQuantity"] = quantity;
      track("ria_cooling_added", { cooling_type: state.coolingTarget, quantity });
      return showSuggestions(`Done — I added ${quantity} ${state.coolingTarget === "fan" ? "industrial fan" : "air cooler"}${quantity === 1 ? "" : "s"}.`);
    }
    if (action === "show-result") return showSuggestions("Here’s your setup estimate.");
  }

  function open() {
    state.previousFocus = document.activeElement;
    dialog.hidden = false;
    backdrop.hidden = false;
    launcher.setAttribute("aria-expanded", "true");
    document.documentElement.classList.add("ria-open");
    window.requestAnimationFrame(() => {
      root.classList.add("is-open");
      input.focus();
      scrollToLatest();
    });
    track("ria_open", { source_page: window.location.pathname });
  }

  function close() {
    root.classList.remove("is-open");
    document.documentElement.classList.remove("ria-open");
    launcher.setAttribute("aria-expanded", "false");
    window.setTimeout(() => {
      dialog.hidden = true;
      backdrop.hidden = true;
      state.previousFocus?.focus?.();
    }, 180);
  }

  function focusableElements() {
    return [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
      .filter((element) => !element.hidden && element.offsetParent !== null);
  }

  launcher.addEventListener("click", open);
  closeButton.addEventListener("click", close);
  backdrop.addEventListener("click", close);
  resetButton.addEventListener("click", () => { startConversation(); input.focus(); });

  composer.addEventListener("submit", (event) => {
    event.preventDefault();
    const message = input.value;
    input.value = "";
    handleMessage(message);
    input.focus();
  });

  log.addEventListener("click", (event) => {
    const reply = event.target.closest("[data-action], [data-message]");
    if (reply) {
      const sourceMessage = reply.closest(".ria-message");
      if (sourceMessage) {
        if (sourceMessage.classList.contains("ria-message-question")) sourceMessage.classList.add("is-stale");
        sourceMessage.querySelectorAll("button").forEach((button) => { button.disabled = true; });
      }
      appendMessage("user", `<p>${escapeHtml(reply.textContent.trim())}</p>`);
      if (reply.dataset.message) handleMessage(reply.dataset.message, false);
      else chooseAction(reply.dataset.action, reply.dataset.value || "");
      return;
    }
    const optionButton = event.target.closest("[data-use-option]");
    if (optionButton) return chooseOption(optionButton.dataset.useOption);
    const basketAction = event.target.closest("[data-basket-action]");
    if (basketAction && state.pendingOption) return writeBasket(state.pendingOption, basketAction.dataset.basketAction);
    if (event.target.closest("[data-basket-cancel]")) {
      state.pendingOption = null;
      addRia("No problem. Your current basket is unchanged.");
    }
  });

  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const elements = focusableElements();
    if (!elements.length) return;
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  startConversation();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
else initialize();
