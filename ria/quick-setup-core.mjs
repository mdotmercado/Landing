export const RIA_BASKET_STORAGE_KEY = "erh-catalog-sample-quote";
export const RIA_MAX_QUANTITY = 5000;

export const RIA_PRODUCTS = Object.freeze({
  monobloc: {
    id: "uratex-monobloc",
    name: "Monobloc Chairs"
  },
  tiffany: {
    id: "tiffany-chairs-foam",
    name: "Tiffany Chairs with Foam",
    unitPrice: 75
  },
  longTable: {
    id: "lifetime-table-6ft",
    name: "Lifetime Tables (6FT)",
    unitPrice: 200,
    seats: 6
  },
  roundTable: {
    id: "round-table-8-seater",
    name: "Round Tables (8 seater)",
    unitPrice: 300,
    seats: 8
  },
  fan: {
    id: "iwata-industrial-fans",
    name: "Iwata Industrial Fans",
    unitPrice: 700
  },
  airCooler: {
    id: "iwata-air-coolers",
    name: "Iwata Air Coolers",
    unitPrice: 2000
  }
});

export const RIA_ADDONS = Object.freeze({
  chairKatrina: { id: "katrina-cover", label: "Katrina chair cover", unitPrice: 15 },
  chairSpandex: { id: "spandex-cover", label: "Spandex chair cover", unitPrice: 20 },
  longKatrina: { id: "katrina-cover", label: "Katrina table cover", unitPrice: 100 },
  longSpandex: { id: "spandex-cover", label: "Spandex table cover", unitPrice: 100 },
  roundTopper: { id: "round-table-topper", label: "Round table topper", unitPrice: 60 },
  runner: { id: "table-runner", label: "Runner", unitPrice: 25 }
});

export function normalizePax(value) {
  if (value === "" || value == null) return null;
  const pax = Number(value);
  if (!Number.isInteger(pax) || pax < 1 || pax > RIA_MAX_QUANTITY) return null;
  return pax;
}

export function normalizeQuantity(value) {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 0) return 0;
  return Math.min(quantity, RIA_MAX_QUANTITY);
}

export function getMonoblocUnitPrice(quantity) {
  const normalized = normalizeQuantity(quantity);
  if (normalized >= 200) return 15;
  if (normalized >= 100) return 17;
  return 20;
}

function createBasketLine(product, quantity, selectedAddonIds = []) {
  return {
    id: product.id,
    quantity: normalizeQuantity(quantity),
    selectedVariationId: "",
    selectedAddonIds: [...new Set(selectedAddonIds.filter(Boolean))]
  };
}

function priceLine(product, quantity, addons = [], unitPriceOverride = null) {
  const normalizedQuantity = normalizeQuantity(quantity);
  const unitPrice = unitPriceOverride ?? product.unitPrice ?? 0;
  const addonUnitPrice = addons.reduce((sum, addon) => sum + addon.unitPrice, 0);
  return {
    id: product.id,
    name: product.name,
    quantity: normalizedQuantity,
    unitPrice,
    addons,
    lineTotal: normalizedQuantity * (unitPrice + addonUnitPrice),
    basketLine: createBasketLine(product, normalizedQuantity, addons.map((addon) => addon.id))
  };
}

function selectedChairCover(settings) {
  if (settings.chairType !== "monobloc" || !settings.chairCover) return [];
  return [settings.chairCoverStyle === "spandex" ? RIA_ADDONS.chairSpandex : RIA_ADDONS.chairKatrina];
}

function selectedLongTableAddons(settings) {
  const addons = [];
  if (settings.tableCover) {
    addons.push(settings.tableCoverStyle === "spandex" ? RIA_ADDONS.longSpandex : RIA_ADDONS.longKatrina);
  }
  if (settings.runners) addons.push(RIA_ADDONS.runner);
  return addons;
}

function selectedRoundTableAddons(settings) {
  const addons = [];
  if (settings.tableCover) addons.push(RIA_ADDONS.roundTopper);
  if (settings.runners) addons.push(RIA_ADDONS.runner);
  return addons;
}

