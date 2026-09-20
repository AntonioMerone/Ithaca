// A modal occupies one history entry, so device Back closes it before leaving
// the current list. Environment injection keeps the navigation logic testable.
export function createModalHistory(environment, onBack) {
  let tracked = false;
  let closing = false;
  let afterClose = null;
  let baseState = null;
  environment.addEventListener("popstate", () => {
    if (closing) {
      closing = false;
      const callback = afterClose;
      afterClose = null;
      callback?.();
    } else if (tracked) {
      tracked = false;
      onBack();
    } else if (environment.history.state?.ithacaModal) {
      environment.history.replaceState(baseState, "", environment.location.href);
    }
  });
  return {
    open() {
      if (tracked) return;
      baseState = environment.history.state;
      environment.history.pushState({ ...baseState, ithacaModal: true }, "", environment.location.href);
      tracked = true;
    },
    close(callback) {
      if (tracked && environment.history.state?.ithacaModal) {
        tracked = false;
        closing = true;
        afterClose = callback;
        environment.history.back();
      } else {
        tracked = false;
        callback?.();
      }
    }
  };
}
