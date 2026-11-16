/**
 * Ready-made label sets: `createTour({ labels: ru })`.
 * The same object localizes the hints entry — `createHints({ labels: ru })`
 * reads `hintDismiss` from it.
 * Tree-shakable entry — only imported locales end up in the bundle.
 * `ar` pairs with the RTL-aware placement logic (set `dir="rtl"` on the page).
 *
 * Script-tag consumers get them all on `window.TourKitLocales`
 * (`dist/locales.global.js`).
 */
import type { Labels } from "../core/types";

export const ru: Labels = {
  next: "Далее",
  back: "Назад",
  done: "Готово",
  skip: "Закрыть",
  stepOf: "{step} из {total}",
  stepAnnouncement: "Шаг {step} из {total}",
  dontShowAgain: "Больше не показывать",
  hintDismiss: "Понятно",
};

export const de: Labels = {
  next: "Weiter",
  back: "Zurück",
  done: "Fertig",
  skip: "Schließen",
  stepOf: "{step} von {total}",
  stepAnnouncement: "Schritt {step} von {total}",
  dontShowAgain: "Nicht mehr anzeigen",
  hintDismiss: "Verstanden",
};

export const es: Labels = {
  next: "Siguiente",
  back: "Atrás",
  done: "Listo",
  skip: "Cerrar",
  stepOf: "{step} de {total}",
  stepAnnouncement: "Paso {step} de {total}",
  dontShowAgain: "No mostrar de nuevo",
  hintDismiss: "Entendido",
};

export const fr: Labels = {
  next: "Suivant",
  back: "Retour",
  done: "Terminé",
  skip: "Fermer",
  stepOf: "{step} sur {total}",
  stepAnnouncement: "Étape {step} sur {total}",
  dontShowAgain: "Ne plus afficher",
  hintDismiss: "Compris",
};

export const ar: Labels = {
  next: "التالي",
  back: "السابق",
  done: "تم",
  skip: "إغلاق",
  stepOf: "{step} من {total}",
  stepAnnouncement: "الخطوة {step} من {total}",
  dontShowAgain: "عدم الإظهار مرة أخرى",
  hintDismiss: "فهمت",
};

export const it: Labels = {
  next: "Avanti",
  back: "Indietro",
  done: "Fatto",
  skip: "Chiudi",
  stepOf: "{step} di {total}",
  stepAnnouncement: "Passo {step} di {total}",
  dontShowAgain: "Non mostrare più",
  hintDismiss: "Ho capito",
};

export const pl: Labels = {
  next: "Dalej",
  back: "Wstecz",
  done: "Gotowe",
  skip: "Zamknij",
  stepOf: "{step} z {total}",
  stepAnnouncement: "Krok {step} z {total}",
  dontShowAgain: "Nie pokazuj ponownie",
  hintDismiss: "Rozumiem",
};

/** Portuguese (Brazil). */
export const ptBR: Labels = {
  next: "Próximo",
  back: "Voltar",
  done: "Concluir",
  skip: "Fechar",
  stepOf: "{step} de {total}",
  stepAnnouncement: "Etapa {step} de {total}",
  dontShowAgain: "Não mostrar novamente",
  hintDismiss: "Entendi",
};

export const tr: Labels = {
  next: "İleri",
  back: "Geri",
  done: "Bitti",
  skip: "Kapat",
  stepOf: "{total} adımdan {step}. adım",
  stepAnnouncement: "Adım {step} / {total}",
  dontShowAgain: "Bir daha gösterme",
  hintDismiss: "Anladım",
};

export const ja: Labels = {
  next: "次へ",
  back: "戻る",
  done: "完了",
  skip: "閉じる",
  stepOf: "{total} 件中 {step} 件目",
  stepAnnouncement: "ステップ {step} / {total}",
  dontShowAgain: "今後表示しない",
  hintDismiss: "わかりました",
};

/** Chinese (Simplified). */
export const zhCN: Labels = {
  next: "下一步",
  back: "上一步",
  done: "完成",
  skip: "关闭",
  stepOf: "第 {step} 步，共 {total} 步",
  stepAnnouncement: "第 {step} 步，共 {total} 步",
  dontShowAgain: "不再显示",
  hintDismiss: "知道了",
};