function coolingLines(settings) {
  const lines = [];
  const fanQuantity = normalizeQuantity(settings.fanQuantity);
  const coolerQuantity = normalizeQuantity(settings.coolerQuantity);
  if (fanQuantity) lines.push(priceLine(RIA_PRODUCTS.fan, fanQuantity));
  if (coolerQuantity) lines.push(priceLine(RIA_PRODUCTS.airCooler, coolerQuantity));
  return lines;
}

function buildOption({ id, title, description, table, tableCount, tableAddons, chairLine, cooling }) {
  const lines = [chairLine, priceLine(table, tableCount, tableAddons), ...cooling];
  return {
    id,
    title,
    description,
    tableCount,
    tableCapacity: table.seats,
    lines,
    total: lines.reduce((sum, line) => sum + line.lineTotal, 0),
    basketItems: lines.map((line) => line.basketLine)
  };
}

export function buildSetupOptions(input = {}) {
  const pax = normalizePax(input.pax);
  if (!pax) return [];

  const settings = {
    chairType: input.chairType === "tiffany" ? "tiffany" : "monobloc",
    chairCover: Boolean(input.chairCover),
    chairCoverStyle: input.chairCoverStyle === "spandex" ? "spandex" : "katrina",
    tableCover: Boolean(input.tableCover),
    tableCoverStyle: input.tableCoverStyle === "spandex" ? "spandex" : "katrina",
    runners: Boolean(input.runners),
    fanQuantity: normalizeQuantity(input.fanQuantity),
    coolerQuantity: normalizeQuantity(input.coolerQuantity)
  };

  const chairProduct = settings.chairType === "tiffany" ? RIA_PRODUCTS.tiffany : RIA_PRODUCTS.monobloc;
  const chairUnitPrice = settings.chairType === "tiffany" ? RIA_PRODUCTS.tiffany.unitPrice : getMonoblocUnitPrice(pax);
  const chairLine = priceLine(chairProduct, pax, selectedChairCover(settings), chairUnitPrice);
  const cooling = coolingLines(settings);

  const chairOnlyLines = [chairLine, ...cooling];
  const chairOnlyOption = {
    id: "chairs",
    title: "Chairs-only setup",
    description: "One chair per guest with no tables included.",
    tableCount: 0,
    tableCapacity: 0,
    lines: chairOnlyLines,
    total: chairOnlyLines.reduce((sum, line) => sum + line.lineTotal, 0),
    basketItems: chairOnlyLines.map((line) => line.basketLine)
  };

  return [
    buildOption({
      id: "round",
      title: "Round dining setup",
      description: "One 8-seater round table for every eight guests.",
      table: RIA_PRODUCTS.roundTable,
      tableCount: Math.ceil(pax / RIA_PRODUCTS.roundTable.seats),
      tableAddons: selectedRoundTableAddons(settings),
      chairLine,
      cooling
    }),
    buildOption({
      id: "long",
      title: "6FT long-table setup",
      description: "One 6FT table for every six guests for comfortable seating.",
      table: RIA_PRODUCTS.longTable,
      tableCount: Math.ceil(pax / RIA_PRODUCTS.longTable.seats),
      tableAddons: selectedLongTableAddons(settings),
      chairLine,
      cooling
    }),
    chairOnlyOption
  ];
}

export function sanitizeStoredBasket(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const id = String(item?.id || "").trim();
      const quantity = normalizeQuantity(item?.quantity);
      if (!id || !quantity) return null;
      return {
        id,
        quantity,
        selectedVariationId: String(item?.selectedVariationId || ""),
        selectedAddonIds: Array.isArray(item?.selectedAddonIds)
          ? [...new Set(item.selectedAddonIds.map(String).filter(Boolean))]
          : []
      };
    })
    .filter(Boolean);
}

export function mergeBasketItems(existingItems, suggestedItems, mode = "replace") {
  const existing = sanitizeStoredBasket(existingItems);
  const suggested = sanitizeStoredBasket(suggestedItems);
  if (mode !== "add") return suggested;

  const merged = new Map(existing.map((item) => [item.id, { ...item }]));
  suggested.forEach((item) => {
    const current = merged.get(item.id);
    if (!current) {
      merged.set(item.id, { ...item });
      return;
    }
    merged.set(item.id, {
      ...current,
      quantity: Math.min(RIA_MAX_QUANTITY, current.quantity + item.quantity)
    });
  });
  return [...merged.values()];
}

