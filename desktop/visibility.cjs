exports.visibility = win => {
  let shown=false;
  return state => {
    const next=!!(state.ready && state.hostAlive && state.visible && state.attached && !state.modal && state.active!==false);
    // Native owner-window transitions and watchdog hides can bypass this closure.
    if (next===shown && win.isVisible()===next) return;
    shown=next;
    if (shown) win.showInactive(); else win.hide();
  };
};
