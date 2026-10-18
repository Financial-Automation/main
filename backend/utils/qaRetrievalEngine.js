/**
 * SaaISS SHREE ANDAL AI — Hybrid Q&A Retrieval Engine
 * 
 * Performs normalized keyword, token overlap, synonym mapping, and semantic ranking
 * across the structured Application Q&A Knowledge Base.
 */

import { APPLICATION_QA_KNOWLEDGE_BASE } from "../data/applicationQaKnowledgeBase.js";

const STOPWORDS = new Set([
  "a", "about", "an", "and", "are", "as", "at", "be", "by", "can", "could", "do", "does",
  "for", "from", "how", "i", "in", "is", "it", "me", "my", "of", "on", "or", "so", "teach",
  "tell", "the", "this", "to", "was", "we", "what", "where", "which", "who", "why", "will",
  "with", "would", "you", "your"
]);

const SYNONYM_MAP = {
  bill: "invoice",
  bills: "invoices",
  make: "create",
  generate: "create",
  issue: "create",
  creating: "create",
  creation: "create",
  check: "view",
  find: "view",
  reopen: "view",
  see: "view",
  locate: "view",
  pdf: "print",
  download: "print",
  printing: "print",
  paying: "payment",
  paid: "payment",
  pay: "payment",
  settlement: "payment",
  settle: "payment",
  apply: "payment",
  vendor: "supplier",
  client: "customer",
  stock: "inventory",
  products: "inventory",
  ledger: "bookkeeping",
  forecast: "prediction",
  tax: "gst",
  taxes: "gst",
  error: "troubleshoot",
  fail: "troubleshoot",
  failing: "troubleshoot",
  diff: "difference"
};

/**
 * Normalizes input string for search.
 */