const RIA_TEXT_REPLACEMENTS = [
  [/\b(?:u|yu)\b/g, "you"],
  [/\bur\b/g, "your"],
  [/\b(?:pls|plz)\b/g, "please"],
  [/\b(?:fb)\b/g, "facebook"],
  [/\b(?:ig)\b/g, "instagram"],
  [/\b(?:numbr|nmbr|contact no)\b/g, "contact number"],
  [/\b(?:delivr|delver|dilever)\b/g, "deliver"],
  [/\b(?:qoute|qoutation|quotatoin)\b/g, "quotation"],
  [/\b(?:tifany|tiffani|tiffanny)\b/g, "tiffany"],
  [/\b(?:monoblock|monoblock)\b/g, "monobloc"],
  [/\b(?:covrs|coverrs)\b/g, "covers"],
  [/\b(?:runers|runnrs)\b/g, "runners"],
  [/\baircoolers?\b/g, "air coolers"],
  [/\b(?:gsts|guests?)\b/g, "guests"],
  [/\b(?:qc)\b/g, "quezon city"],
  [/\b(?:bgc)\b/g, "taguig"],
  [/\bmagkano\b/g, "how much"],
  [/\bpresyo\b/g, "price"],
  [/\b(?:tao|katao)\b/g, "guests"],
  [/\b(?:upuan|silya)\b/g, "chairs"],
  [/\bmesa\b/g, "tables"],
  [/\b(?:lang|lamang)\b/g, "only"],
  [/\b(?:wala|walang)\b/g, "no"],
  [/\b(?:saan)\b/g, "where"],
  [/\b(?:pwede|puwede)\b/g, "can"],
  [/\b(?:resched|re-sched)\b/g, "reschedule"],
  [/\b(?:opo|oo|yup|yeah|yep)\b/g, "yes"],
  [/\b(?:hindi|ayoko|nope|nah)\b/g, "no"],
  [/\b(?:po|ba)\b/g, ""]
];

export function normalizeRiaText(message) {
  let text = String(message || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/(\d+(?:\.\d+)?)\s*k\b/g, (_, value) => String(Math.round(Number(value) * 1000)));

  const numberPhrases = [
    ["one thousand", "1000"],
    ["five hundred", "500"],
    ["three hundred", "300"],
    ["two hundred", "200"],
    ["one hundred", "100"],
    ["fifty", "50"]
  ];
  numberPhrases.forEach(([phrase, value]) => { text = text.replace(new RegExp(`\\b${phrase}\\b`, "g"), value); });
  RIA_TEXT_REPLACEMENTS.forEach(([pattern, replacement]) => { text = text.replace(pattern, replacement); });
  return text.replace(/,(?!\d{3}\b)/g, " ").replace(/[^a-z0-9,?+\-\s]/g, " ").replace(/\s+/g, " ").trim();
}

function numberNear(text, subjectPattern) {
  const before = text.match(new RegExp(`(?:^|\\s)(\\d{1,4}(?:,\\d{3})*)\\s*(?:x\\s*)?${subjectPattern}\\b`, "i"));
  const after = text.match(new RegExp(`\\b${subjectPattern}\\s*(?:x|:|to|of)?\\s*(\\d{1,4}(?:,\\d{3})*)`, "i"));
  return Number(String(before?.[1] || after?.[1] || "").replace(/,/g, "")) || null;
}

