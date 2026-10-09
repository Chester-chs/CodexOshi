exports.visibility = win => {
  let shown=false;
  return state => {
    const next=!!(state.ready && state.hostAlive && state.visible && state.attached && !state.modal);
    if (next===shown) return;
    shown=next;
    if (shown) win.showInactive(); else win.hide();
  };
};
