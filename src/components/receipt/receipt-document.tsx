type ReceiptItem = {
  name: string;
  quantity: number;
  plateNumber?: string;
};

export function ReceiptDocument({
  title,
  referenceId,
  status,
  date,
  operatorName,
  contactPhone,
  contactEmail,
  ownerCompanyName,
  borrowerCompanyName,
  dueDate,
  note,
  evidenceImage,
  items,
}: {
  title: string;
  referenceId: string;
  status: string;
  date: string;
  operatorName: string;
  contactPhone?: string;
  contactEmail?: string;
  ownerCompanyName?: string;
  borrowerCompanyName?: string;
  dueDate?: string;
  note?: string;
  evidenceImage?: string;
  items: ReceiptItem[];
}) {
  const formatDate = (value?: string) => {
    if (!value) return "-";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
  };
  const totalQuantity = items.reduce((total, item) => total + item.quantity, 0);

  return (
    <div style={{ background: "#ffffff", color: "#0f172a", padding: 24, borderRadius: 20, fontFamily: "var(--font-kanit), Kanit, Arial, sans-serif" }}>
      <div style={{ textAlign: "center", borderBottom: "2px solid #2563eb", paddingBottom: 16 }}>
        <div style={{ display: "inline-flex", width: 48, height: 48, borderRadius: 15, background: "#1d4ed8", color: "#ffffff", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>TEMS</div>
        <h2 style={{ margin: "12px 0 4px", fontSize: 19 }}>{title}</h2>
        <p style={{ margin: 0, color: "#64748b", fontSize: 11 }}>Tactical Equipment Management System</p>
      </div>

      <div style={{ display: "grid", gap: 9, marginTop: 18, fontSize: 13 }}>
        <p style={{ margin: 0 }}><strong>เลขที่เอกสาร:</strong> {referenceId}</p>
        <p style={{ margin: 0 }}><strong>สถานะ:</strong> {status}</p>
        <p style={{ margin: 0 }}><strong>วันที่ทำรายการ:</strong> {formatDate(date)}</p>
        <p style={{ margin: 0 }}><strong>ผู้ทำรายการ:</strong> {operatorName || "-"}</p>
        {(contactPhone || contactEmail) && (
          <div style={{ marginTop: 2, borderRadius: 12, background: "#f8fafc", padding: 12 }}>
            <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700 }}>ช่องทางการติดต่อ</p>
            <p style={{ margin: "0 0 4px", fontSize: 12 }}><strong>เบอร์โทร:</strong> {contactPhone || "-"}</p>
            <p style={{ margin: 0, fontSize: 12 }}><strong>อีเมล:</strong> {contactEmail || "-"}</p>
          </div>
        )}
        {ownerCompanyName && <p style={{ margin: 0 }}><strong>หน่วยต้นทาง:</strong> {ownerCompanyName}</p>}
        {borrowerCompanyName && <p style={{ margin: 0 }}><strong>หน่วยปลายทาง:</strong> {borrowerCompanyName}</p>}
        {dueDate && <p style={{ margin: 0, color: "#b91c1c" }}><strong>กำหนดส่งคืน:</strong> {formatDate(dueDate)}</p>}
      </div>

      <div style={{ marginTop: 18, borderTop: "1px solid #cbd5e1", paddingTop: 14 }}>
        <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700 }}>รายการยุทโธปกรณ์</p>
        {items.map((item, index) => (
          <div key={`${item.name}-${item.plateNumber || index}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid #e2e8f0", fontSize: 12 }}>
            <span>{index + 1}. {item.name}{item.plateNumber ? ` ทะเบียน ${item.plateNumber}` : ""}</span>
            <strong>{item.quantity.toLocaleString("th-TH")}</strong>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, fontSize: 13 }}><strong>รวมทั้งหมด</strong><strong>{totalQuantity.toLocaleString("th-TH")} รายการ</strong></div>
      </div>

      <div style={{ marginTop: 16, borderRadius: 12, background: "#f8fafc", padding: 12, fontSize: 12 }}><strong>หมายเหตุ:</strong> {note?.trim() || "-"}</div>
      {evidenceImage?.startsWith("data:image/") && (
        <div style={{ marginTop: 16 }}>
          <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700 }}>ภาพหลักฐานประกอบรายการ</p>
          <div style={{ height: 180, borderRadius: 12, border: "1px solid #cbd5e1", backgroundImage: `url(${evidenceImage})`, backgroundPosition: "center", backgroundRepeat: "no-repeat", backgroundSize: "contain", backgroundColor: "#f8fafc" }} />
        </div>
      )}
      <p style={{ margin: "20px 0 0", textAlign: "center", color: "#64748b", fontSize: 10 }}>เอกสารนี้สร้างโดยระบบ TEMS โดยอัตโนมัติ</p>
    </div>
  );
}