export function matchRiaKnowledgeTopic(message) {
  const text = normalizeRiaText(message);
  if (!text) return null;

  if (/\b(faqs?|frequently asked|common questions?|what can i ask|help center)\b/.test(text)) return "faq_menu";
  if (/\b(facebook|messenger|instagram|tiktok|youtube|social media|socials?|follow you|pages?)\b/.test(text)) return "socials";
  if (/\b(contact|contact number|phone|mobile|hotline|call|text|viber|email|e-mail|message you|reach you|talk to (?:someone|a person|your team))\b/.test(text)) return "contact";
  if (/\b(service areas?|areas? (?:do you )?(?:serve|cover)|where (?:do you )?(?:deliver|serve)|deliver to|location coverage|metro manila|cavite|laguna|tagaytay|parañaque|paranaque|las piñas|las pinas|makati|mandaluyong|pasay|pasig|quezon city|san juan|taguig|manila)\b/.test(text)) return "service_areas";
  if (/\b(late|lateness|on[ -]?time|delivery guarantee|refund|traffic|weather|venue access)\b/.test(text)) return "delivery_guarantee";
  if (/\b(rush|urgent|last minute|same day|tomorrow|asap)\b/.test(text)) return "rush_booking";
  if (/\b(downpayment|deposit|balance|cancel(?:lation|led|ing)?|reschedul(?:e|ed|ing)?|non[ -]?refundable|rental period|how many hours)\b/.test(text)) return "unpublished_policy";
  if (/\b(terms|conditions|polic(?:y|ies))\b/.test(text)) return "terms";
  if (/\b(quote|quotation|book|booking|reserve|reservation|availability|available|how (?:do|can) i rent|request|rent from you|place an order)\b/.test(text)) return "quotation";
  if (/\b(corporate|documents?|receipt|invoice|bir|dti|philgeps|business permit)\b/.test(text)) return "business_documents";
  if (/\b(sample estimate|estimate includes|delivery fee|setup fee|final price|extra charges?)\b/.test(text)) return "estimate_terms";
  if (/\b(chair covers?|table covers?|toppers?|runners?|linens?)\b/.test(text)) return "styling";
  if (/\b(fans?|air\s*coolers?|cooling|sqm|square meters?|power access)\b/.test(text)) return "cooling";
  if (/\b(what (?:do you|can i) rent|equipment|catalog|items?|products?|chairs?|tables?|tent|stanchion|carpet|television|smart tv|kiosk|prices?|how much|cost)\b/.test(text)) return "equipment";
  return null;
}

