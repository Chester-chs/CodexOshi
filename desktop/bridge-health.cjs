// Start this clock when the pipe is listening, after cold initialization.
// Temporary missed heartbeats hide the window but keep its renderer available.
exports.bridgeHealth = (now = () => performance.now()) => {
  const started = now(); let last = null;
  return {
    received() { last = now(); },
    check() {
      const age = now() - (last ?? started);
      if (age > 30000) return 'expired';
      if (last === null) return 'starting';
      return age > 3500 ? 'stale' : 'healthy';
    }
  };
};