export const normalizeText = (text = "") => {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

/**
 * Tokenizes and applies stopword filtering & synonym normalization.
 */
export const tokenizeText = (text = "") => {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const rawTokens = normalized.split(" ");
  return rawTokens
    .map((token) => SYNONYM_MAP[token] || token)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
};

/**
 * Calculates Jaccard similarity and containment ratio between two token sets.
 */
const calculateTokenSimilarity = (queryTokens, targetTokens) => {
  if (!queryTokens.length || !targetTokens.length) return 0;

  const querySet = new Set(queryTokens);
  const targetSet = new Set(targetTokens);

  let intersectionCount = 0;
  for (const t of querySet) {
    if (targetSet.has(t)) {
      intersectionCount += 1;
    }
  }

  // Jaccard similarity
  const unionSize = new Set([...queryTokens, ...targetTokens]).size;
  const jaccard = unionSize > 0 ? intersectionCount / unionSize : 0;

  // Containment in target (how much of user query is present in target question)
  const containment = intersectionCount / queryTokens.length;

  // Blended similarity with higher weight on containment
  return jaccard * 0.4 + containment * 0.6;
};

/**
 * Retrieves the best matching Q&A records from the knowledge base.
 * 
 * @param {string} userQuestion - The user's query
 * @param {object} options - Configuration options { threshold, limit }
 * @returns {object} { bestMatch, matches, confidence }
 */
export const retrieveKnowledge = (userQuestion = "", options = {}) => {
  const { threshold = 0.32, limit = 3 } = options;
  const rawQuery = String(userQuestion || "").trim();
  const normalizedQuery = normalizeText(rawQuery);
  const queryTokens = tokenizeText(rawQuery);

  if (!normalizedQuery || queryTokens.length === 0) {
    return { bestMatch: null, matches: [], confidence: "none" };
  }

  const scoredRecords = [];

  for (const record of APPLICATION_QA_KNOWLEDGE_BASE) {
    let maxScore = 0;
    let matchedPhrase = "";

    const isLiveCompanyMetricQuery = /\b(my|this month|last month|current|this quarter|this year|today|how much do i|how much does|how much did|show my|what is my)\b/i.test(normalizedQuery);
    const isMetricConceptRecord = ["qa_total_payables", "qa_total_receivables", "qa_revenue", "qa_expenses", "qa_net_profit"].includes(record.id);

    // Skip conceptual records when user is asking for their live business metric
    if (isLiveCompanyMetricQuery && isMetricConceptRecord) {
      continue;
    }

    // Skip dashboard discrepancy record unless query explicitly mentions discrepancy/mismatch/different
    if (record.id === "qa_dashboard_ai_discrepancy" && !/\b(different|mismatch|not match|discrepanc|conflict|disagree)\b/i.test(normalizedQuery)) {
      continue;
    }

    // 1. Check exact match on Canonical Question
    const normCanonical = normalizeText(record.canonicalQuestion);
    if (normCanonical === normalizedQuery) {
      maxScore = 1.0;
      matchedPhrase = record.canonicalQuestion;
    } else {
      const canonicalTokens = tokenizeText(record.canonicalQuestion);
      const canonicalSim = calculateTokenSimilarity(queryTokens, canonicalTokens);
      if (canonicalSim > maxScore) {
        maxScore = canonicalSim;
        matchedPhrase = record.canonicalQuestion;
      }
    }

    // 2. Check Alternative Questions
    for (const alt of record.alternativeQuestions || []) {
      const normAlt = normalizeText(alt);
      if (normAlt === normalizedQuery) {
        maxScore = 1.0;
        matchedPhrase = alt;
        break;
      }

      // Substring check
      if (normalizedQuery.includes(normAlt) || normAlt.includes(normalizedQuery)) {
        const subScore = 0.92;
        if (subScore > maxScore) {
          maxScore = subScore;
          matchedPhrase = alt;
        }
      }

      const altTokens = tokenizeText(alt);
      const altSim = calculateTokenSimilarity(queryTokens, altTokens);
      if (altSim > maxScore) {
        maxScore = altSim;
        matchedPhrase = alt;
      }
    }

    // 3. Domain boost for specific distinctive terms
    if (
      record.id === "qa_invoice_creation" &&
      /\b(invoice creation|how does invoice creation work|explain invoice process)\b/i.test(normalizedQuery)
    ) {
      maxScore = Math.max(maxScore, 0.95);
    } else if (
      record.id === "qa_sales_invoice_create" &&
      /\b(sales invoice|bill a customer|make a bill for my customer|record a sale|sales bill)\b/i.test(normalizedQuery)
    ) {
      maxScore = Math.max(maxScore, 0.95);
    } else if (
      record.id === "qa_purchase_invoice_create" &&
      /\b(purchase invoice|supplier bill|purchase bill|goods purchased|record a purchase)\b/i.test(normalizedQuery)
    ) {
      maxScore = Math.max(maxScore, 0.95);
    } else if (
      record.id === "qa_find_saved_invoice" &&
      /\b(find a saved invoice|where can i see my invoices|check invoice history|reopen.*invoice)\b/i.test(normalizedQuery)
    ) {
      maxScore = Math.max(maxScore, 0.95);
    } else if (
      record.id === "qa_print_download_invoice" &&
      /\b(print.*invoice|download.*invoice|invoice pdf|print a bill)\b/i.test(normalizedQuery)
    ) {
      maxScore = Math.max(maxScore, 0.95);
    } else if (
      record.id === "qa_invoice_payment" &&
      /\b(apply.*payment|record.*payment|invoice payment|how does amount paid work)\b/i.test(normalizedQuery)
    ) {
      maxScore = Math.max(maxScore, 0.95);
    } else if (
      record.id === "qa_sales_vs_purchase_invoice" &&
      /\b(sales invoice vs purchase invoice|difference between sales and purchase|which invoice should i use)\b/i.test(normalizedQuery)
    ) {
      maxScore = Math.max(maxScore, 0.95);
    } else if (
      record.id === "qa_total_payables" &&
      /\b(what is total payables|explain accounts payable|what does total payables mean|total payables card)\b/i.test(normalizedQuery) &&
      !/\b(show|current|my total payables this month|calculate.*and show)\b/i.test(normalizedQuery)
    ) {
      maxScore = Math.max(maxScore, 0.90);
    } else if (
      record.id === "qa_total_receivables" &&
      /\b(what is total receivables|explain accounts receivable|what does total receivables mean)\b/i.test(normalizedQuery) &&
      !/\b(show|current|my total receivables this month)\b/i.test(normalizedQuery)
    ) {
      maxScore = Math.max(maxScore, 0.90);
    } else if (
      record.id === "qa_revenue" &&
      /\b(what is revenue|explain revenue|revenue card)\b/i.test(normalizedQuery) &&
      !/\b(what is my revenue|show my revenue)\b/i.test(normalizedQuery)
    ) {
      maxScore = Math.max(maxScore, 0.90);
    } else if (
      record.id === "qa_expenses" &&
      /\b(what are expenses|explain business expenses|expenses metric)\b/i.test(normalizedQuery) &&
      !/\b(what are my expenses|how much did i spend)\b/i.test(normalizedQuery)
    ) {
      maxScore = Math.max(maxScore, 0.90);
    } else if (
      record.id === "qa_net_profit" &&
      /\b(what is net profit|explain net profit|net profit metric)\b/i.test(normalizedQuery) &&
      !/\b(what is my net profit|how much profit did my business make)\b/i.test(normalizedQuery)
    ) {
      maxScore = Math.max(maxScore, 0.90);
    } else if (
      record.id === "qa_dashboard_ai_discrepancy" &&
      /\b(different amounts|not match|mismatch|different financial value|dashboard and ai)\b/i.test(normalizedQuery)
    ) {
      maxScore = Math.max(maxScore, 0.95);
    } else if (
      record.id === "qa_inventory" &&
      /\b(how does inventory work|check my stock|manage products|stock management)\b/i.test(normalizedQuery)
    ) {
      maxScore = Math.max(maxScore, 0.95);
    } else if (
      record.id === "qa_bookkeeping" &&
      /\b(how does bookkeeping work|explain bookkeeping|organize financial transactions)\b/i.test(normalizedQuery)
    ) {
      maxScore = Math.max(maxScore, 0.95);
    } else if (
      record.id === "qa_profit_loss" &&
      /\b(view.*profit and loss|profit and loss report|p&l report|income statement)\b/i.test(normalizedQuery)
    ) {
      maxScore = Math.max(maxScore, 0.95);
    } else if (
      record.id === "qa_cash_flow" &&
      /\b(cash flow prediction|how does cash flow work|cash flow statement)\b/i.test(normalizedQuery)
    ) {
      maxScore = Math.max(maxScore, 0.95);
    } else if (
      record.id === "qa_gst_tax" &&
      /\b(gst or tax|tax features|tax calculation work|gst in an invoice)\b/i.test(normalizedQuery)
    ) {
      maxScore = Math.max(maxScore, 0.95);
    } else if (
      record.id === "qa_troubleshooting" &&
      /\b(invoice.*not saving|why is my invoice not saving|pdf.*incorrect|payment.*not updating|troubleshoot)\b/i.test(normalizedQuery)
    ) {
      maxScore = Math.max(maxScore, 0.95);
    }

    if (maxScore >= threshold) {
      scoredRecords.push({
        record,
        score: Math.round(maxScore * 100) / 100,
        matchedPhrase
      });
    }
  }

  // Sort descending by score
  scoredRecords.sort((a, b) => b.score - a.score);

  const topMatches = scoredRecords.slice(0, limit);
  const best = topMatches[0] || null;

  let confidence = "none";
  if (best) {
    if (best.score >= 0.8) confidence = "high";
    else if (best.score >= 0.5) confidence = "medium";
    else confidence = "low";
  }

  return {
    bestMatch: best ? best.record : null,
    score: best ? best.score : 0,
    confidence,
    matches: topMatches.map((m) => ({
      id: m.record.id,
      canonicalQuestion: m.record.canonicalQuestion,
      category: m.record.category,
      score: m.score,
      matchedPhrase: m.matchedPhrase
    }))
  };
};

/**
 * Formats a retrieved Q&A record into clear, structured Markdown.
 */
export const formatQaAnswer = (record) => {
  if (!record) return "";
  if (record.id === "qa_invoice_creation" || record.canonicalQuestion === "Explain how invoice creation works.") {
    return record.answer;
  }

  const steps = record.navigationSteps && record.navigationSteps.length > 0
    ? `\n\n**Verified Navigation Steps:**\n` + record.navigationSteps.map((s, idx) => `${idx + 1}. ${s}`).join("\n")
    : "";

  return (
    `### ${record.canonicalQuestion}\n\n` +
    (record.module ? `**Module:** ${record.module} (\`${record.route}\`)\n\n` : "") +
    record.answer +
    steps
  );
};
