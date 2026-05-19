"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUBTYPE_CLINICAL = exports.SUBTYPE_PLAIN = exports.SUBTYPES = void 0;
exports.SUBTYPES = ["Luminal A", "Luminal B", "HER2", "Triple Negative"];
exports.SUBTYPE_PLAIN = {
    "Luminal A": "Most common — typically slower-growing and hormone-sensitive",
    "Luminal B": "Hormone-sensitive but tends to grow faster than Luminal A",
    "HER2": "Tests positive for HER2 protein — targeted therapies available",
    "Triple Negative": "Negative for three receptors — typically treated with chemotherapy",
};
exports.SUBTYPE_CLINICAL = {
    "Luminal A": "ER+/PR+, HER2−, low Ki-67",
    "Luminal B": "ER+/PR+, HER2±, high Ki-67",
    "HER2": "ER−/PR−, HER2+",
    "Triple Negative": "ER−/PR−, HER2−",
};
//# sourceMappingURL=index.js.map