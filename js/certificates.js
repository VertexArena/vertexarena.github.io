export function enableCertificateDragging(root) {
  const field = root.querySelector(".certificate-field");
  if (!field) return;
  let active = false;
  let startX = 0;
  let startY = 0;
  let baseX = 0;
  let baseY = 0;
  field.addEventListener("pointerdown", (event) => {
    active = true;
    field.setPointerCapture(event.pointerId);
    startX = event.clientX;
    startY = event.clientY;
    baseX = field.offsetLeft;
    baseY = field.offsetTop;
  });
  field.addEventListener("pointermove", (event) => {
    if (!active) return;
    const parent = field.parentElement.getBoundingClientRect();
    const nextX = Math.max(0, Math.min(parent.width - field.offsetWidth, baseX + event.clientX - startX));
    const nextY = Math.max(0, Math.min(parent.height - field.offsetHeight, baseY + event.clientY - startY));
    field.style.left = `${nextX}px`;
    field.style.top = `${nextY}px`;
  });
  field.addEventListener("pointerup", () => { active = false; });
}

export function renderCertificatePreview(canvas, values = {}) {
  const ctx = canvas.getContext("2d");
  canvas.width = 1400;
  canvas.height = 990;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#dbeafe");
  gradient.addColorStop(1, "#ccfbf1");
  ctx.fillStyle = gradient;
  ctx.fillRect(42, 42, canvas.width - 84, canvas.height - 84);
  ctx.fillStyle = "#0f172a";
  ctx.font = "700 64px Geist, Inter, sans-serif";
  ctx.fillText("Certificate of Achievement", 118, 180);
  ctx.font = "500 34px Geist, Inter, sans-serif";
  ctx.fillText("Awarded to", 118, 310);
  ctx.font = "800 86px Geist, Inter, sans-serif";
  ctx.fillText(values.name || "Aarav Mehta", 118, 430);
  ctx.font = "500 32px Geist, Inter, sans-serif";
  ctx.fillText(values.placement || "Top 100 Qualifier", 118, 520);
  ctx.fillText(values.category || "Programming", 118, 575);
  return canvas.toDataURL("image/png");
}
