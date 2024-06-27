export default (): number =>
  "performance" in window ? performance.now() : Date.now();
