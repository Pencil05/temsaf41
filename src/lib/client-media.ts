export async function compressImageForSheet(file: File) {
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new window.Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("ไม่สามารถอ่านรูปภาพได้"));
      element.src = sourceUrl;
    });
    let scale = Math.min(1, 720 / Math.max(image.naturalWidth, image.naturalHeight));
    let quality = 0.78;
    let dataUrl = "";

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("ไม่สามารถประมวลผลรูปภาพได้");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (dataUrl.length <= 42_000) return dataUrl;
      quality = Math.max(0.42, quality - 0.08);
      scale *= 0.82;
    }

    throw new Error("รูปภาพมีรายละเอียดสูงเกินไป กรุณาเลือกรูปอื่น");
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export async function receiptCanvas(element: HTMLElement) {
  const { default: html2canvas } = await import("html2canvas");
  return html2canvas(element, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
}

export async function createReceiptImageFile(element: HTMLElement, filename: string) {
  const canvas = await receiptCanvas(element);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
  if (!blob) throw new Error("ไม่สามารถสร้างรูปใบเสร็จได้");
  return new File([blob], filename, { type: "image/jpeg" });
}

export function sharePreparedReceipt(file: File, text: string) {
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    const sharePromise = navigator.share({ title: "TEMS Digital Receipt", text, files: [file] });
    return sharePromise.then(() => "shared" as const);
  }

  const link = document.createElement("a");
  link.download = file.name;
  link.href = URL.createObjectURL(file);
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  return Promise.resolve("downloaded" as const);
}
