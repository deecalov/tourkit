import { createMpTour, MP_KEY } from "./mpTour";
import "../src/styles/styles.css";

// Auto-resume of the multi-page tour: when the progress key is present the
// same tour definition starts and persistProgress restores the right step.
if (localStorage.getItem(MP_KEY) !== null) {
  void createMpTour().start();
}