export function parseRiaMessage(message, current = {}) {
  const original = String(message || "").trim();
  const text = normalizeRiaText(original);
  const updates = {};
  const recognized = [];
  if (!text) return { intent: "empty", updates, recognized };

  if (/\b(start over|restart|reset|clear everything|new setup|ulit|from the beginning)\b/.test(text)) {
    return { intent: "reset", updates, recognized: ["reset"] };
  }

  const explicitPax = text.match(/\b(\d{1,4}(?:,\d{3})*)\s*(?:pax|people|guests?|persons?|attendees?|heads?|chairs?|seats?)\b/);
  const correctionPax = text.match(/\b(?:make it|change (?:it )?to|update (?:it )?to|instead|for)\s+(\d{1,4}(?:,\d{3})*)\b/);
  const bareNumber = text.match(/^\s*(\d{1,4}(?:,\d{3})*)\s*$/);
  const paxValue = Number(String(explicitPax?.[1] || correctionPax?.[1] || bareNumber?.[1] || "").replace(/,/g, "")) || null;
  if (paxValue) {
    updates.pax = paxValue;
    recognized.push("pax");
  }

  if (/\btiffany\b/.test(text)) {
    updates.chairType = "tiffany";
    recognized.push("chair type");
  } else if (/\b(monobloc|basic chairs?|regular chairs?|budget chairs?|cheapest chairs?)\b/.test(text)) {
    updates.chairType = "monobloc";
    recognized.push("chair type");
  }

  const noAllCovers = /\b(no|without|remove|skip)\s+(?:any\s+)?covers?\b|\bplain setup\b/.test(text);
  const withAllCovers = /\b(with|add|include|including|need|want)\s+(?:the\s+)?covers?\b/.test(text);
  if (noAllCovers) {
    updates.chairCover = false;
    updates.tableCover = false;
    recognized.push("covers");
  } else if (withAllCovers) {
    updates.chairCover = true;
    updates.tableCover = true;
    recognized.push("covers");
  }

  if (/\b(no|without|remove|skip)\s+chair\s+covers?\b/.test(text)) {
    updates.chairCover = false;
    recognized.push("chair covers");
  } else if (/\b(with|add|include|including)\s+(?:the\s+)?chair\s+covers?\b|\bchair\s+covers?\b/.test(text)) {
    updates.chairCover = true;
    recognized.push("chair covers");
  }

  if (/\b(no|without|remove|skip)\s+(?:table\s+)?(?:covers?|toppers?)\b/.test(text)) {
    updates.tableCover = false;
    recognized.push("table covers");
  } else if (/\b(with|add|include|including)\s+(?:the\s+)?(?:table\s+)?(?:covers?|toppers?)\b|\btable\s+(?:covers?|toppers?)\b/.test(text)) {
    updates.tableCover = true;
    recognized.push("table covers");
  }

  if (/\bspandex\b/.test(text)) {
    updates.chairCoverStyle = "spandex";
    updates.tableCoverStyle = "spandex";
    recognized.push("cover style");
  } else if (/\bkatrina\b/.test(text)) {
    updates.chairCoverStyle = "katrina";
    updates.tableCoverStyle = "katrina";
    recognized.push("cover style");
  }

  if (/\b(no|without|remove|skip)\s+(?:table\s+)?runners?\b|\bno covers (?:and|or) runners?\b/.test(text)) {
    updates.runners = false;
    recognized.push("runners");
  } else if (/\b(with|add|include|including)\s+(?:the\s+)?(?:table\s+)?runners?\b|\brunners?\b/.test(text)) {
    updates.runners = true;
    recognized.push("runners");
  }

  const fanQuantity = numberNear(text, "(?:industrial\\s+)?fans?");
  if (/\b(no|without|remove)\s+(?:industrial\s+)?fans?\b/.test(text)) {
    updates.fanQuantity = 0;
    recognized.push("fans");
  } else if (fanQuantity != null) {
    updates.fanQuantity = normalizeQuantity(fanQuantity);
    recognized.push("fans");
  } else if (/\b(add|include|with)\s+(?:an?\s+)?(?:industrial\s+)?fans?\b/.test(text)) {
    updates.fanQuantity = Math.max(1, normalizeQuantity(current.fanQuantity));
    recognized.push("fans");
  }

  const coolerQuantity = numberNear(text, "air\\s*coolers?");
  if (/\b(no|without|remove)\s+air\s*coolers?\b/.test(text)) {
    updates.coolerQuantity = 0;
    recognized.push("air coolers");
  } else if (coolerQuantity != null) {
    updates.coolerQuantity = normalizeQuantity(coolerQuantity);
    recognized.push("air coolers");
  } else if (/\b(add|include|with)\s+(?:an?\s+)?air\s*coolers?\b/.test(text)) {
    updates.coolerQuantity = Math.max(1, normalizeQuantity(current.coolerQuantity));
    recognized.push("air coolers");
  }

  if (/\b(?:chairs?|seats?|seating)\s+only\b|\bonly\s+(?:chairs?|seats?|seating)\b|\b(?:no|without|skip)\s+tables?\b|\bjust\s+(?:chairs?|seats?|seating)\b/.test(text)) {
    updates.preferredSetup = "chairs";
    recognized.push("chairs-only setup");
  } else if (/\b(round|circular)\s*(?:table|setup)?s?\b/.test(text)) {
    updates.preferredSetup = "round";
    recognized.push("round setup");
  } else if (/\b(long|rectangular|6\s*ft|6ft)\s*(?:table|setup)?s?\b/.test(text)) {
    updates.preferredSetup = "long";
    recognized.push("long setup");
  }

  let intent = "update";
  if (/\b(hi|hello|hey|good morning|good afternoon|good evening|kumusta|kamusta)\b/.test(text) && !recognized.length) intent = "greeting";
  else if (/\b(help|what can you do|options)\b/.test(text) && !recognized.length) intent = "help";
  else if (/\b(how much|price|cost|estimate|total)\b/.test(text)) intent = "price";
  else if (/\b(thank you|thanks|thankyou|salamat)\b/.test(text) && !recognized.length) intent = "gratitude";
  else if (/\b(bye|goodbye|see you)\b/.test(text) && !recognized.length) intent = "farewell";
  else if (/\b(go back|back|previous question|change my last answer)\b/.test(text) && !recognized.length) intent = "back";
  else if (/\b(what did i (?:choose|select)|what are my choices|my current setup|show my setup|summary)\b/.test(text) && !recognized.length) intent = "summary";
  else if (!recognized.length) intent = "unknown";

  return { intent, updates, recognized };
}
