"use client";

import { useEffect, useState } from "react";

// Lightweight patient-portal i18n (EN / FR / AR). Persisted to localStorage so the
// choice also reaches the PDF download. Arabic renders right-to-left in the web UI.
export type Lang = "en" | "fr" | "ar";

export const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "fr", label: "FR" },
  { code: "ar", label: "ع" },
];

const KEY = "patientLang";

export function getLang(): Lang {
  if (typeof window === "undefined") return "en";
  const v = localStorage.getItem(KEY);
  return v === "fr" || v === "ar" ? v : "en";
}

export function useLang(): [Lang, (l: Lang) => void] {
  const [lang, setState] = useState<Lang>("en");
  useEffect(() => {
    setState(getLang());
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setState(getLang());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const setLang = (l: Lang) => {
    if (typeof window !== "undefined") localStorage.setItem(KEY, l);
    setState(l);
  };
  return [lang, setLang];
}

export const isRTL = (l: Lang) => l === "ar";

type Dict = Record<string, string>;

export const PATIENT_T: Record<Lang, Dict> = {
  en: {
    historyTitle: "Your scan history",
    historySub: "Tap a scan to review the full result — always confirm with your oncologist",
    trendTitle: "Your results over time",
    trendSub: "AI confidence for each scan — a guide for your conversations, not a diagnosis.",
    confidence: "Confidence",
    review: "Review full scan",
    hide: "Hide",
    none: "No scans yet — upload one to get started",
    download: "Download PDF report",
    language: "Language",
    luminalAdvisory:
      "This result suggests hormone-sensitivity. Hormone therapy is often an option — discuss with your oncologist.",
    nonLuminalAdvisory:
      "Less hormone-sensitive. Your oncologist will advise on the most appropriate treatment path.",
  },
  fr: {
    historyTitle: "Historique de vos examens",
    historySub:
      "Touchez un examen pour voir le résultat complet — confirmez toujours avec votre oncologue",
    trendTitle: "Vos résultats au fil du temps",
    trendSub:
      "Confiance de l'IA pour chaque examen — un repère pour vos échanges, pas un diagnostic.",
    confidence: "Confiance",
    review: "Voir l'examen complet",
    hide: "Masquer",
    none: "Aucun examen pour l'instant — importez-en un pour commencer",
    download: "Télécharger le rapport PDF",
    language: "Langue",
    luminalAdvisory:
      "Ce résultat suggère une sensibilité hormonale. Une hormonothérapie est souvent envisageable — à discuter avec votre oncologue.",
    nonLuminalAdvisory:
      "Moins sensible aux hormones. Votre oncologue vous conseillera le traitement le plus adapté.",
  },
  ar: {
    historyTitle: "سجل فحوصاتك",
    historySub: "اضغط على فحص لعرض النتيجة كاملة — تأكد دائمًا مع طبيب الأورام",
    trendTitle: "نتائجك عبر الزمن",
    trendSub: "ثقة الذكاء الاصطناعي لكل فحص — دليل لمحادثاتك، وليس تشخيصًا.",
    confidence: "الثقة",
    review: "مراجعة الفحص كاملًا",
    hide: "إخفاء",
    none: "لا توجد فحوصات بعد — ارفع فحصًا للبدء",
    download: "تنزيل تقرير PDF",
    language: "اللغة",
    luminalAdvisory:
      "تشير هذه النتيجة إلى حساسية هرمونية. غالبًا ما يكون العلاج الهرموني خيارًا — ناقش ذلك مع طبيب الأورام.",
    nonLuminalAdvisory:
      "أقل حساسية للهرمونات. سينصحك طبيب الأورام بالمسار العلاجي الأنسب.",
  },
};
